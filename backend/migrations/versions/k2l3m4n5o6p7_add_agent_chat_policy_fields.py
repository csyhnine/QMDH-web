"""add agent chat policy fields to skill releases

Revision ID: k2l3m4n5o6p7
Revises: i0j1k2l3m4n5
Create Date: 2026-07-20 19:50:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "k2l3m4n5o6p7"
down_revision = "i0j1k2l3m4n5"
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
