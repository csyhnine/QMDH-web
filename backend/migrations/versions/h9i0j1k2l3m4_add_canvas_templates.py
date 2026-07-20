"""add canvas_templates table

Revision ID: h9i0j1k2l3m4
Revises: g8h9i0j1k2l3
Create Date: 2026-07-20 16:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "h9i0j1k2l3m4"
down_revision = "g8h9i0j1k2l3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "canvas_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=150), nullable=False, server_default="未命名模板"),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("category", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("graph_json", sa.JSON(), nullable=False),
        sa.Column("preview_image_path", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_canvas_templates_category"), "canvas_templates", ["category"], unique=False)
    op.create_index(op.f("ix_canvas_templates_is_featured"), "canvas_templates", ["is_featured"], unique=False)
    op.create_index(op.f("ix_canvas_templates_created_by_user_id"), "canvas_templates", ["created_by_user_id"], unique=False)
    op.create_index(op.f("ix_canvas_templates_deleted_at"), "canvas_templates", ["deleted_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_canvas_templates_deleted_at"), table_name="canvas_templates")
    op.drop_index(op.f("ix_canvas_templates_created_by_user_id"), table_name="canvas_templates")
    op.drop_index(op.f("ix_canvas_templates_is_featured"), table_name="canvas_templates")
    op.drop_index(op.f("ix_canvas_templates_category"), table_name="canvas_templates")
    op.drop_table("canvas_templates")
