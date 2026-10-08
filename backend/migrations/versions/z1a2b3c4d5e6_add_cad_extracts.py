"""Add cad_extracts for DWG/DXF structured extracts.

Revision ID: z1a2b3c4d5e6
Revises: y0z1a2b3c4d5
Create Date: 2026-09-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "z1a2b3c4d5e6"
down_revision = "y0z1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cad_extracts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("source_format", sa.String(length=8), nullable=False),
        sa.Column("source_storage_path", sa.String(length=255), nullable=False),
        sa.Column("converted_dxf_path", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("extract_json_path", sa.String(length=255), nullable=True),
        sa.Column("payload_json", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("warnings_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("error_message", sa.String(length=255), nullable=True),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_cad_extracts_public_id", "cad_extracts", ["public_id"], unique=True)
    op.create_index("ix_cad_extracts_user_id", "cad_extracts", ["user_id"])
    op.create_index("ix_cad_extracts_status", "cad_extracts", ["status"])
    op.create_index("ix_cad_extracts_sha256", "cad_extracts", ["sha256"])
    op.create_index("ix_cad_extracts_created_at", "cad_extracts", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_cad_extracts_created_at", table_name="cad_extracts")
    op.drop_index("ix_cad_extracts_sha256", table_name="cad_extracts")
    op.drop_index("ix_cad_extracts_status", table_name="cad_extracts")
    op.drop_index("ix_cad_extracts_user_id", table_name="cad_extracts")
    op.drop_index("ix_cad_extracts_public_id", table_name="cad_extracts")
    op.drop_table("cad_extracts")
