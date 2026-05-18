"""add task archives

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-18 10:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add structured task and provider-call archive tables."""
    op.create_table(
        'task_archives',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=True),
        sa.Column('project_code', sa.String(length=50), nullable=False),
        sa.Column('project_name', sa.String(length=150), nullable=False),
        sa.Column('workflow_key', sa.String(length=100), nullable=False),
        sa.Column('workflow_name', sa.String(length=150), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('user_name', sa.String(length=100), nullable=False),
        sa.Column('requested_provider', sa.String(length=100), nullable=False),
        sa.Column('classification', sa.Enum('a', 'b', 'c', name='dataclassification'), nullable=False),
        sa.Column('task_status', sa.Enum('pending', 'running', 'completed', 'failed', name='taskstatus'), nullable=False),
        sa.Column('cost', sa.Float(), nullable=False),
        sa.Column('cost_currency', sa.String(length=12), nullable=False),
        sa.Column('latency_ms', sa.Integer(), nullable=False),
        sa.Column('provider_call_count', sa.Integer(), nullable=False),
        sa.Column('asset_count', sa.Integer(), nullable=False),
        sa.Column('archive_source', sa.String(length=50), nullable=False),
        sa.Column('archive_reason', sa.Text(), nullable=False),
        sa.Column('source_deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('task_created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('task_updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('archived_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_task_archives_archived_at', 'task_archives', ['archived_at'], unique=False)
    op.create_index('ix_task_archives_archive_source', 'task_archives', ['archive_source'], unique=False)
    op.create_index('ix_task_archives_project_code', 'task_archives', ['project_code'], unique=False)
    op.create_index('ix_task_archives_requested_provider', 'task_archives', ['requested_provider'], unique=False)
    op.create_index('ix_task_archives_task_id', 'task_archives', ['task_id'], unique=True)
    op.create_index('ix_task_archives_user_name', 'task_archives', ['user_name'], unique=False)

    op.create_table(
        'provider_call_archives',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('provider_call_id', sa.Integer(), nullable=False),
        sa.Column('task_archive_id', sa.Integer(), nullable=False),
        sa.Column('provider_name', sa.String(length=50), nullable=False),
        sa.Column('model_name', sa.String(length=100), nullable=False),
        sa.Column('capability', sa.String(length=50), nullable=False),
        sa.Column('cost', sa.Float(), nullable=False),
        sa.Column('cost_currency', sa.String(length=12), nullable=False),
        sa.Column('latency_ms', sa.Integer(), nullable=False),
        sa.Column('outbound', sa.Boolean(), nullable=False),
        sa.Column('call_created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('archived_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['task_archive_id'], ['task_archives.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_provider_call_archives_archived_at', 'provider_call_archives', ['archived_at'], unique=False)
    op.create_index('ix_provider_call_archives_provider_call_id', 'provider_call_archives', ['provider_call_id'], unique=True)
    op.create_index('ix_provider_call_archives_provider_name', 'provider_call_archives', ['provider_name'], unique=False)
    op.create_index('ix_provider_call_archives_task_archive_id', 'provider_call_archives', ['task_archive_id'], unique=False)


def downgrade() -> None:
    """Remove task archive tables."""
    op.drop_index('ix_provider_call_archives_task_archive_id', table_name='provider_call_archives')
    op.drop_index('ix_provider_call_archives_provider_name', table_name='provider_call_archives')
    op.drop_index('ix_provider_call_archives_provider_call_id', table_name='provider_call_archives')
    op.drop_index('ix_provider_call_archives_archived_at', table_name='provider_call_archives')
    op.drop_table('provider_call_archives')

    op.drop_index('ix_task_archives_user_name', table_name='task_archives')
    op.drop_index('ix_task_archives_task_id', table_name='task_archives')
    op.drop_index('ix_task_archives_requested_provider', table_name='task_archives')
    op.drop_index('ix_task_archives_project_code', table_name='task_archives')
    op.drop_index('ix_task_archives_archive_source', table_name='task_archives')
    op.drop_index('ix_task_archives_archived_at', table_name='task_archives')
    op.drop_table('task_archives')
