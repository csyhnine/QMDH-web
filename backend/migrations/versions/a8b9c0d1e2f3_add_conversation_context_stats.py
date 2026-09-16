"""add conversation context stats and message estimated_input_tokens

Revision ID: a8b9c0d1e2f3
Revises: z7a8b9c0d1e2
Create Date: 2026-09-15
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a8b9c0d1e2f3"
down_revision = "z7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("context_summary_tokens", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "conversations",
        sa.Column("context_recent_tokens", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "conversations",
        sa.Column("context_uncovered_tokens", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "conversations",
        sa.Column("context_packed_tokens", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "conversations",
        sa.Column("context_stats_updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "chat_messages",
        sa.Column("estimated_input_tokens", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("chat_messages", "estimated_input_tokens")
    op.drop_column("conversations", "context_stats_updated_at")
    op.drop_column("conversations", "context_packed_tokens")
    op.drop_column("conversations", "context_uncovered_tokens")
    op.drop_column("conversations", "context_recent_tokens")
    op.drop_column("conversations", "context_summary_tokens")
