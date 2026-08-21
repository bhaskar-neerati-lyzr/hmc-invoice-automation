"""Endpoint Lyzr Superflow's HTTP node calls to hand off one Outlook
message for processing - replaces the retired Microsoft Graph webhook
subscription. Superflow itself polls the mailbox; this endpoint only ever
receives a message_id, never the email content - processor.py still
fetches that directly from Graph, same as before.
"""

import hmac

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from . import config, queue_client

router = APIRouter(prefix="/api/superflow", tags=["superflow"])


class ProcessRequest(BaseModel):
    message_id: str
    # Unused for now - only one mailbox is integrated. Kept in the request
    # contract so adding a second mailbox later doesn't need a breaking API
    # change, just code that actually reads it.
    service: str | None = None


def _check_api_key(authorization: str | None) -> None:
    if not config.SUPERFLOW_API_KEY:
        raise HTTPException(500, "SUPERFLOW_API_KEY is not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing or malformed Authorization header")
    provided = authorization.removeprefix("Bearer ")
    # Constant-time comparison - a plain != leaks timing information about
    # how many leading characters matched, which a normal == check doesn't
    # need to worry about but a security-sensitive one should.
    if not hmac.compare_digest(provided, config.SUPERFLOW_API_KEY):
        raise HTTPException(401, "Invalid API key")


@router.post("/process")
def trigger_processing(body: ProcessRequest, authorization: str | None = Header(default=None)):
    """Enqueue-then-ack, never ack-then-enqueue: if enqueue() raises, we
    never reach the return below, so Superflow gets a non-200 and its own
    retry behavior can call again - see outlook/queue_client.py."""
    _check_api_key(authorization)
    queue_client.enqueue(body.message_id)
    return {"status": "queued", "message_id": body.message_id}
