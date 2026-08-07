"""SQLAlchemy models for invoices ingested via the Outlook mailbox automation."""

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Email(Base):
    """One row per Microsoft Graph message the webhook has processed.

    `message_id` also doubles as the dedup/retry key (see
    processor._claim_or_retry_message): a notification for a message that
    already reached a terminal-success status here is skipped as a true
    duplicate, but one still `pending`/`failed` is retried in place rather
    than reprocessed as a new row - necessary once notifications arrive via
    SQS, which redelivers at-least-once on failure.
    """

    __tablename__ = "emails"

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[str] = mapped_column(String(256), unique=True, index=True)
    subject: Mapped[str | None] = mapped_column(Text, nullable=True)
    sender_name: Mapped[str | None] = mapped_column(String(256), nullable=True)
    sender_email: Mapped[str | None] = mapped_column(String(256), nullable=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    has_attachments: Mapped[bool] = mapped_column(Boolean, default=False)
    # The message body verbatim, from Graph's `body.content`/`body.contentType`
    # (usually "html", occasionally "text") - filled in by
    # processor._update_email_from_message alongside subject/sender. Not
    # sanitized/rendered - stored exactly as Graph returned it.
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_content_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # pending | processed | skipped_no_attachments | skipped_bad_attachment | failed
    # "pending" and "failed" are both retry-eligible - see
    # processor._claim_or_retry_message - since a "pending" row can mean the
    # worker crashed mid-flight before reaching a terminal status.
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    invoice: Mapped["Invoice | None"] = relationship(back_populates="email", uselist=False)
    attachments: Mapped[list["EmailAttachment"]] = relationship(
        back_populates="email", cascade="all, delete-orphan", order_by="EmailAttachment.id"
    )


class EmailAttachment(Base):
    """One row per attachment Graph reported on an email - including ones
    that were skipped/not forwarded to OCR - so the original file can still
    be inspected or downloaded later, not just its filename and skip reason.

    `content` holds the raw decoded bytes whenever Graph actually returned
    them inline; it's null when Graph never gave us contentBytes to begin
    with (e.g. a forwarded-email attachment, or one too large to inline).
    """

    __tablename__ = "email_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    email_id: Mapped[int] = mapped_column(ForeignKey("emails.id"), index=True)
    filename: Mapped[str] = mapped_column(Text)
    content_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    forwarded: Mapped[bool] = mapped_column(Boolean, default=False)
    skip_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    email: Mapped["Email"] = relationship(back_populates="attachments")


class Invoice(Base):
    """One row per OCR result - 1:1 with an Email, since all forwardable
    attachments from a single email are sent to /api/ocr in one call."""

    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    email_id: Mapped[int] = mapped_column(ForeignKey("emails.id"), unique=True)
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_invoice: Mapped[bool] = mapped_column(Boolean, default=False)

    vendor_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    vendor_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    vendor_zipcode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    billing_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    billing_zipcode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    service_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    service_zipcode: Mapped[str | None] = mapped_column(String(32), nullable=True)
    invoice_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    purchase_order_number: Mapped[str | None] = mapped_column(String(128), nullable=True)
    due_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    property_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Stored as strings, not Numeric: the OCR backend returns these as
    # best-effort cleaned strings (see backend/normalize.py clean_money),
    # not guaranteed-parseable numbers.
    sub_total: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tax: Mapped[str | None] = mapped_column(String(32), nullable=True)
    total: Mapped[str | None] = mapped_column(String(32), nullable=True)

    raw_response: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    email: Mapped["Email"] = relationship(back_populates="invoice")
    line_items: Mapped[list["InvoiceLineItem"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )


class InvoiceLineItem(Base):
    __tablename__ = "invoice_line_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"))
    item_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    qty: Mapped[str | None] = mapped_column(String(32), nullable=True)
    unit_price: Mapped[str | None] = mapped_column(String(32), nullable=True)
    total_price: Mapped[str | None] = mapped_column(String(32), nullable=True)

    invoice: Mapped["Invoice"] = relationship(back_populates="line_items")
