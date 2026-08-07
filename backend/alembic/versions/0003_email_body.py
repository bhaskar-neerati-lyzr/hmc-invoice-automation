"""add body/body_content_type to emails

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("emails", sa.Column("body", sa.Text(), nullable=True))
    op.add_column("emails", sa.Column("body_content_type", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("emails", "body_content_type")
    op.drop_column("emails", "body")
