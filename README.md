# OCR invoice app

Two services (`backend/` FastAPI, `frontend/` Next.js) plus Postgres, run via Docker Compose. Proxies uploads to a Lyzr OCR agent, and optionally ingests invoices automatically from an Outlook mailbox (`backend/outlook/`).

- **backend/** — FastAPI: `/api/ocr` (upload flow), `/api/superflow/process` (Lyzr Superflow calls this to trigger mailbox ingestion), `/api/invoices*`/`/api/kpis*` (JWT-protected). See [backend/README.md](backend/README.md).
- **frontend/** — Next.js: the login-gated dashboard at `/` (emails, KPIs, dead letter, users, account), the unauthenticated manual-upload tester at `/upload-test`, `/agent-config`.
- **setup-guides/** — env setup, tunnel setup, AWS ECS deployment architecture.
- **learning-path/** — guided walkthrough of the codebase.

## Quick start

```bash
cp .env.example .env                             # deploy-level config (build-time URL)
cp backend/.env.example backend/.env              # app config - LYZR_*, GRAPH_*, DATABASE_URL, etc.
# fill in both files, then:

./deploy.sh --dev      # local dev: live reload, bind-mounted source
./deploy.sh            # production-shaped build: optimized images, no bind mounts
```

On Windows without a bash shell, use `.\deploy.ps1 -Dev` / `.\deploy.ps1` instead - same behavior.

Backend health check: `GET http://localhost:8000/api/health`. Frontend (always started alongside the backend): `http://localhost:3000`.

## Deploy-time flags

| Flag | Where | Effect |
| --- | --- | --- |
| `OUTLOOK_UPDATE_CATEGORIES_FLAG` | `backend/.env` | `true` (default) writes `lyzr_*` status categories back onto emails in the mailbox as they're processed (visible as colored tags in Outlook). `false` skips that write - ingestion/OCR/persistence to Postgres are unaffected either way. See `backend/outlook/config.py` and `processor.py`'s `_tag_email`. |
| `SUPERFLOW_API_KEY` | `backend/.env` | Bearer token Lyzr Superflow's HTTP node must send on every call to `POST /api/superflow/process`. Not a flag - always required. |

## Images: dev vs production

Both Dockerfiles are multi-stage with a `dev` target (live reload, bind-mounted source, used by `docker-compose.dev.yml`) and a default production target (`runtime` for the backend, `runner` for the frontend - an optimized, non-root, no-source-mount image). Plain `docker build` picks the production target since it's the last stage; `docker-compose.dev.yml` explicitly overrides `target: dev`.

For a real deployment (not just `docker compose` on one host), see [setup-guides/04-ecs-deployment-architecture.txt](setup-guides/04-ecs-deployment-architecture.txt) and [setup-guides/07-aws-deployment-env-changes.txt](setup-guides/07-aws-deployment-env-changes.txt) for what changes moving to AWS ECS (this is where `NEXT_PUBLIC_API_BASE_URL` becomes a CI build-arg, secrets move to Secrets Manager, etc.).
