"""add prompt polish platform settings

Revision ID: t1u2v3w4x5y6
Revises: s0t1u2v3w4x5
Create Date: 2026-08-27

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "t1u2v3w4x5y6"
down_revision = "s0t1u2v3w4x5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("platform_settings") as batch_op:
        batch_op.add_column(
            sa.Column("prompt_polish_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )
        batch_op.add_column(
            sa.Column("prompt_polish_provider_id", sa.Integer(), nullable=True),
        )
        batch_op.add_column(
            sa.Column("prompt_polish_system_prompt", sa.Text(), nullable=True),
        )
        batch_op.create_foreign_key(
            "fk_platform_settings_prompt_polish_provider_id",
            "provider_profiles",
            ["prompt_polish_provider_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            "ix_platform_settings_prompt_polish_provider_id",
            ["prompt_polish_provider_id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("platform_settings") as batch_op:
        batch_op.drop_index("ix_platform_settings_prompt_polish_provider_id")
        batch_op.drop_constraint("fk_platform_settings_prompt_polish_provider_id", type_="foreignkey")
        batch_op.drop_column("prompt_polish_system_prompt")
        batch_op.drop_column("prompt_polish_provider_id")
        batch_op.drop_column("prompt_polish_enabled")
