"""Environment configuration for the Outlook inbox automation.

Values are read but NOT enforced at import time: this module is imported
transitively by main.py, so raising here for a missing var would take down
the entire backend (including the existing /api/ocr upload flow) just
because Graph/DB setup isn't finished yet. Each value is instead validated
lazily, only by the code path that actually needs it (graph_auth, database),
and only when that path is actually exercised.
"""

import os

from dotenv import load_dotenv

load_dotenv()

GRAPH_TENANT_ID = os.environ.get("GRAPH_TENANT_ID")
GRAPH_CLIENT_ID = os.environ.get("GRAPH_CLIENT_ID")
GRAPH_CLIENT_SECRET = os.environ.get("GRAPH_CLIENT_SECRET")
GRAPH_MAILBOX_USER_ID = os.environ.get("GRAPH_MAILBOX_USER_ID")
GRAPH_CLIENT_STATE = os.environ.get("GRAPH_CLIENT_STATE")
GRAPH_BASE_URL = os.environ.get("GRAPH_BASE_URL", "https://graph.microsoft.com/v1.0")
GRAPH_NOTIFICATION_URL = os.environ.get("GRAPH_NOTIFICATION_URL", "")

OCR_ENDPOINT_URL = os.environ.get("OCR_ENDPOINT_URL", "http://localhost:8000/api/ocr")

# Whether processor.py should write the lyzr_* status categories back onto
# emails in the mailbox (see graph_client.set_message_category). Ingestion,
# OCR, and persistence to Postgres all still run identically either way -
# this only silences the cosmetic Outlook tagging, e.g. for a mailbox owner
# who doesn't want automation touching their inbox categories.
OUTLOOK_UPDATE_CATEGORIES = os.environ.get("OUTLOOK_UPDATE_CATEGORIES_FLAG", "true").strip().lower() not in (
    "false",
    "0",
    "no",
)

# When true, webhook_router.py enqueues {message_id} onto SQS instead of
# running processor.process_notification in a FastAPI BackgroundTask, and
# outlook/worker.py (a separate process - `python -m outlook.worker`) is
# what actually calls it. Defaults to false so local dev/docker-compose
# keeps working without any AWS setup - flip on in deployments that run the
# worker service and have SQS_QUEUE_URL pointed at a real queue.
USE_SQS_QUEUE = os.environ.get("USE_SQS_QUEUE_FLAG", "false").strip().lower() in ("true", "1", "yes")

# Required when USE_SQS_QUEUE is true. Standard queue (not FIFO) - see
# misc/setup-guides/05-outlook-inbox-ocr-architecture.md for why.
SQS_QUEUE_URL = os.environ.get("SQS_QUEUE_URL", "")

# How long the worker's ReceiveMessage call blocks waiting for a message
# before returning empty - see the 05 doc's "long polling" section. 20 is
# SQS's own maximum.
SQS_WAIT_TIME_SECONDS = int(os.environ.get("SQS_WAIT_TIME_SECONDS", "20"))

DATABASE_URL = os.environ.get("DATABASE_URL")

# JWT signing secret for the multi-user login (see outlook/auth.py). Same
# purpose as invoice-process's APP_JWT_SECRET - a long random string, e.g.
# `openssl rand -base64 32`. Not enforced here; auth.py raises when a token
# actually needs signing/verifying and this is unset.
APP_JWT_SECRET = os.environ.get("APP_JWT_SECRET")

# There is no sign-up flow - the very first admin account is bootstrapped
# from these two vars by POST /api/seed, which the frontend's login page
# calls automatically on first load (mirrors invoice-process's proven
# pattern for the exact same chicken-and-egg problem). Set a real password
# here at deploy time; it's never hardcoded in source.
SEED_ADMIN_EMAIL = os.environ.get("SEED_ADMIN_EMAIL")
SEED_ADMIN_PASSWORD = os.environ.get("SEED_ADMIN_PASSWORD")
