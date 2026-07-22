"""add agent memory entries for durable cross-chat memory

Revision ID: m4n5o6p7q8r9
Revises: l3m4n5o6p7q8
Create Date: 2026-07-21 16:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "m4n5o6p7q8r9"
down_revision = "l3m4n5o6p7q8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_memory_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=True),
        sa.Column("memory_type", sa.String(length=30), nullable=False, server_default="summary"),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("source_turn_ref", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("is_paused", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_memory_entries_user_id", "agent_memory_entries", ["user_id"], unique=False)
    op.create_index(
        "ix_agent_memory_entries_conversation_id",
        "agent_memory_entries",
        ["conversation_id"],
        unique=False,
    )
    op.create_index("ix_agent_memory_entries_is_paused", "agent_memory_entries", ["is_paused"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_agent_memory_entries_is_paused", table_name="agent_memory_entries")
    op.drop_index("ix_agent_memory_entries_conversation_id", table_name="agent_memory_entries")
    op.drop_index("ix_agent_memory_entries_user_id", table_name="agent_memory_entries")
    op.drop_table("agent_memory_entries")
