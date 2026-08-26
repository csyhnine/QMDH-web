"""add platform_settings singleton

Revision ID: s0t1u2v3w4x5
Revises: r9s0t1u2v3w4
Create Date: 2026-08-26

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "s0t1u2v3w4x5"
down_revision = "r9s0t1u2v3w4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("chat_agent_ui_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("updated_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index(
        "ix_platform_settings_updated_by_user_id",
        "platform_settings",
        ["updated_by_user_id"],
    )
    op.execute(
        sa.text(
            "INSERT INTO platform_settings (id, chat_agent_ui_enabled) VALUES (1, false)"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_platform_settings_updated_by_user_id", table_name="platform_settings")
    op.drop_table("platform_settings")
