"""add inspiration source image path

Revision ID: 0f1a2b3c4d5e
Revises: a2b3c4d5e6f7
Create Date: 2026-06-02 17:50:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0f1a2b3c4d5e"
down_revision = "a2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "inspiration_posts",
        sa.Column("source_image_path", sa.String(length=255), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("inspiration_posts", "source_image_path")
