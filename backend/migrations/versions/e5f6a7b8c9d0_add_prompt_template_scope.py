"""add prompt template scope

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-29 10:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "prompt_templates",
        sa.Column("scope", sa.String(length=20), nullable=False, server_default="private"),
    )
    op.add_column(
        "prompt_templates",
        sa.Column("preview_image_path", sa.String(length=255), nullable=False, server_default=""),
    )
    op.create_index(op.f("ix_prompt_templates_scope"), "prompt_templates", ["scope"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_prompt_templates_scope"), table_name="prompt_templates")
    op.drop_column("prompt_templates", "preview_image_path")
    op.drop_column("prompt_templates", "scope")
