"""Thin client for the two Lyzr HTTP calls this app needs: uploading a page
image as an asset, and running chat inference over a set of assets.
"""

import os

import httpx
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()

LYZR_BASE_URL = os.environ.get("LYZR_BASE_URL", "https://agent-prod.studio.lyzr.ai")
LYZR_API_KEY = os.environ["LYZR_API_KEY"]
LYZR_AGENT_ID = os.environ["LYZR_AGENT_ID"]
LYZR_USER_ID = os.environ.get("LYZR_USER_ID", "ocr-web-app")

OCR_INSTRUCTION = "Extract the invoice data from this document."

ASSET_UPLOAD_PARAMS = {
    "parser_provider": "lyzr_parse",
    "parsing_mode": "full",
    "enable_vlm": "false",
    "vlm_provider": "openai",
    "vlm_model": "gpt-4o",
    "extract_tables": "true",
    "describe_images": "false",
    "chunking_strategy": "hybrid",
}


def auth_headers() -> dict:
    return {"x-api-key": LYZR_API_KEY}


async def upload_page_asset(client: httpx.AsyncClient, headers: dict, index: int, image_bytes: bytes) -> str:
    resp = await client.post(
        f"{LYZR_BASE_URL}/v3/assets/upload",
        params=ASSET_UPLOAD_PARAMS,
        headers=headers,
        files={"files": (f"page-{index + 1}.jpg", image_bytes, "image/jpeg")},
    )
    if resp.status_code != 200:
        raise HTTPException(502, f"Lyzr asset upload failed: {resp.text}")

    data = resp.json()
    results = data.get("results") or []
    if not results or not results[0].get("success"):
        raise HTTPException(502, f"Lyzr asset upload did not succeed: {data}")
    return results[0]["asset_id"]


async def run_chat_inference(client: httpx.AsyncClient, headers: dict, session_id: str, asset_ids: list[str]) -> str:
    """Run chat inference over the given assets and return the agent's raw
    reply (still JSON-as-text, possibly fenced - parsing that is response_parser's job)."""
    resp = await client.post(
        f"{LYZR_BASE_URL}/v3/inference/chat/",
        headers={**headers, "Content-Type": "application/json"},
        json={
            "user_id": LYZR_USER_ID,
            "agent_id": LYZR_AGENT_ID,
            "session_id": session_id,
            "message": OCR_INSTRUCTION,
            "assets": asset_ids,
        },
    )
    if resp.status_code != 200:
        raise HTTPException(502, f"Lyzr chat inference failed: {resp.text}")

    chat_data = resp.json()
    raw_value = (
        chat_data.get("response")
        or chat_data.get("message")
        or chat_data.get("text")
        or chat_data.get("agent_response")
    )
    if raw_value is None:
        raise HTTPException(502, f"Unrecognized Lyzr response shape: {chat_data}")
    return raw_value
