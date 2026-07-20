"""add conversation context summary fields

Revision ID: i0j1k2l3m4n5
Revises: h9i0j1k2l3m4
Create Date: 2026-07-20 16:50:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "i0j1k2l3m4n5"
down_revision = "h9i0j1k2l3m4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("context_summary", sa.Text(), nullable=False, server_default=""))
    op.add_column("conversations", sa.Column("context_summary_until_message_id", sa.Integer(), nullable=True))
    op.add_column("conversations", sa.Column("context_summary_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("conversations", "context_summary_updated_at")
    op.drop_column("conversations", "context_summary_until_message_id")
    op.drop_column("conversations", "context_summary")
