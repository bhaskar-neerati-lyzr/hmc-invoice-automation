"""Read endpoints for invoices ingested via the Outlook mailbox automation.

Rows are keyed off `Email`, not `Invoice`, so the list also surfaces emails
that were skipped or failed (no attachments, unsupported format, OCR error)
rather than only ones that produced a clean invoice - useful for seeing what
the automation actually did with everything that came in.
"""

import secrets
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Query as SAQuery, joinedload

from . import config, database, models

# Every non-terminal-or-terminal status Email.status can hold - used to
# zero-fill status breakdowns so a status with zero rows in range still
# appears (as 0), rather than being silently absent from the response.
ALL_STATUSES = ["pending", "processed", "skipped_no_attachments", "skipped_bad_attachment", "failed"]

_security = HTTPBasic()


def require_auth(credentials: HTTPBasicCredentials = Depends(_security)) -> None:
    """Gates every route on this router - see config.INVOICES_AUTH_USER/PASSWORD.

    Fails closed: if the credentials aren't configured at all, this refuses
    every request rather than silently leaving the router open, since an
    unset auth var is far more likely to mean "not deployed yet" than
    "auth intentionally disabled."
    """
    if not config.INVOICES_AUTH_USER or not config.INVOICES_AUTH_PASSWORD:
        raise HTTPException(500, "Invoices auth is not configured (set INVOICES_AUTH_USER/INVOICES_AUTH_PASSWORD)")

    # compare_digest instead of == to avoid leaking username/password length
    # or content through response-timing differences.
    user_ok = secrets.compare_digest(credentials.username, config.INVOICES_AUTH_USER)
    password_ok = secrets.compare_digest(credentials.password, config.INVOICES_AUTH_PASSWORD)
    if not (user_ok and password_ok):
        raise HTTPException(401, "Incorrect username or password", headers={"WWW-Authenticate": "Basic"})


router = APIRouter(prefix="/api/invoices", tags=["invoices"], dependencies=[Depends(require_auth)])


def _attachment_summary(attachment: models.EmailAttachment) -> dict:
    return {
        "id": attachment.id,
        "filename": attachment.filename,
        "content_type": attachment.content_type,
        "forwarded": attachment.forwarded,
        "skip_reason": attachment.skip_reason,
        # Bytes aren't JSON-serializable and would bloat this response anyway -
        # callers download the actual content via GET .../attachments/{id}.
        "has_content": attachment.content is not None,
    }


def _apply_date_range(query: SAQuery, date_from: date | None, date_to: date | None) -> SAQuery:
    """Filters `query` on Email.received_at - shared by list_invoices and
    get_stats so the date-range semantics (inclusive both ends, UTC) stay
    identical between "here are the matching rows" and "here's what they
    add up to." Works on any query that has Email in its FROM clause
    (selecting from Email directly, or joined in), not just Email itself."""
    if date_from:
        query = query.filter(
            models.Email.received_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc)
        )
    if date_to:
        # date_to is inclusive of the whole day, so the upper bound is midnight of the *next* day.
        query = query.filter(
            models.Email.received_at
            < datetime.combine(date_to, datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=1)
        )
    return query


def _summary(email: models.Email) -> dict:
    invoice = email.invoice
    return {
        "id": email.id,
        "message_id": email.message_id,
        "subject": email.subject,
        "sender_name": email.sender_name,
        "sender_email": email.sender_email,
        "received_at": email.received_at.isoformat() if email.received_at else None,
        "status": email.status,
        "error_message": email.error_message,
        "is_invoice": invoice.is_invoice if invoice else None,
        "vendor_name": invoice.vendor_name if invoice else None,
        "invoice_number": invoice.invoice_number if invoice else None,
        "purchase_order_number": invoice.purchase_order_number if invoice else None,
        "invoice_date": invoice.invoice_date if invoice else None,
        "total": invoice.total if invoice else None,
        "session_id": invoice.session_id if invoice else None,
    }


@router.get("")
def list_invoices(
    status: list[str] | None = Query(default=None, description="Repeat the param for multiple statuses (OR'd together)"),
    date_from: date | None = Query(default=None, description="Received on/after this date (inclusive, UTC)"),
    date_to: date | None = Query(default=None, description="Received on/before this date (inclusive, UTC)"),
    sender: str | None = Query(default=None, description="Case-insensitive substring match on sender name or email"),
    vendor: str | None = Query(default=None, description="Case-insensitive substring match on extracted vendor name"),
    invoice_number: str | None = Query(default=None, description="Case-insensitive substring match"),
    purchase_order_number: str | None = Query(default=None, description="Case-insensitive substring match"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    with database.get_session() as session:
        query = session.query(models.Email).options(joinedload(models.Email.invoice))

        if status:
            query = query.filter(models.Email.status.in_(status))
        query = _apply_date_range(query, date_from, date_to)
        if sender:
            pattern = f"%{sender}%"
            query = query.filter(or_(models.Email.sender_name.ilike(pattern), models.Email.sender_email.ilike(pattern)))
        if vendor:
            query = query.filter(models.Email.invoice.has(models.Invoice.vendor_name.ilike(f"%{vendor}%")))
        if invoice_number:
            query = query.filter(
                models.Email.invoice.has(models.Invoice.invoice_number.ilike(f"%{invoice_number}%"))
            )
        if purchase_order_number:
            query = query.filter(
                models.Email.invoice.has(models.Invoice.purchase_order_number.ilike(f"%{purchase_order_number}%"))
            )

        total = query.count()
        emails = query.order_by(desc(models.Email.created_at)).offset(offset).limit(limit).all()
        return {"total": total, "items": [_summary(e) for e in emails]}


# Registered BEFORE /{email_id} deliberately - Starlette matches routes in
# registration order, and /{email_id} (an untyped path template) matches
# the literal string "stats" too. Only the email_id function parameter's
# `int` type causes a 422 when FastAPI later tries to convert "stats" - by
# then it's too late, that route already "matched" and stats would never
# be reached if it were registered after.
@router.get("/stats")
def get_stats(
    date_from: date | None = Query(default=None, description="Received on/after this date (inclusive, UTC)"),
    date_to: date | None = Query(default=None, description="Received on/before this date (inclusive, UTC)"),
):
    with database.get_session() as session:

        def ranged(query: SAQuery) -> SAQuery:
            return _apply_date_range(query, date_from, date_to)

        total = ranged(session.query(models.Email)).count()

        status_counts = dict.fromkeys(ALL_STATUSES, 0)
        for status, count in ranged(session.query(models.Email.status, func.count())).group_by(models.Email.status):
            status_counts[status] = count

        invoice_split = {"is_invoice": 0, "not_invoice": 0}
        invoice_rows = (
            ranged(session.query(models.Invoice.is_invoice, func.count()).join(models.Email))
            .group_by(models.Invoice.is_invoice)
            .all()
        )
        for is_invoice, count in invoice_rows:
            invoice_split["is_invoice" if is_invoice else "not_invoice"] = count

        def scalar_ms(query: SAQuery) -> float | None:
            value = query.scalar()
            return round(value, 1) if value is not None else None

        latency = {
            "processing_ms": {
                "avg": scalar_ms(ranged(session.query(func.avg(models.Email.processing_duration_ms)))),
                "p95": scalar_ms(
                    ranged(session.query(func.percentile_cont(0.95).within_group(models.Email.processing_duration_ms)))
                ),
            },
            "ocr_ms": {
                "avg": scalar_ms(
                    ranged(session.query(func.avg(models.Invoice.ocr_duration_ms)).join(models.Email))
                ),
                "p95": scalar_ms(
                    ranged(
                        session.query(
                            func.percentile_cont(0.95).within_group(models.Invoice.ocr_duration_ms)
                        ).join(models.Email)
                    )
                ),
            },
        }

        # Daily breakdown - two grouped queries (status counts, avg
        # durations) merged in Python rather than one query, since a GROUP
        # BY day+status doesn't combine cleanly with per-day averages in a
        # single result shape.
        day_col = func.date_trunc("day", models.Email.received_at).label("day")
        daily: dict[str, dict] = {}

        status_by_day = (
            ranged(session.query(day_col, models.Email.status, func.count()))
            .filter(models.Email.received_at.isnot(None))
            .group_by(day_col, models.Email.status)
            .all()
        )
        for day, status, count in status_by_day:
            key = day.date().isoformat()
            daily.setdefault(key, {"date": key, **dict.fromkeys(ALL_STATUSES, 0), "avg_processing_ms": None, "avg_ocr_ms": None})
            daily[key][status] = count

        latency_by_day = (
            ranged(
                session.query(
                    day_col,
                    func.avg(models.Email.processing_duration_ms),
                    func.avg(models.Invoice.ocr_duration_ms),
                ).outerjoin(models.Invoice, models.Invoice.email_id == models.Email.id)
            )
            .filter(models.Email.received_at.isnot(None))
            .group_by(day_col)
            .all()
        )
        for day, avg_processing, avg_ocr in latency_by_day:
            key = day.date().isoformat()
            daily.setdefault(key, {"date": key, **dict.fromkeys(ALL_STATUSES, 0), "avg_processing_ms": None, "avg_ocr_ms": None})
            daily[key]["avg_processing_ms"] = round(avg_processing, 1) if avg_processing is not None else None
            daily[key]["avg_ocr_ms"] = round(avg_ocr, 1) if avg_ocr is not None else None

        top_senders_rows = (
            ranged(session.query(models.Email.sender_email, func.count()).filter(models.Email.sender_email.isnot(None)))
            .group_by(models.Email.sender_email)
            .order_by(desc(func.count()))
            .limit(10)
            .all()
        )
        top_senders = [{"sender": sender, "count": count} for sender, count in top_senders_rows]

        skip_reason_rows = (
            ranged(
                session.query(models.EmailAttachment.skip_reason, func.count())
                .join(models.Email, models.EmailAttachment.email_id == models.Email.id)
                .filter(models.EmailAttachment.forwarded.is_(False))
            )
            .group_by(models.EmailAttachment.skip_reason)
            .order_by(desc(func.count()))
            .all()
        )
        skip_reasons = [{"reason": reason, "count": count} for reason, count in skip_reason_rows]

        return {
            "total": total,
            "by_status": status_counts,
            "invoice_split": invoice_split,
            "latency": latency,
            "daily": sorted(daily.values(), key=lambda row: row["date"]),
            "top_senders": top_senders,
            "skip_reasons": skip_reasons,
        }


@router.get("/{email_id}")
def get_invoice(email_id: int):
    with database.get_session() as session:
        email = (
            session.query(models.Email)
            .options(
                joinedload(models.Email.invoice).joinedload(models.Invoice.line_items),
                joinedload(models.Email.attachments),
            )
            .filter(models.Email.id == email_id)
            .one_or_none()
        )
        if email is None:
            raise HTTPException(404, "Not found")

        invoice = email.invoice
        return {
            "id": email.id,
            "message_id": email.message_id,
            "subject": email.subject,
            "sender_name": email.sender_name,
            "sender_email": email.sender_email,
            "received_at": email.received_at.isoformat() if email.received_at else None,
            "body": email.body,
            "body_content_type": email.body_content_type,
            "status": email.status,
            "error_message": email.error_message,
            "processing_duration_ms": email.processing_duration_ms,
            "attachments": [_attachment_summary(a) for a in email.attachments],
            "invoice": None
            if invoice is None
            else {
                "session_id": invoice.session_id,
                "is_invoice": invoice.is_invoice,
                "ocr_duration_ms": invoice.ocr_duration_ms,
                "vendor_name": invoice.vendor_name,
                "vendor_address": invoice.vendor_address,
                "vendor_zipcode": invoice.vendor_zipcode,
                "billing_address": invoice.billing_address,
                "billing_zipcode": invoice.billing_zipcode,
                "service_address": invoice.service_address,
                "service_zipcode": invoice.service_zipcode,
                "invoice_date": invoice.invoice_date,
                "invoice_number": invoice.invoice_number,
                "purchase_order_number": invoice.purchase_order_number,
                "due_date": invoice.due_date,
                "property_code": invoice.property_code,
                "sub_total": invoice.sub_total,
                "tax": invoice.tax,
                "total": invoice.total,
                "raw_response": invoice.raw_response,
                "line_items": [
                    {
                        "item_name": li.item_name,
                        "qty": li.qty,
                        "unit_price": li.unit_price,
                        "total_price": li.total_price,
                    }
                    for li in invoice.line_items
                ],
            },
        }


@router.get("/{email_id}/attachments/{attachment_id}")
def get_attachment(email_id: int, attachment_id: int):
    """Raw bytes of one attachment, as originally received from Graph -
    available for every attachment on the email, not just the ones that
    were actually forwarded to OCR."""
    with database.get_session() as session:
        attachment = (
            session.query(models.EmailAttachment)
            .filter(models.EmailAttachment.id == attachment_id, models.EmailAttachment.email_id == email_id)
            .one_or_none()
        )
        if attachment is None:
            raise HTTPException(404, "Not found")
        if attachment.content is None:
            raise HTTPException(404, "No content stored for this attachment")

        # filename comes from the mailbox (attacker-influenceable in theory,
        # since anyone can email the watched inbox) - strip characters that
        # could break out of the quoted header value.
        safe_filename = attachment.filename.replace('"', "").replace("\r", "").replace("\n", "")
        return Response(
            content=attachment.content,
            media_type=attachment.content_type or "application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
        )
