"""add skill bundle columns to agent_skill_catalog

Revision ID: o6p7q8r9s0t1
Revises: n5o6p7q8r9s0
Create Date: 2026-07-22 10:52:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "o6p7q8r9s0t1"
down_revision = "n5o6p7q8r9s0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agent_skill_catalog", sa.Column("source_uri", sa.Text(), nullable=False, server_default=""))
    op.add_column("agent_skill_catalog", sa.Column("source_repo", sa.String(length=255), nullable=False, server_default=""))
    op.add_column("agent_skill_catalog", sa.Column("source_path", sa.String(length=500), nullable=False, server_default=""))
    op.add_column("agent_skill_catalog", sa.Column("skill_md", sa.Text(), nullable=False, server_default=""))
    op.add_column("agent_skill_catalog", sa.Column("files_json", sa.JSON(), nullable=False, server_default="{}"))
    op.add_column("agent_skill_catalog", sa.Column("file_manifest", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("agent_skill_catalog", sa.Column("content_hash", sa.String(length=64), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("agent_skill_catalog", "content_hash")
    op.drop_column("agent_skill_catalog", "file_manifest")
    op.drop_column("agent_skill_catalog", "files_json")
    op.drop_column("agent_skill_catalog", "skill_md")
    op.drop_column("agent_skill_catalog", "source_path")
    op.drop_column("agent_skill_catalog", "source_repo")
    op.drop_column("agent_skill_catalog", "source_uri")
