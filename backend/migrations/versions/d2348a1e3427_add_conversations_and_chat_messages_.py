"""add conversations and chat_messages tables

Revision ID: d2348a1e3427
Revises: cd888e40cb37
Create Date: 2026-05-13 13:49:17.026785

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2348a1e3427'
down_revision: Union[str, Sequence[str], None] = 'cd888e40cb37'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # This revision was accidentally empty. Freeze the original schema here;
    # later revisions own attachments and context/agent fields. Some historical
    # databases already have these tables from application create_all.
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("conversations"):
        op.create_table(
            "conversations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("model_provider_id", sa.Integer(), sa.ForeignKey("provider_profiles.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_conversations_user_id", "conversations", ["user_id"])
    if not sa.inspect(bind).has_table("chat_messages"):
        op.create_table(
            "chat_messages",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id"), nullable=False),
            sa.Column("role", sa.String(20), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("token_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_chat_messages_conversation_id", "chat_messages", ["conversation_id"])


def downgrade() -> None:
    """Downgrade schema."""
    # Existing installations may have created these tables outside Alembic.
    # Never turn the repaired historical no-op into a chat-history deletion.
    raise RuntimeError("Refusing downgrade: preserve conversations and chat history")
