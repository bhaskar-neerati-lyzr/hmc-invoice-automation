# OCR backend (FastAPI)

Proxies file uploads to your Lyzr OCR agent. Keeps `LYZR_API_KEY` server-side only.

Also includes the **Outlook mailbox automation** (`outlook/`): a Microsoft Graph webhook that watches one inbox, fetches new emails' attachments, and forwards OCR-eligible ones (png/jpg/pdf) through the exact same `/api/ocr` pipeline the frontend uses — results are persisted to Postgres and readable via `/api/invoices`. Every attachment Graph reports on an email (including skipped/unsupported ones) is stored in full, not just its filename/metadata, so the original file is recoverable later via `/api/invoices/{id}/attachments/{attachment_id}`. It runs in this same process/port, not a separate server. Every route under `/api/invoices` requires HTTP Basic Auth (`INVOICES_AUTH_USER`/`INVOICES_AUTH_PASSWORD`) — `/api/ocr` and `/api/outlook/notify` are unauthenticated (the latter can't be, since Graph itself calls it). The browser itself never sends these credentials or calls `/api/invoices*` directly — the frontend's Next.js server does that server-to-server, behind its own login page (`frontend/app/login`, `frontend/middleware.ts`). See that app's docs for the full picture.

For running the app, filling in `.env`, and setting up the Graph webhook tunnel, see **[../setup-guides/](../setup-guides/)**.

## Setup

```bash
python -m venv .venv
.venv/Scripts/activate        # Windows
pip install -r requirements-dev.txt  # runtime deps + pytest; use requirements.txt alone for a prod install
cp .env.example .env           # fill in LYZR_API_KEY, LYZR_AGENT_ID, and the GRAPH_*/DATABASE_URL vars
                                # also set INVOICES_AUTH_USER/PASSWORD - the /api/invoices* routes and the
                                # frontend's /outlook-invoices page both refuse all requests until these are set
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

This single process serves both the existing upload flow (`/api/ocr`, used by the frontend) and the Outlook automation's webhook + invoices endpoints — nothing else needs to run alongside it besides the frontend (`npm run dev`) and Postgres.

### Testing the Outlook webhook locally

Graph needs a public HTTPS URL to call, so during local dev expose this same port with a tunnel:

```bash
devtunnel host -p 8000 --allow-anonymous
# or: ngrok http 8000
```

Then create the subscription, pointing at the tunnel URL + `/api/outlook/notify`:

```bash
python -m outlook.subscription_cli create --notification-url https://<your-tunnel>.devtunnels.ms/api/outlook/notify
```

Watch the `uvicorn` console for the validation handshake, then send a real test email (with a PNG/JPG/PDF attachment) to the target mailbox — you should see it logged as fetched, filtered, forwarded to `/api/ocr`, and saved, and it'll show up at `GET /api/invoices`.

Gotchas: the tunnel URL changes on every restart, so re-run `subscription_cli.py create` (and optionally `delete` the old one) each time; the subscription itself expires in ~2.9 days with no automated renewal in this build — re-run `subscription_cli.py renew --id <id>` manually, or `create` a new one.

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

- `config.py` — env var loading (`GRAPH_*`, `DATABASE_URL`).
- `graph_auth.py` — MSAL client-credentials token acquisition.
- `graph_client.py` — Graph calls: fetch message/attachments, subscription create/renew/delete/list.
- `models.py` — SQLAlchemy models (`Email`, `EmailAttachment`, `Invoice`, `InvoiceLineItem`).
- `database.py` — engine/session setup.
- `processor.py` — the per-notification workflow: fetch → filter attachments → forward to `/api/ocr` → persist. Also reflects processing status as Outlook categories on the email (`_tag_email`), gated by `OUTLOOK_UPDATE_CATEGORIES_FLAG` (default on) - set to `false` in `.env` to skip writing those tags without affecting ingestion/OCR/persistence.
- `webhook_router.py` — `/api/outlook/notify`: validation handshake + notification receipt (fast ack via `BackgroundTasks`).
- `invoices_router.py` — `GET /api/invoices` (list, filterable by `status`/`date_from`/`date_to`/`sender`/`vendor`/`invoice_number`/`purchase_order_number`), `GET /api/invoices/{id}` (detail), `GET /api/invoices/{id}/attachments/{attachment_id}` (raw attachment bytes as originally received from Graph). Every route on this router requires HTTP Basic Auth - see `require_auth()` at the top of the file.
- `subscription_cli.py` — manual `create`/`renew`/`delete`/`list` for the Graph subscription (no scheduled renewal job in this build).

See `../outlook-email-ingestion-plan/` for the fuller design docs (Microsoft portal setup, webhook concepts, client discovery questions) this module implements.
