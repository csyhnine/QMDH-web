"""Add chat turn telemetry table for UX funnel metrics.

Revision ID: x9y0z1a2b3c4
Revises: w4x5y6z7a8b9
Create Date: 2026-09-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "x9y0z1a2b3c4"
down_revision = "w4x5y6z7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_turn_telemetry",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("correlation_id", sa.String(length=64), nullable=False),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("user_message_id", sa.Integer(), sa.ForeignKey("chat_messages.id"), nullable=True),
        sa.Column("assistant_message_id", sa.Integer(), sa.ForeignKey("chat_messages.id"), nullable=True),
        sa.Column("provider_name", sa.String(length=100), nullable=False, server_default=""),
        sa.Column("model_name", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("agent_mode", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("outcome", sa.String(length=40), nullable=False, server_default="in_progress"),
        sa.Column("error_code", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("error_summary", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("attachment_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("attachment_types_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("attachment_total_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content_length", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pack_duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("upstream_duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ttft_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("upstream_called", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("context_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("context_usage_percent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stage_events_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("client_events_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_chat_turn_telemetry_correlation_id", "chat_turn_telemetry", ["correlation_id"])
    op.create_index("ix_chat_turn_telemetry_conversation_id", "chat_turn_telemetry", ["conversation_id"])
    op.create_index("ix_chat_turn_telemetry_user_id", "chat_turn_telemetry", ["user_id"])
    op.create_index("ix_chat_turn_telemetry_user_message_id", "chat_turn_telemetry", ["user_message_id"])
    op.create_index("ix_chat_turn_telemetry_outcome", "chat_turn_telemetry", ["outcome"])
    op.create_index("ix_chat_turn_telemetry_started_at", "chat_turn_telemetry", ["started_at"])


def downgrade() -> None:
    op.drop_table("chat_turn_telemetry")
