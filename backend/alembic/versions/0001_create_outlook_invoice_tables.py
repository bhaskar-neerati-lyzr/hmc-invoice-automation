"""create outlook invoice tables

Revision ID: 0001
Revises:
Create Date: 2026-08-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "emails",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("message_id", sa.String(length=256), nullable=False),
        sa.Column("subject", sa.Text(), nullable=True),
        sa.Column("sender_name", sa.String(length=256), nullable=True),
        sa.Column("sender_email", sa.String(length=256), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("has_attachments", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("attachments", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_emails_message_id", "emails", ["message_id"], unique=True)
    op.create_index("ix_emails_status", "emails", ["status"])

    op.create_table(
        "invoices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email_id", sa.Integer(), sa.ForeignKey("emails.id"), nullable=False, unique=True),
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("is_invoice", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("vendor_name", sa.Text(), nullable=True),
        sa.Column("vendor_address", sa.Text(), nullable=True),
        sa.Column("vendor_zipcode", sa.String(length=32), nullable=True),
        sa.Column("billing_address", sa.Text(), nullable=True),
        sa.Column("billing_zipcode", sa.String(length=32), nullable=True),
        sa.Column("service_address", sa.Text(), nullable=True),
        sa.Column("service_zipcode", sa.String(length=32), nullable=True),
        sa.Column("invoice_date", sa.String(length=32), nullable=True),
        sa.Column("invoice_number", sa.String(length=128), nullable=True),
        sa.Column("purchase_order_number", sa.String(length=128), nullable=True),
        sa.Column("due_date", sa.String(length=32), nullable=True),
        sa.Column("property_code", sa.String(length=64), nullable=True),
        sa.Column("sub_total", sa.String(length=32), nullable=True),
        sa.Column("tax", sa.String(length=32), nullable=True),
        sa.Column("total", sa.String(length=32), nullable=True),
        sa.Column("raw_response", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "invoice_line_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("invoice_id", sa.Integer(), sa.ForeignKey("invoices.id"), nullable=False),
        sa.Column("item_name", sa.Text(), nullable=True),
        sa.Column("qty", sa.String(length=32), nullable=True),
        sa.Column("unit_price", sa.String(length=32), nullable=True),
        sa.Column("total_price", sa.String(length=32), nullable=True),
    )
    op.create_index("ix_invoice_line_items_invoice_id", "invoice_line_items", ["invoice_id"])


def downgrade() -> None:
    op.drop_index("ix_invoice_line_items_invoice_id", table_name="invoice_line_items")
    op.drop_table("invoice_line_items")
    op.drop_table("invoices")
    op.drop_index("ix_emails_status", table_name="emails")
    op.drop_index("ix_emails_message_id", table_name="emails")
    op.drop_table("emails")
