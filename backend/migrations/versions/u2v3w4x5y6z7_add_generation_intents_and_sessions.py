"""add generation intents and sessions for behavior analytics

Revision ID: u2v3w4x5y6z7
Revises: t1u2v3w4x5y6
Create Date: 2026-08-27

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "u2v3w4x5y6z7"
down_revision = "t1u2v3w4x5y6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "generation_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("ref_fingerprint", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("session_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("session_ended_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submit_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("prompt_variant_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("dominant_prompt_fingerprint", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("dominant_template_id", sa.Integer(), nullable=True),
        sa.Column("gacha_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("explore_score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("provider_switch_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("metrics", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("computed_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["dominant_template_id"], ["prompt_templates.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_generation_sessions_user_id", "generation_sessions", ["user_id"])
    op.create_index("ix_generation_sessions_ref_fingerprint", "generation_sessions", ["ref_fingerprint"])
    op.create_index("ix_generation_sessions_session_started_at", "generation_sessions", ["session_started_at"])

    op.create_table(
        "generation_intents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=True),
        sa.Column("template_id", sa.Integer(), nullable=True),
        sa.Column("source_surface", sa.String(length=32), nullable=False, server_default="studio"),
        sa.Column("canvas_node_id", sa.String(length=80), nullable=True),
        sa.Column("creation_mode", sa.String(length=32), nullable=False, server_default="generate"),
        sa.Column("workflow_key", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("prompt_raw", sa.Text(), nullable=False, server_default=""),
        sa.Column("prompt_fingerprint", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("ref_fingerprint", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("ref_paths", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("requested_provider", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("task_status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("has_asset", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("outcome_signals", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["generation_sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["prompt_templates.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("task_id"),
    )
    op.create_index("ix_generation_intents_user_id", "generation_intents", ["user_id"])
    op.create_index("ix_generation_intents_session_id", "generation_intents", ["session_id"])
    op.create_index("ix_generation_intents_template_id", "generation_intents", ["template_id"])
    op.create_index("ix_generation_intents_ref_fingerprint", "generation_intents", ["ref_fingerprint"])
    op.create_index("ix_generation_intents_prompt_fingerprint", "generation_intents", ["prompt_fingerprint"])
    op.create_index("ix_generation_intents_submitted_at", "generation_intents", ["submitted_at"])
    op.create_index(
        "ix_generation_intents_user_ref_submitted",
        "generation_intents",
        ["user_id", "ref_fingerprint", "submitted_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_generation_intents_user_ref_submitted", table_name="generation_intents")
    op.drop_index("ix_generation_intents_submitted_at", table_name="generation_intents")
    op.drop_index("ix_generation_intents_prompt_fingerprint", table_name="generation_intents")
    op.drop_index("ix_generation_intents_ref_fingerprint", table_name="generation_intents")
    op.drop_index("ix_generation_intents_template_id", table_name="generation_intents")
    op.drop_index("ix_generation_intents_session_id", table_name="generation_intents")
    op.drop_index("ix_generation_intents_user_id", table_name="generation_intents")
    op.drop_table("generation_intents")
    op.drop_index("ix_generation_sessions_session_started_at", table_name="generation_sessions")
    op.drop_index("ix_generation_sessions_ref_fingerprint", table_name="generation_sessions")
    op.drop_index("ix_generation_sessions_user_id", table_name="generation_sessions")
    op.drop_table("generation_sessions")
