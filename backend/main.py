import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

import lyzr_client
from pdf_render import render_pdf_to_jpegs, render_tiff_to_jpegs
from response_parser import parse_agent_output
from outlook import database
from outlook import worker as outlook_worker
from outlook.superflow_router import router as outlook_superflow_router
from outlook.invoices_router import router as outlook_invoices_router
from outlook.auth_router import router as outlook_auth_router
from outlook.kpis_router import router as outlook_kpis_router

load_dotenv()

# Without this, Python's logging module has no configured handler in this
# process, so every logger.info() call anywhere in outlook/* (worker
# startup, per-message processing) is silently dropped - only WARNING+
# reaches the console via the default fallback handler. Was previously
# only set when outlook/worker.py ran standalone (its own __main__ block);
# now that it's embedded here (see lifespan below), this process needs its
# own logging config.
logging.basicConfig(level=logging.INFO)

ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "application/pdf", "image/tiff"}

# Applied per-file, before any rasterization work - a scanned TIFF in
# particular can be tens of MB, and there's otherwise no size limit
# anywhere in this path (the 60s httpx timeout on the Lyzr calls is the
# only other backstop, and hitting that surfaces as an unhelpful generic
# 502 instead of a clear "too large" message).
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs the outlook/worker.py SQS-consumer loop as a background thread in
    # this same process, instead of a separate service/container - see
    # worker.run_forever's own docstring for why it's a thread (not an
    # asyncio task) and why a missing/unreachable queue logs rather than
    # crashing the whole backend on startup.
    stop_worker = outlook_worker.start_background_thread()
    yield
    stop_worker.set()


app = FastAPI(title="Lyzr OCR Proxy", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(outlook_superflow_router)
app.include_router(outlook_invoices_router)
app.include_router(outlook_auth_router)
app.include_router(outlook_kpis_router)


async def pages_from_upload(file: UploadFile) -> list[bytes]:
    """Turn one uploaded file into an ordered list of page-JPEGs: a PDF or
    TIFF becomes one JPEG per page/frame (a TIFF can just as easily be a
    multi-page scan as a PDF - see pdf_render.render_tiff_to_jpegs), a
    plain image becomes a single-element list."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}. Use PNG, JPG, PDF, or TIFF.")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            400,
            f"'{file.filename}' is {len(file_bytes) / 1024 / 1024:.1f} MB, "
            f"over the {MAX_FILE_SIZE_BYTES // 1024 // 1024} MB limit.",
        )

    if file.content_type == "application/pdf":
        pages = render_pdf_to_jpegs(file_bytes)
    elif file.content_type == "image/tiff":
        pages = render_tiff_to_jpegs(file_bytes)
    else:
        return [file_bytes]

    if not pages:
        raise HTTPException(400, f"'{file.filename}' has no pages to extract.")
    return pages


@app.post("/api/ocr")
async def extract_text(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(400, "No files uploaded.")

    page_images: list[bytes] = []
    for file in files:
        page_images.extend(await pages_from_upload(file))

    session_id = str(uuid.uuid4())
    headers = lyzr_client.auth_headers()

    async with httpx.AsyncClient(timeout=60) as client:
        asset_ids = list(
            await asyncio.gather(
                *(
                    lyzr_client.upload_page_asset(client, headers, index, image_bytes)
                    for index, image_bytes in enumerate(page_images)
                )
            )
        )
        raw_value = await lyzr_client.run_chat_inference(client, headers, session_id, asset_ids)

    # raw_agent_text carries the agent's reply verbatim, before
    # parse_agent_output's unwrap/repair passes touch it - callers that want
    # to log/debug exactly what the agent said (see outlook/processor.py's
    # ProcessingEvent logging) need this, since the parsed fields alone
    # don't show what the raw reply looked like when parsing had to recover
    # from something malformed.
    return {**parse_agent_output(raw_value), "session_id": session_id, "raw_agent_text": raw_value}


def _check_db() -> None:
    with database.get_session() as session:
        session.execute(text("SELECT 1"))


@app.get("/api/health")
async def health():
    # Runs the (blocking) SQLAlchemy call in a thread rather than directly
    # on the event loop - this endpoint is hit every few seconds by the ECS/
    # Docker healthcheck, so it shouldn't itself become a source of latency
    # spikes for real requests sharing the same loop.
    try:
        await asyncio.to_thread(_check_db)
    except Exception as exc:
        raise HTTPException(503, f"Database unreachable: {exc}")
    return {"status": "ok"}
