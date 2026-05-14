"""add task deleted_at

Revision ID: a1b2c3d4e5f6
Revises: d2348a1e3427
Create Date: 2026-05-20 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'd2348a1e3427'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add deleted_at column to tasks table for soft-delete support."""
    op.add_column(
        'tasks',
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index(
        'ix_tasks_deleted_at',
        'tasks',
        ['deleted_at'],
    )


def downgrade() -> None:
    """Remove deleted_at column from tasks table."""
    op.drop_index('ix_tasks_deleted_at', table_name='tasks')
    op.drop_column('tasks', 'deleted_at')
