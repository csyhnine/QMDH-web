"""add user group name

Revision ID: 3c4d5e6f7a8b
Revises: 2b3c4d5e6f7a
Create Date: 2026-06-04 10:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "3c4d5e6f7a8b"
down_revision = "2b3c4d5e6f7a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("group_name", sa.String(length=120), nullable=False, server_default=""),
    )
    op.alter_column("users", "group_name", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "group_name")
