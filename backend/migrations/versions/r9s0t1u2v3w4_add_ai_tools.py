"""add ai_tools table

Revision ID: r9s0t1u2v3w4
Revises: q8r9s0t1u2v3
Create Date: 2026-07-28

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "r9s0t1u2v3w4"
down_revision = "q8r9s0t1u2v3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_tools",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("cover_image_path", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_ai_tools_category", "ai_tools", ["category"])
    op.create_index("ix_ai_tools_is_featured", "ai_tools", ["is_featured"])
    op.create_index("ix_ai_tools_is_active", "ai_tools", ["is_active"])
    op.create_index("ix_ai_tools_created_by_user_id", "ai_tools", ["created_by_user_id"])
    op.create_index("ix_ai_tools_deleted_at", "ai_tools", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_tools_deleted_at", table_name="ai_tools")
    op.drop_index("ix_ai_tools_created_by_user_id", table_name="ai_tools")
    op.drop_index("ix_ai_tools_is_active", table_name="ai_tools")
    op.drop_index("ix_ai_tools_is_featured", table_name="ai_tools")
    op.drop_index("ix_ai_tools_category", table_name="ai_tools")
    op.drop_table("ai_tools")
