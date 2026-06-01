"""add prompt template taxonomy and source image

Revision ID: f7a8b9c0d1e2
Revises: e5f6a7b8c9d0
Create Date: 2026-06-01 13:40:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "f7a8b9c0d1e2"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "prompt_templates",
        sa.Column("category", sa.String(length=80), nullable=False, server_default=""),
    )
    op.add_column(
        "prompt_templates",
        sa.Column("subcategory", sa.String(length=80), nullable=False, server_default=""),
    )
    op.add_column(
        "prompt_templates",
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "prompt_templates",
        sa.Column("source_image_path", sa.String(length=255), nullable=False, server_default=""),
    )
    op.create_index(op.f("ix_prompt_templates_category"), "prompt_templates", ["category"], unique=False)
    op.create_index(op.f("ix_prompt_templates_is_featured"), "prompt_templates", ["is_featured"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_prompt_templates_is_featured"), table_name="prompt_templates")
    op.drop_index(op.f("ix_prompt_templates_category"), table_name="prompt_templates")
    op.drop_column("prompt_templates", "source_image_path")
    op.drop_column("prompt_templates", "is_featured")
    op.drop_column("prompt_templates", "subcategory")
    op.drop_column("prompt_templates", "category")
