"""add site_announcements table

Revision ID: q8r9s0t1u2v3
Revises: p7q8r9s0t1u2
Create Date: 2026-07-28

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "q8r9s0t1u2v3"
down_revision = "p7q8r9s0t1u2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "site_announcements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_site_announcements_is_active", "site_announcements", ["is_active"])
    op.create_index("ix_site_announcements_starts_at", "site_announcements", ["starts_at"])
    op.create_index("ix_site_announcements_ends_at", "site_announcements", ["ends_at"])
    op.create_index("ix_site_announcements_created_by_user_id", "site_announcements", ["created_by_user_id"])
    op.create_index("ix_site_announcements_deleted_at", "site_announcements", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("ix_site_announcements_deleted_at", table_name="site_announcements")
    op.drop_index("ix_site_announcements_created_by_user_id", table_name="site_announcements")
    op.drop_index("ix_site_announcements_ends_at", table_name="site_announcements")
    op.drop_index("ix_site_announcements_starts_at", table_name="site_announcements")
    op.drop_index("ix_site_announcements_is_active", table_name="site_announcements")
    op.drop_table("site_announcements")
