"""Add editable prompt polish mode limits JSON.

Revision ID: w4x5y6z7a8b9
Revises: v3w4x5y6z7a8
Create Date: 2026-09-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "w4x5y6z7a8b9"
down_revision = "v3w4x5y6z7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("platform_settings") as batch_op:
        batch_op.add_column(sa.Column("prompt_polish_mode_limits_json", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("platform_settings") as batch_op:
        batch_op.drop_column("prompt_polish_mode_limits_json")
