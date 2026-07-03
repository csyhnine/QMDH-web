"""add multi-agent personas, assignments, memory entries

Revision ID: j0k1l2m3n4o5
Revises: i0j1k2l3m4n5
Create Date: 2026-07-01 20:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "j0k1l2m3n4o5"
down_revision = "i0j1k2l3m4n5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_personas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("display_name", sa.String(length=150), nullable=False),
        sa.Column("role", sa.String(length=30), nullable=False, server_default="custom"),
        sa.Column("system_prompt_template", sa.Text(), nullable=False, server_default=""),
        sa.Column("chat_tool_allowlist", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("memory_scope", sa.String(length=20), nullable=False, server_default="both"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_personas_key", "agent_personas", ["key"], unique=True)
    op.create_index("ix_agent_personas_role", "agent_personas", ["role"], unique=False)

    op.create_table(
        "user_agent_assignments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("persona_id", sa.Integer(), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["persona_id"], ["agent_personas.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "persona_id", name="uq_user_agent_assignments_user_persona"),
    )
    op.create_index("ix_user_agent_assignments_user_id", "user_agent_assignments", ["user_id"], unique=False)
    op.create_index("ix_user_agent_assignments_persona_id", "user_agent_assignments", ["persona_id"], unique=False)

    op.create_table(
        "agent_memory_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("persona_id", sa.Integer(), nullable=True),
        sa.Column("conversation_id", sa.Integer(), nullable=True),
        sa.Column("memory_type", sa.String(length=30), nullable=False, server_default="summary"),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("source_turn_ref", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.ForeignKeyConstraint(["persona_id"], ["agent_personas.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_memory_entries_user_id", "agent_memory_entries", ["user_id"], unique=False)
    op.create_index("ix_agent_memory_entries_persona_id", "agent_memory_entries", ["persona_id"], unique=False)
    op.create_index("ix_agent_memory_entries_conversation_id", "agent_memory_entries", ["conversation_id"], unique=False)
    op.create_index("ix_agent_memory_entries_memory_type", "agent_memory_entries", ["memory_type"], unique=False)
    op.create_index("ix_agent_memory_entries_created_at", "agent_memory_entries", ["created_at"], unique=False)

    with op.batch_alter_table("conversations") as batch_op:
        batch_op.add_column(sa.Column("agent_thread_id", sa.String(length=120), nullable=False, server_default=""))
        batch_op.create_index("ix_conversations_agent_thread_id", ["agent_thread_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("conversations") as batch_op:
        batch_op.drop_index("ix_conversations_agent_thread_id")
        batch_op.drop_column("agent_thread_id")

    op.drop_index("ix_agent_memory_entries_created_at", table_name="agent_memory_entries")
    op.drop_index("ix_agent_memory_entries_memory_type", table_name="agent_memory_entries")
    op.drop_index("ix_agent_memory_entries_conversation_id", table_name="agent_memory_entries")
    op.drop_index("ix_agent_memory_entries_persona_id", table_name="agent_memory_entries")
    op.drop_index("ix_agent_memory_entries_user_id", table_name="agent_memory_entries")
    op.drop_table("agent_memory_entries")

    op.drop_index("ix_user_agent_assignments_persona_id", table_name="user_agent_assignments")
    op.drop_index("ix_user_agent_assignments_user_id", table_name="user_agent_assignments")
    op.drop_table("user_agent_assignments")

    op.drop_index("ix_agent_personas_role", table_name="agent_personas")
    op.drop_index("ix_agent_personas_key", table_name="agent_personas")
    op.drop_table("agent_personas")
