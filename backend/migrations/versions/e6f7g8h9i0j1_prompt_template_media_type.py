"""Separate image and video prompt templates; preserve existing templates."""
from alembic import op
import sqlalchemy as sa

revision = "e6f7g8h9i0j1"
down_revision = "d5e6f7g8h9i0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("prompt_templates")}
    if "media_type" not in columns:
        op.add_column("prompt_templates", sa.Column("media_type", sa.String(10), nullable=False, server_default="image"))


def downgrade() -> None:
    op.drop_column("prompt_templates", "media_type")
