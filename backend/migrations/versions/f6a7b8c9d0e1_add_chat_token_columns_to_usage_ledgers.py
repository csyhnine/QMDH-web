"""add chat token columns to usage ledgers

Revision ID: f6a7b8c9d0e1
Revises: e4f5a6b7c8d9
Create Date: 2026-05-20 13:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f6a7b8c9d0e1"
down_revision = "e4f5a6b7c8d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("usage_ledgers", sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("usage_ledgers", sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("usage_ledgers", sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.alter_column("usage_ledgers", "prompt_tokens", server_default=None)
    op.alter_column("usage_ledgers", "completion_tokens", server_default=None)
    op.alter_column("usage_ledgers", "total_tokens", server_default=None)


def downgrade() -> None:
    op.drop_column("usage_ledgers", "total_tokens")
    op.drop_column("usage_ledgers", "completion_tokens")
    op.drop_column("usage_ledgers", "prompt_tokens")
