"""set agent_memory conversation_id ondelete set null

Revision ID: p7q8r9s0t1u2
Revises: o6p7q8r9s0t1
Create Date: 2026-07-26

"""

from __future__ import annotations

from alembic import op

revision = "p7q8r9s0t1u2"
down_revision = "o6p7q8r9s0t1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("agent_memory_entries_conversation_id_fkey", "agent_memory_entries", type_="foreignkey")
    op.create_foreign_key(
        "agent_memory_entries_conversation_id_fkey",
        "agent_memory_entries",
        "conversations",
        ["conversation_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("agent_memory_entries_conversation_id_fkey", "agent_memory_entries", type_="foreignkey")
    op.create_foreign_key(
        "agent_memory_entries_conversation_id_fkey",
        "agent_memory_entries",
        "conversations",
        ["conversation_id"],
        ["id"],
    )
