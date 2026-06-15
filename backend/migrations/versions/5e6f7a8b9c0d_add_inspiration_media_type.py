"""add inspiration media type

Revision ID: 5e6f7a8b9c0d
Revises: 4d5e6f7a8b9c
Create Date: 2026-06-12 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "5e6f7a8b9c0d"
down_revision = "4d5e6f7a8b9c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "inspiration_posts",
        sa.Column("media_type", sa.String(length=20), nullable=False, server_default="image"),
    )


def downgrade() -> None:
    op.drop_column("inspiration_posts", "media_type")
