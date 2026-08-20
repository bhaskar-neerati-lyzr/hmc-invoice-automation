"""KPIs and dead-letter read/write endpoints - mirrors invoice-process's
exact contracts (app/api/kpis/route.ts, app/api/dead-letter-emails/route.ts)
so the ported frontend screens need minimal adaptation.
"""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func

from . import database, models
from .auth import get_current_user
from .invoices_router import ALL_STATUSES

router = APIRouter(tags=["kpis"], dependencies=[Depends(get_current_user)])


def _day_bounds(d_from: date | None, d_to: date | None):
    lower = datetime.combine(d_from, datetime.min.time(), tzinfo=timezone.utc) if d_from else None
    upper = (
        datetime.combine(d_to, datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=1) if d_to else None
    )
    return lower, upper


@router.get("/api/kpis")
def get_kpis(
    received_from: date | None = Query(default=None),
    received_to: date | None = Query(default=None),
):
    lower, upper = _day_bounds(received_from, received_to)

    with database.get_session() as session:
        email_query = session.query(models.Email.status, func.count())
        if lower:
            email_query = email_query.filter(models.Email.received_at >= lower)
        if upper:
            email_query = email_query.filter(models.Email.received_at < upper)

        kpis = dict.fromkeys(ALL_STATUSES, 0)
        total = 0
        for status, count in email_query.group_by(models.Email.status):
            total += count
            if status in kpis:
                kpis[status] = count

        dead_letter_query = session.query(func.count(models.DeadLetterEmail.id))
        if lower:
            dead_letter_query = dead_letter_query.filter(models.DeadLetterEmail.moved_at >= lower)
        if upper:
            dead_letter_query = dead_letter_query.filter(models.DeadLetterEmail.moved_at < upper)
        dead_lettered = dead_letter_query.scalar() or 0

        return {"total": total, **kpis, "dead_lettered": dead_lettered}


@router.get("/api/dead-letter-emails")
def list_dead_letter_emails(
    message_id: str | None = Query(default=None),
    subject: str | None = Query(default=None),
    retry_count: int | None = Query(default=None),
    moved_from: date | None = Query(default=None),
    moved_to: date | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    with database.get_session() as session:
        query = session.query(models.DeadLetterEmail)
        if message_id:
            query = query.filter(models.DeadLetterEmail.message_id == message_id)
        if subject:
            query = query.filter(models.DeadLetterEmail.subject.ilike(f"%{subject}%"))
        if retry_count is not None:
            query = query.filter(models.DeadLetterEmail.retry_count == retry_count)
        lower, upper = _day_bounds(moved_from, moved_to)
        if lower:
            query = query.filter(models.DeadLetterEmail.moved_at >= lower)
        if upper:
            query = query.filter(models.DeadLetterEmail.moved_at < upper)

        total = query.count()
        rows = query.order_by(models.DeadLetterEmail.moved_at.desc()).offset(offset).limit(limit).all()
        return {
            "data": [
                {
                    "id": r.id,
                    "message_id": r.message_id,
                    "subject": r.subject,
                    "last_error": r.last_error,
                    "retry_count": r.retry_count,
                    "moved_at": r.moved_at.isoformat(),
                }
                for r in rows
            ],
            "meta": {"total": total, "limit": limit, "offset": offset},
        }
