# OCR invoice app

Two services (`backend/` FastAPI, `frontend/` Next.js) plus Postgres, run via Docker Compose. Proxies uploads to a Lyzr OCR agent, and optionally ingests invoices automatically from an Outlook mailbox (`backend/outlook/`).

- **backend/** — FastAPI: `/api/ocr` (upload flow), `/api/outlook/*` (Graph webhook + mailbox automation), `/api/invoices*` (Basic-auth protected). See [backend/README.md](backend/README.md).
- **frontend/** — Next.js: the manual-upload page, the login-gated `/outlook-invoices` viewer, `/agent-config`.
- **setup-guides/** — env setup, tunnel setup, AWS ECS deployment architecture.
- **learning-path/** — guided walkthrough of the codebase.

## Quick start

```bash
cp .env.example .env                             # deploy-level flags (ENABLE_UI_FLAG, build-time URL)
cp backend/.env.example backend/.env              # app config - LYZR_*, GRAPH_*, DATABASE_URL, etc.
# fill in both files, then:

./deploy.sh --dev      # local dev: live reload, bind-mounted source
./deploy.sh            # production-shaped build: optimized images, no bind mounts
```

On Windows without a bash shell, use `.\deploy.ps1 -Dev` / `.\deploy.ps1` instead - same behavior.

Backend health check: `GET http://localhost:8000/api/health`. With `ENABLE_UI_FLAG=true`, the frontend is at `http://localhost:3000`.

## The two deploy-time flags

| Flag | Where | Effect |
| --- | --- | --- |
| `ENABLE_UI_FLAG` | `.env` (root) | `true` starts the Next.js frontend alongside the backend. `false` starts only `db` + `backend` - a headless deployment (API + Outlook automation only, no human-facing UI). Implemented as a Compose profile (`docker-compose.yml`'s `frontend` service is tagged `profiles: ["ui"]`); `deploy.sh`/`deploy.ps1` translate the flag into `--profile ui` for you. |
| `OUTLOOK_UPDATE_CATEGORIES_FLAG` | `backend/.env` | `true` (default) writes `lyzr_*` status categories back onto emails in the mailbox as they're processed (visible as colored tags in Outlook). `false` skips that write - ingestion/OCR/persistence to Postgres are unaffected either way. See `backend/outlook/config.py` and `processor.py`'s `_tag_email`. |

## Images: dev vs production

Both Dockerfiles are multi-stage with a `dev` target (live reload, bind-mounted source, used by `docker-compose.dev.yml`) and a default production target (`runtime` for the backend, `runner` for the frontend - an optimized, non-root, no-source-mount image). Plain `docker build` picks the production target since it's the last stage; `docker-compose.dev.yml` explicitly overrides `target: dev`.

For a real deployment (not just `docker compose` on one host), see [setup-guides/04-ecs-deployment-architecture.txt](setup-guides/04-ecs-deployment-architecture.txt) and [setup-guides/07-aws-deployment-env-changes.txt](setup-guides/07-aws-deployment-env-changes.txt) for what changes moving to AWS ECS (this is where `NEXT_PUBLIC_API_BASE_URL` becomes a CI build-arg, secrets move to Secrets Manager, etc.) - `ENABLE_UI_FLAG=false` there just means: don't provision the frontend ECS service/target-group route at all.
