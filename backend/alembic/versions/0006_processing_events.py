"""add processing_events table

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "processing_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email_id", sa.Integer(), sa.ForeignKey("emails.id"), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=64), nullable=False),
        sa.Column("outcome", sa.String(length=16), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_processing_events_email_id", "processing_events", ["email_id"])


def downgrade() -> None:
    op.drop_index("ix_processing_events_email_id", table_name="processing_events")
    op.drop_table("processing_events")
