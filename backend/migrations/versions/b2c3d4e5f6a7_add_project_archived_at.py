"""add project archived_at

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-18 10:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add archived_at column to projects table for archive-style deletion."""
    op.add_column(
        'projects',
        sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index(
        'ix_projects_archived_at',
        'projects',
        ['archived_at'],
    )


def downgrade() -> None:
    """Remove archived_at column from projects table."""
    op.drop_index('ix_projects_archived_at', table_name='projects')
    op.drop_column('projects', 'archived_at')
