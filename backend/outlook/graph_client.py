"""Thin client for the Microsoft Graph calls this module needs: reading a
message and its attachments, and managing the change-notification subscription.
"""

from datetime import datetime, timedelta, timezone

import httpx

from . import config, graph_auth

# Mail resource subscriptions are capped at ~4230 minutes by Microsoft Graph.
MAX_SUBSCRIPTION_MINUTES = 4230

# Outlook category names used to reflect processing status directly on the
# email (visible in Outlook as colored tags, like Gmail labels). The lyzr_
# prefix namespaces these as automation-owned, so set_message_category()
# can tell them apart from any category a person adds manually. Setting a
# category on a message only needs Mail.ReadWrite (already granted); giving
# these a specific color would additionally need MailboxSettings.ReadWrite,
# which we're deliberately not requesting yet - so these show up uncolored
# in Outlook until someone picks a color for each, once, in Outlook's UI.
#
# Lifecycle (see processor.process_notification for the state machine):
#   lyzr_queued -> lyzr_in_progress -> one of:
#     lyzr_skipped_no_attachments | lyzr_skipped_bad_attachment
#     | lyzr_processed | lyzr_not_invoice | lyzr_failed_processing
CATEGORY_QUEUED = "lyzr_queued"
CATEGORY_IN_PROGRESS = "lyzr_in_progress"
CATEGORY_PROCESSED = "lyzr_processed"
CATEGORY_NOT_INVOICE = "lyzr_not_invoice"
CATEGORY_SKIPPED_NO_ATTACHMENTS = "lyzr_skipped_no_attachments"
CATEGORY_SKIPPED_BAD_ATTACHMENT = "lyzr_skipped_bad_attachment"
CATEGORY_FAILED = "lyzr_failed_processing"

ALL_CATEGORIES = {
    CATEGORY_QUEUED,
    CATEGORY_IN_PROGRESS,
    CATEGORY_PROCESSED,
    CATEGORY_NOT_INVOICE,
    CATEGORY_SKIPPED_NO_ATTACHMENTS,
    CATEGORY_SKIPPED_BAD_ATTACHMENT,
    CATEGORY_FAILED,
}


def _headers() -> dict:
    return {"Authorization": f"Bearer {graph_auth.get_app_token()}"}


def _mailbox_path(suffix: str) -> str:
    return f"{config.GRAPH_BASE_URL}/users/{config.GRAPH_MAILBOX_USER_ID}/{suffix}"


async def fetch_message(message_id: str) -> dict:
    """GET the message (subject, sender, receivedDateTime, hasAttachments, ...)."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(_mailbox_path(f"messages/{message_id}"), headers=_headers())
    resp.raise_for_status()
    return resp.json()


async def fetch_attachments(message_id: str) -> list[dict]:
    """GET the raw list of attachment objects for a message.

    Small file attachments (Graph's default, roughly <3MB) come back with a
    base64 `contentBytes` field already populated. itemAttachment (a forwarded
    email) and referenceAttachment (e.g. a OneDrive link) don't - callers must
    check `@odata.type` before assuming `contentBytes` is present.
    """
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(_mailbox_path(f"messages/{message_id}/attachments"), headers=_headers())
    resp.raise_for_status()
    return resp.json().get("value", [])


async def set_message_category(message_id: str, category: str) -> None:
    """Replace whichever of OUR status categories is currently on the
    message with `category`, preserving any other category already there
    (e.g. one a person added manually for unrelated reasons)."""
    async with httpx.AsyncClient(timeout=30) as client:
        get_resp = await client.get(
            _mailbox_path(f"messages/{message_id}"),
            headers=_headers(),
            params={"$select": "categories"},
        )
        get_resp.raise_for_status()
        current = get_resp.json().get("categories", [])
        kept = [c for c in current if c not in ALL_CATEGORIES]

        patch_resp = await client.patch(
            _mailbox_path(f"messages/{message_id}"),
            headers=_headers(),
            json={"categories": kept + [category]},
        )
    patch_resp.raise_for_status()


async def create_subscription(notification_url: str) -> dict:
    expiration = datetime.now(timezone.utc) + timedelta(minutes=MAX_SUBSCRIPTION_MINUTES)
    body = {
        "changeType": "created",
        "notificationUrl": notification_url,
        "resource": f"users/{config.GRAPH_MAILBOX_USER_ID}/mailFolders('Inbox')/messages",
        "expirationDateTime": expiration.isoformat(),
        "clientState": config.GRAPH_CLIENT_STATE,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{config.GRAPH_BASE_URL}/subscriptions", headers=_headers(), json=body)
    resp.raise_for_status()
    return resp.json()


async def renew_subscription(subscription_id: str) -> dict:
    expiration = datetime.now(timezone.utc) + timedelta(minutes=MAX_SUBSCRIPTION_MINUTES)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.patch(
            f"{config.GRAPH_BASE_URL}/subscriptions/{subscription_id}",
            headers=_headers(),
            json={"expirationDateTime": expiration.isoformat()},
        )
    resp.raise_for_status()
    return resp.json()


async def delete_subscription(subscription_id: str) -> None:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.delete(f"{config.GRAPH_BASE_URL}/subscriptions/{subscription_id}", headers=_headers())
    if resp.status_code not in (204, 404):
        resp.raise_for_status()


async def list_subscriptions() -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{config.GRAPH_BASE_URL}/subscriptions", headers=_headers())
    resp.raise_for_status()
    return resp.json().get("value", [])
