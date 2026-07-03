"""add agent chat policy fields to skill releases

Revision ID: h9i0j1k2l3m4
Revises: g8h9i0j1k2l3
Create Date: 2026-07-01 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "h9i0j1k2l3m4"
down_revision = "g8h9i0j1k2l3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agent_skill_releases",
        sa.Column("system_prompt_template", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "agent_skill_releases",
        sa.Column("chat_tool_allowlist", sa.JSON(), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("agent_skill_releases", "chat_tool_allowlist")
    op.drop_column("agent_skill_releases", "system_prompt_template")
