"""add provider profile secret config

Revision ID: 4d5e6f7a8b9c
Revises: 3c4d5e6f7a8b
Create Date: 2026-06-09 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "4d5e6f7a8b9c"
down_revision = "3c4d5e6f7a8b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("provider_profiles", sa.Column("api_secret", sa.Text(), nullable=False, server_default=""))
    op.add_column("provider_profiles", sa.Column("adapter_config", sa.JSON(), nullable=False, server_default="{}"))
    op.alter_column("provider_profiles", "api_secret", server_default=None)
    op.alter_column("provider_profiles", "adapter_config", server_default=None)


def downgrade() -> None:
    op.drop_column("provider_profiles", "adapter_config")
    op.drop_column("provider_profiles", "api_secret")
