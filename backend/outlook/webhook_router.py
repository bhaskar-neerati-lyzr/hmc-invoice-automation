"""Microsoft Graph webhook receiver: validation handshake + notification receipt."""

import logging

from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.responses import PlainTextResponse

from . import config, processor

logger = logging.getLogger("outlook.webhook")

router = APIRouter(prefix="/api/outlook", tags=["outlook"])


@router.get("/notify")
async def validate_get(validationToken: str | None = None):
    """Graph's subscription-creation handshake arrives as a GET with
    ?validationToken=... - must be echoed back as plain text within 10s."""
    return PlainTextResponse(validationToken or "", status_code=200)


@router.post("/notify")
async def notify(request: Request, background_tasks: BackgroundTasks):
    # The validation handshake can also arrive as a POST with the token only
    # in the query string (no JSON body) - handle that before touching the body.
    validation_token = request.query_params.get("validationToken")
    if validation_token is not None:
        return PlainTextResponse(validation_token, status_code=200)

    body = await request.json()
    for entry in body.get("value", []):
        if entry.get("clientState") != config.GRAPH_CLIENT_STATE:
            logger.warning("rejected notification with mismatched clientState")
            continue

        message_id = (entry.get("resourceData") or {}).get("id")
        if not message_id:
            logger.warning("notification missing resourceData.id: %s", entry)
            continue

        background_tasks.add_task(processor.process_notification, message_id)

    # Ack immediately - Graph expects a response within ~3 seconds. The actual
    # work happens in the background tasks scheduled above, after this
    # response is sent.
    return {"status": "accepted"}
