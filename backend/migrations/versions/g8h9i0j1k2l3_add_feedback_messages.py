"""add user_feedback_messages table

Revision ID: g8h9i0j1k2l3
Revises: 6f7a8b9c0d1e
Create Date: 2026-06-29 16:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "g8h9i0j1k2l3"
down_revision = "6f7a8b9c0d1e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_feedback_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("feedback_id", sa.Integer(), nullable=False),
        sa.Column("author_user_id", sa.Integer(), nullable=False),
        sa.Column("author_role", sa.String(length=20), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("attachment_paths", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["author_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["feedback_id"], ["user_feedbacks.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_feedback_messages_feedback_id"), "user_feedback_messages", ["feedback_id"], unique=False)
    op.create_index(op.f("ix_user_feedback_messages_author_user_id"), "user_feedback_messages", ["author_user_id"], unique=False)
    op.create_index(op.f("ix_user_feedback_messages_author_role"), "user_feedback_messages", ["author_role"], unique=False)
    op.create_index(op.f("ix_user_feedback_messages_created_at"), "user_feedback_messages", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_feedback_messages_created_at"), table_name="user_feedback_messages")
    op.drop_index(op.f("ix_user_feedback_messages_author_role"), table_name="user_feedback_messages")
    op.drop_index(op.f("ix_user_feedback_messages_author_user_id"), table_name="user_feedback_messages")
    op.drop_index(op.f("ix_user_feedback_messages_feedback_id"), table_name="user_feedback_messages")
    op.drop_table("user_feedback_messages")
