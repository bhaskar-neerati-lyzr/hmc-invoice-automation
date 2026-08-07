"""add processing_duration_ms to emails, ocr_duration_ms to invoices

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("emails", sa.Column("processing_duration_ms", sa.Integer(), nullable=True))
    op.add_column("invoices", sa.Column("ocr_duration_ms", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("invoices", "ocr_duration_ms")
    op.drop_column("emails", "processing_duration_ms")
