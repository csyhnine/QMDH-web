"""add admin-managed agent skill catalog

Revision ID: n5o6p7q8r9s0
Revises: m4n5o6p7q8r9
Create Date: 2026-07-21 16:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "n5o6p7q8r9s0"
down_revision = "m4n5o6p7q8r9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_skill_catalog",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=False, server_default="0.1.0"),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("author", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("inputs_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("outputs_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key", name="uq_agent_skill_catalog_key"),
    )
    op.create_index("ix_agent_skill_catalog_key", "agent_skill_catalog", ["key"], unique=False)
    op.create_index("ix_agent_skill_catalog_is_active", "agent_skill_catalog", ["is_active"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_agent_skill_catalog_is_active", table_name="agent_skill_catalog")
    op.drop_index("ix_agent_skill_catalog_key", table_name="agent_skill_catalog")
    op.drop_table("agent_skill_catalog")
