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

DATABASE_URL = os.environ.get("DATABASE_URL")

# Gates every /api/invoices* route (see invoices_router.require_auth). Same
# two values are also read by the frontend's middleware.ts, so a viewer only
# has to authenticate once per browser per origin - see setup-guides.
INVOICES_AUTH_USER = os.environ.get("INVOICES_AUTH_USER")
INVOICES_AUTH_PASSWORD = os.environ.get("INVOICES_AUTH_PASSWORD")
