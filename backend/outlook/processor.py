"""The per-notification workflow: fetch the message + attachments from Graph,
filter to OCR-eligible attachments, forward them to the existing /api/ocr
route (same process, same port - just a normal HTTP call), and persist the
result.
"""

import base64
import binascii
import logging
from datetime import datetime

import httpx
from sqlalchemy.exc import IntegrityError

from . import config, database, graph_client, models

logger = logging.getLogger("outlook.processor")

# Must mirror backend/main.py's ALLOWED_CONTENT_TYPES exactly - anything else
# would just get a 400 from /api/ocr anyway.
ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "application/pdf"}


def _claim_message(message_id: str) -> bool:
    """Insert a placeholder Email row for this message_id.

    Relies on the DB's unique constraint on message_id for idempotency: Graph
    notifications are at-least-once, so a duplicate notification for a
    message already claimed (or already fully processed) fails here and is
    skipped rather than reprocessed.
    """
    try:
        with database.get_session() as session:
            session.add(models.Email(message_id=message_id, status="pending"))
    except IntegrityError:
        return False
    return True


def _update_email_from_message(message_id: str, message: dict) -> None:
    with database.get_session() as session:
        email = session.query(models.Email).filter_by(message_id=message_id).one()
        email.subject = message.get("subject")
        sender = (message.get("from") or {}).get("emailAddress") or {}
        email.sender_name = sender.get("name")
        email.sender_email = sender.get("address")
        received = message.get("receivedDateTime")
        email.received_at = (
            datetime.fromisoformat(received.replace("Z", "+00:00")) if received else None
        )
        email.has_attachments = bool(message.get("hasAttachments"))


def _save_attachments(message_id: str, records: list[dict]) -> None:
    with database.get_session() as session:
        email = session.query(models.Email).filter_by(message_id=message_id).one()
        for record in records:
            email.attachments.append(
                models.EmailAttachment(
                    filename=record["filename"],
                    content_type=record["content_type"],
                    forwarded=record["forwarded"],
                    skip_reason=record["skip_reason"],
                    content=record["content"],
                )
            )


def _mark_status(message_id: str, status: str, error: str | None = None) -> None:
    with database.get_session() as session:
        email = session.query(models.Email).filter_by(message_id=message_id).one()
        email.status = status
        if error:
            email.error_message = error


def _save_invoice(message_id: str, result: dict) -> None:
    with database.get_session() as session:
        email = session.query(models.Email).filter_by(message_id=message_id).one()
        invoice = models.Invoice(
            email_id=email.id,
            session_id=result.get("session_id"),
            is_invoice=bool(result.get("is_invoice")),
            vendor_name=result.get("vendor_name"),
            vendor_address=result.get("vendor_address"),
            vendor_zipcode=result.get("vendor_zipcode"),
            billing_address=result.get("billing_address"),
            billing_zipcode=result.get("billing_zipcode"),
            service_address=result.get("service_address"),
            service_zipcode=result.get("service_zipcode"),
            invoice_date=result.get("invoice_date"),
            invoice_number=result.get("invoice_number"),
            purchase_order_number=result.get("purchase_order_number"),
            due_date=result.get("due_date"),
            property_code=result.get("property_code"),
            sub_total=result.get("sub_total"),
            tax=result.get("tax"),
            total=result.get("total"),
            raw_response=result,
        )
        for item in result.get("items") or []:
            invoice.line_items.append(
                models.InvoiceLineItem(
                    item_name=item.get("item_name"),
                    qty=item.get("qty"),
                    unit_price=item.get("unit_price"),
                    total_price=item.get("total_price"),
                )
            )
        session.add(invoice)


def _filter_attachments(attachments: list[dict]) -> tuple[list[tuple[str, bytes, str]], list[dict]]:
    """Split Graph attachment objects into (forwardable, records-for-every-attachment).

    Skips - rather than errors on - anything the OCR backend can't accept:
    non-file attachments (a forwarded email, a OneDrive link), unsupported
    content types, or attachments too large to have been returned inline.

    Every attachment gets a record regardless of outcome, and that record's
    `content` carries the decoded bytes whenever Graph actually gave us
    `contentBytes` - including for attachments skipped for having an
    unsupported content type, so the original file is still recoverable
    later even though it was never sent to OCR. `content` is only null when
    Graph genuinely never inlined the bytes to begin with (not a file
    attachment, too large, or undecodable).
    """
    forwardable: list[tuple[str, bytes, str]] = []
    records: list[dict] = []

    for attachment in attachments:
        name = attachment.get("name", "unknown")
        content_type = attachment.get("contentType", "")
        odata_type = attachment.get("@odata.type", "")

        if odata_type != "#microsoft.graph.fileAttachment":
            records.append(
                {
                    "filename": name,
                    "content_type": content_type,
                    "forwarded": False,
                    "skip_reason": f"not a file attachment ({odata_type or 'unknown type'})",
                    "content": None,
                }
            )
            continue

        content_bytes_b64 = attachment.get("contentBytes")
        if not content_bytes_b64:
            records.append(
                {
                    "filename": name,
                    "content_type": content_type,
                    "forwarded": False,
                    "skip_reason": "no inline content (attachment likely too large)",
                    "content": None,
                }
            )
            continue

        try:
            decoded = base64.b64decode(content_bytes_b64)
        except (binascii.Error, ValueError):
            records.append(
                {
                    "filename": name,
                    "content_type": content_type,
                    "forwarded": False,
                    "skip_reason": "failed to decode content",
                    "content": None,
                }
            )
            continue

        if content_type not in ALLOWED_CONTENT_TYPES:
            records.append(
                {
                    "filename": name,
                    "content_type": content_type,
                    "forwarded": False,
                    "skip_reason": "unsupported content type",
                    "content": decoded,
                }
            )
            continue

        forwardable.append((name, decoded, content_type))
        records.append(
            {"filename": name, "content_type": content_type, "forwarded": True, "skip_reason": None, "content": decoded}
        )

    return forwardable, records


async def _forward_to_ocr(files: list[tuple[str, bytes, str]]) -> dict:
    """POST every forwardable attachment from this email in a single call,
    matching the existing /api/ocr contract (repeated 'files' parts = pages
    of the same invoice)."""
    multipart_files = [("files", (name, data, content_type)) for name, data, content_type in files]
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(config.OCR_ENDPOINT_URL, files=multipart_files)
    resp.raise_for_status()
    return resp.json()


async def _tag_email(message_id: str, category: str) -> None:
    """Best-effort: reflect the current status as an Outlook category on the
    email itself. Never lets a Graph write failure affect the actual
    processing outcome - only logs. No-ops entirely when
    config.OUTLOOK_UPDATE_CATEGORIES is off - ingestion/OCR/persistence are
    unaffected either way."""
    if not config.OUTLOOK_UPDATE_CATEGORIES:
        return
    try:
        await graph_client.set_message_category(message_id, category)
    except Exception:  # noqa: BLE001 - tagging is cosmetic, must not break processing
        logger.exception("failed to set Outlook category %r on message %s", category, message_id)


async def process_notification(message_id: str) -> None:
    """The deferred work triggered after the webhook has already acked Graph.

    Never raises past this point in production use (it runs as a
    BackgroundTask - nothing surfaces an exception from here except the
    server log), so every failure path is caught and recorded on the Email
    row instead.
    """
    if not _claim_message(message_id):
        logger.info("message %s already claimed/processed, skipping", message_id)
        return

    await _tag_email(message_id, graph_client.CATEGORY_QUEUED)

    try:
        # Marks the point where we actually start looking at the message
        # body/attachments, distinct from having merely been claimed/queued -
        # today these happen back-to-back, but this becomes meaningful once
        # a real task queue sits in front of processing.
        await _tag_email(message_id, graph_client.CATEGORY_IN_PROGRESS)

        message = await graph_client.fetch_message(message_id)
        _update_email_from_message(message_id, message)

        if not message.get("hasAttachments"):
            _mark_status(message_id, "skipped_no_attachments")
            await _tag_email(message_id, graph_client.CATEGORY_SKIPPED_NO_ATTACHMENTS)
            logger.info("message %s has no attachments, skipping", message_id)
            return

        attachments = await graph_client.fetch_attachments(message_id)
        forwardable, attachment_records = _filter_attachments(attachments)
        _save_attachments(message_id, attachment_records)

        if not forwardable:
            _mark_status(message_id, "skipped_bad_attachment")
            await _tag_email(message_id, graph_client.CATEGORY_SKIPPED_BAD_ATTACHMENT)
            logger.info("message %s has no OCR-eligible attachments, skipping", message_id)
            return

        result = await _forward_to_ocr(forwardable)
        _save_invoice(message_id, result)
        _mark_status(message_id, "processed")
        await _tag_email(
            message_id,
            graph_client.CATEGORY_PROCESSED if result.get("is_invoice") else graph_client.CATEGORY_NOT_INVOICE,
        )
        logger.info(
            "message %s processed: is_invoice=%s session_id=%s",
            message_id,
            result.get("is_invoice"),
            result.get("session_id"),
        )
    except Exception as exc:  # noqa: BLE001 - deliberately broad, this is the last line of defense
        logger.exception("message %s failed to process", message_id)
        _mark_status(message_id, "failed", error=str(exc))
        await _tag_email(message_id, graph_client.CATEGORY_FAILED)
