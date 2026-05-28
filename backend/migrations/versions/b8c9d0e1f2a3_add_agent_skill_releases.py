"""add agent skill releases

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-05-28 18:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "b8c9d0e1f2a3"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_skill_releases",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("display_name", sa.String(length=150), nullable=False),
        sa.Column("environment", sa.String(length=30), nullable=False),
        sa.Column("openclaw_version", sa.String(length=50), nullable=False),
        sa.Column("skill_keys", sa.JSON(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_skill_releases_created_by_user_id", "agent_skill_releases", ["created_by_user_id"], unique=False)
    op.create_index("ix_agent_skill_releases_environment", "agent_skill_releases", ["environment"], unique=False)
    op.create_index("ix_agent_skill_releases_key", "agent_skill_releases", ["key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_agent_skill_releases_key", table_name="agent_skill_releases")
    op.drop_index("ix_agent_skill_releases_environment", table_name="agent_skill_releases")
    op.drop_index("ix_agent_skill_releases_created_by_user_id", table_name="agent_skill_releases")
    op.drop_table("agent_skill_releases")
