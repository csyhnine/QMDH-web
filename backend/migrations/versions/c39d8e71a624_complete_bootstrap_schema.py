"""Complete schema previously supplied only by application bootstrap.

Revision ID: c39d8e71a624
Revises: b27d0f85c932
"""
from alembic import op
import sqlalchemy as sa

revision = "c39d8e71a624"
down_revision = "b27d0f85c932"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "owner_user_id" not in {col["name"] for col in sa.inspect(bind).get_columns("projects")}:
        # Existing records keep unknown ownership. Do not guess a user from
        # project membership or backfill business ownership during migration.
        with op.batch_alter_table("projects") as batch:
            batch.add_column(sa.Column("owner_user_id", sa.Integer(), nullable=True))
            batch.create_foreign_key("fk_projects_owner_user_id", "users", ["owner_user_id"], ["id"])
    if "ix_projects_owner_user_id" not in {idx["name"] for idx in sa.inspect(bind).get_indexes("projects")}:
        op.create_index("ix_projects_owner_user_id", "projects", ["owner_user_id"])
    if not sa.inspect(bind).has_table("canvas_projects"):
        op.create_table(
            "canvas_projects",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("title", sa.String(150), nullable=False),
            sa.Column("graph_json", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index("ix_canvas_projects_owner_user_id", "canvas_projects", ["owner_user_id"])
        op.create_index("ix_canvas_projects_deleted_at", "canvas_projects", ["deleted_at"])


def downgrade() -> None:
    raise RuntimeError("Refusing downgrade: preserve project ownership and canvas history")
