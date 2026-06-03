"""add provider profile display name

Revision ID: 2b3c4d5e6f7a
Revises: 1a2b3c4d5e6f
Create Date: 2026-06-03 23:40:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "2b3c4d5e6f7a"
down_revision = "1a2b3c4d5e6f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "provider_profiles",
        sa.Column("display_name", sa.String(length=150), nullable=False, server_default=""),
    )
    op.execute("UPDATE provider_profiles SET display_name = model_name WHERE COALESCE(display_name, '') = ''")
    op.alter_column("provider_profiles", "display_name", server_default=None)


def downgrade() -> None:
    op.drop_column("provider_profiles", "display_name")
