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
    _replace_conversation_foreign_key("SET NULL")


def _replace_conversation_foreign_key(ondelete: str | None) -> None:
    # Name the originally anonymous SQLite FK during reflection so batch mode
    # can replace it. The name matches PostgreSQL's existing generated name.
    with op.batch_alter_table("agent_memory_entries", naming_convention={
        "fk": "%(table_name)s_%(column_0_name)s_fkey",
    }) as batch:
        batch.drop_constraint("agent_memory_entries_conversation_id_fkey", type_="foreignkey")
        batch.create_foreign_key(
            "agent_memory_entries_conversation_id_fkey",
            "conversations",
            ["conversation_id"],
            ["id"],
            ondelete=ondelete,
        )


def downgrade() -> None:
    _replace_conversation_foreign_key(None)
