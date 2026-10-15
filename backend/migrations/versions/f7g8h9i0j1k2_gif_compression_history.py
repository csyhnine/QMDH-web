"""Persist account-owned GIF compression history."""
from alembic import op
import sqlalchemy as sa

revision = "f7g8h9i0j1k2"
down_revision = "e6f7g8h9i0j1"
branch_labels = None
depends_on = None


def upgrade():
    if not sa.inspect(op.get_bind()).has_table("gif_compression_records"):
        op.create_table("gif_compression_records",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("file_name", sa.String(255), nullable=False),
            sa.Column("original_storage_path", sa.String(255), nullable=False),
            sa.Column("storage_path", sa.String(255), nullable=False),
            sa.Column("compression", sa.JSON(), nullable=False),
            sa.Column("parameters", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
        op.create_index("ix_gif_compression_records_user_id", "gif_compression_records", ["user_id"])
        op.create_index("ix_gif_compression_records_created_at", "gif_compression_records", ["created_at"])


def downgrade():
    op.drop_table("gif_compression_records")
