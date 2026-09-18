"""Add per-mode prompt polish system prompts.

Revision ID: v3w4x5y6z7a8
Revises: a8b9c0d1e2f3
Create Date: 2026-09-18
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "v3w4x5y6z7a8"
down_revision = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("platform_settings") as batch_op:
        batch_op.add_column(sa.Column("prompt_polish_system_prompt_generate", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("prompt_polish_system_prompt_edit", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("prompt_polish_system_prompt_video", sa.Text(), nullable=True))

    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            "SELECT id, prompt_polish_system_prompt FROM platform_settings "
            "WHERE prompt_polish_system_prompt IS NOT NULL AND TRIM(prompt_polish_system_prompt) != ''"
        )
    ).fetchall()
    for row in rows:
        legacy_prompt = str(row.prompt_polish_system_prompt).strip()
        connection.execute(
            sa.text(
                """
                UPDATE platform_settings
                SET
                    prompt_polish_system_prompt_generate = :legacy_prompt,
                    prompt_polish_system_prompt_edit = :legacy_prompt,
                    prompt_polish_system_prompt_video = :legacy_prompt
                WHERE id = :row_id
                """
            ),
            {"legacy_prompt": legacy_prompt, "row_id": row.id},
        )


def downgrade() -> None:
    with op.batch_alter_table("platform_settings") as batch_op:
        batch_op.drop_column("prompt_polish_system_prompt_video")
        batch_op.drop_column("prompt_polish_system_prompt_edit")
        batch_op.drop_column("prompt_polish_system_prompt_generate")
