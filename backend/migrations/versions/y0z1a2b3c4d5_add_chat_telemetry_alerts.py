"""Add chat telemetry alert records for P3 monitoring.

Revision ID: y0z1a2b3c4d5
Revises: x9y0z1a2b3c4
Create Date: 2026-09-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "y0z1a2b3c4d5"
down_revision = "x9y0z1a2b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_telemetry_alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("alert_key", sa.String(length=80), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False, server_default="warning"),
        sa.Column("title", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("message", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("window_hours", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("metrics_json", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("occurrence_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_chat_telemetry_alerts_alert_key", "chat_telemetry_alerts", ["alert_key"])
    op.create_index("ix_chat_telemetry_alerts_status", "chat_telemetry_alerts", ["status"])
    op.create_index("ix_chat_telemetry_alerts_last_seen_at", "chat_telemetry_alerts", ["last_seen_at"])


def downgrade() -> None:
    op.drop_table("chat_telemetry_alerts")
