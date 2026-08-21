# OCR backend (FastAPI)

Proxies file uploads to your Lyzr OCR agent. Keeps `LYZR_API_KEY` server-side only.

Also includes the **Outlook mailbox automation** (`outlook/`): Lyzr Superflow polls one inbox and calls `POST /api/superflow/process` with a `message_id` whenever it finds something new; this app fetches that message's attachments directly from Graph and forwards OCR-eligible ones (png/jpg/pdf) through the exact same `/api/ocr` pipeline the frontend uses — results are persisted to Postgres and readable via `/api/invoices`. Every attachment Graph reports on an email (including skipped/unsupported ones) is stored in full, not just its filename/metadata, so the original file is recoverable later via `/api/invoices/{id}/attachments/{attachment_id}`. It runs in this same process/port, not a separate server. `/api/invoices*` and `/api/kpis*` require a signed-in user (JWT, see `outlook/auth.py`); `/api/superflow/process` requires a shared API key (`SUPERFLOW_API_KEY`, not a user session - see `outlook/superflow_router.py`); `/api/ocr` is unauthenticated (the frontend's upload-test page calls it directly from the browser). The dashboard's browser-side code carries its own JWT and calls `/api/invoices*`/`/api/kpis*` directly - there's no server-side proxy layer anymore, see `frontend/app/lib/auth.tsx`.

For running the app and filling in `.env`, see **[../setup-guides/](../setup-guides/)**.

## Setup

```bash
python -m venv .venv
.venv/Scripts/activate        # Windows
pip install -r requirements-dev.txt  # runtime deps + pytest; use requirements.txt alone for a prod install
cp .env.example .env           # fill in LYZR_API_KEY, LYZR_AGENT_ID, GRAPH_*/DATABASE_URL,
                                # SUPERFLOW_API_KEY, SQS_QUEUE_URL, and APP_JWT_SECRET/SEED_ADMIN_*
                                # - the app refuses to do anything useful until these are set
```

### Database (for the Outlook automation)

Needs a running PostgreSQL instance. Easiest via Docker:

```bash
docker run -d --name outlook-invoices-db -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
```

Then create the database and run migrations:

```bash
# create the DB once (matches DATABASE_URL in .env, default name outlook_invoices)
psql -h localhost -U postgres -c "CREATE DATABASE outlook_invoices;"

alembic upgrade head
```

Any time `outlook/models.py` changes, generate a new migration with `alembic revision --autogenerate -m "..."` and review it before running `alembic upgrade head` again.

## Run

```bash
uvicorn main:app --reload --port 8000
```

This single process serves both the existing upload flow (`/api/ocr`, used by the frontend) and the Outlook automation's Superflow + invoices endpoints. You also need `python -m outlook.worker` running somewhere (its own process/container - see `docker-compose.yml`) to actually consume what gets enqueued, and a real SQS queue (or LocalStack for local dev - see `../docker-compose.dev.yml`) for `SQS_QUEUE_URL` to point at.

### Testing the Superflow endpoint locally

No public tunnel needed anymore - this endpoint is called directly (by Superflow in production, or by hand while testing), not by an inbound Microsoft callback. With the backend, `outlook.worker`, and a queue (real or LocalStack) all running, send a real message from the target mailbox's inbox and grab its Graph message ID, then:

```bash
curl -X POST http://localhost:8000/api/superflow/process \
  -H "Authorization: Bearer $SUPERFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message_id": "<the Graph message id>"}'
```

Watch the `outlook.worker` console for it being fetched, filtered, forwarded to `/api/ocr`, and saved - it'll show up at `GET /api/invoices`.

## Endpoint

`POST /api/ocr` — multipart form with one or more `files` fields (png/jpg/pdf). Multiple files, and every page of an uploaded PDF, are treated as pages of the same invoice: PDFs are rasterized to JPEG server-side (PyMuPDF) and every resulting page image is sent to the agent in a single call, so the extracted fields are merged across all pages/images. Returns:

```json
{ "text": "...", "partial": false, "message": null, "session_id": "..." }
```

The agent replies with `{text, partial, message, ...}` as a JSON string, sometimes wrapped in a ` ```json ` code fence. `parse_agent_output()` in `response_parser.py` unwraps that into real fields — `partial` is a bool (whether extraction may be incomplete) and `message` is only set when the agent has a note.

## Module layout

- `main.py` — FastAPI app, routes, and request-level glue (validating uploads, turning them into page images). Deliberately thin.
- `normalize.py` — field-level string cleanup (ID label stripping, date/currency formatting). Pure functions, no I/O.
- `pdf_render.py` — PDF page rasterization (PyMuPDF).
- `lyzr_client.py` — the two Lyzr HTTP calls (asset upload, chat inference) plus their config/env vars.
- `response_parser.py` — turns the agent's raw JSON reply into the API's response shape.
- `test_normalize.py` — unit tests for `normalize.py` (run with `pytest`).

### `outlook/` — mailbox automation

- `config.py` — env var loading (`GRAPH_*`, `SUPERFLOW_API_KEY`, `SQS_QUEUE_URL`, `DATABASE_URL`, ...).
- `graph_auth.py` — MSAL client-credentials token acquisition.
- `graph_client.py` — Graph calls: fetch message/attachments, set Outlook status categories.
- `models.py` — SQLAlchemy models (`Email`, `EmailAttachment`, `Invoice`, `InvoiceLineItem`, `ProcessingEvent`, `User`, `DeadLetterEmail`).
- `database.py` — engine/session setup.
- `processor.py` — the per-notification workflow: claim/retry the `Email` row → fetch → filter attachments → forward to `/api/ocr` → persist. Also reflects processing status as Outlook categories on the email (`_tag_email`), gated by `OUTLOOK_UPDATE_CATEGORIES_FLAG` (default on) - set to `false` in `.env` to skip writing those tags without affecting ingestion/OCR/persistence. Retry-aware: a message stuck `pending`/`failed` is reclaimed and retried (attachments cleared first, OCR skipped if an `Invoice` row already exists from a prior attempt) rather than reprocessed as new; on failure, `status="failed"` is written *then the exception is re-raised* - required so `worker.py` knows not to delete the SQS message. Every stage also gets a `ProcessingEvent` row - see the "Processing Log" tab on an email's detail page. See `../misc/learning-path/DATABASE.md` for the schema this reads/writes.
- `superflow_router.py` — `POST /api/superflow/process`: the endpoint Lyzr Superflow's HTTP node calls with a `message_id` (Bearer-auth'd via `SUPERFLOW_API_KEY`). Enqueues onto SQS and acks immediately - never fetches the message itself.
- `queue_client.py` — thin boto3 SQS wrapper (`enqueue`/`receive_messages`/`delete_message`).
- `worker.py` — standalone SQS consumer (`python -m outlook.worker`): long-polls, calls `processor.process_notification` unchanged, deletes the message only on success. Always required - nothing else consumes the queue. See `../misc/setup-guides/05-outlook-inbox-ocr-architecture.md` for the full design.
- `invoices_router.py` — `GET /api/invoices` (list, filterable by `status`/`date_from`/`date_to`/`sender`/`vendor`/`invoice_number`/`purchase_order_number`/`search`), `GET /api/invoices/{id}` (detail), `GET /api/invoices/{id}/events` (processing log), `GET /api/invoices/{id}/attachments/{attachment_id}` (raw attachment bytes as originally received from Graph). Every route on this router requires a signed-in user (JWT) - see `get_current_user()` in `auth.py`.
- `auth.py`/`auth_router.py` — password hashing, JWT issue/verify, login/account/user-management endpoints.

See `../outlook-email-ingestion-plan/` for the fuller design docs (Microsoft portal setup, webhook concepts, client discovery questions) - written for the retired Graph-webhook design, kept for the Microsoft-portal-setup steps (Azure AD app registration, Application Access Policy) which are unchanged.
