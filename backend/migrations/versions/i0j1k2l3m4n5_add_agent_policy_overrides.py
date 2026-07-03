"""add agent policy overrides for group/user

Revision ID: i0j1k2l3m4n5
Revises: h9i0j1k2l3m4
Create Date: 2026-07-01 18:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "i0j1k2l3m4n5"
down_revision = "h9i0j1k2l3m4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_policy_overrides",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scope", sa.String(length=20), nullable=False),
        sa.Column("scope_key", sa.String(length=120), nullable=False),
        sa.Column("disabled_tool_keys", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("system_prompt_overlay", sa.Text(), nullable=False, server_default=""),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_policy_overrides_scope", "agent_policy_overrides", ["scope"])
    op.create_index("ix_agent_policy_overrides_scope_key", "agent_policy_overrides", ["scope_key"])
    op.create_index(
        "ix_agent_policy_overrides_scope_scope_key",
        "agent_policy_overrides",
        ["scope", "scope_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_agent_policy_overrides_scope_scope_key", table_name="agent_policy_overrides")
    op.drop_index("ix_agent_policy_overrides_scope_key", table_name="agent_policy_overrides")
    op.drop_index("ix_agent_policy_overrides_scope", table_name="agent_policy_overrides")
    op.drop_table("agent_policy_overrides")
