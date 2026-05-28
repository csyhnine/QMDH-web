"""add user_feedbacks table

Revision ID: c1d2e3f4a5b6
Revises: b8c9d0e1f2a3
Create Date: 2026-05-28 16:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c1d2e3f4a5b6"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_feedbacks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="open"),
        sa.Column("admin_reply", sa.Text(), nullable=False, server_default=""),
        sa.Column("replied_by_user_id", sa.Integer(), nullable=True),
        sa.Column("replied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["replied_by_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_feedbacks_user_id"), "user_feedbacks", ["user_id"], unique=False)
    op.create_index(op.f("ix_user_feedbacks_status"), "user_feedbacks", ["status"], unique=False)
    op.create_index(op.f("ix_user_feedbacks_replied_by_user_id"), "user_feedbacks", ["replied_by_user_id"], unique=False)
    op.create_index(op.f("ix_user_feedbacks_replied_at"), "user_feedbacks", ["replied_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_feedbacks_replied_at"), table_name="user_feedbacks")
    op.drop_index(op.f("ix_user_feedbacks_replied_by_user_id"), table_name="user_feedbacks")
    op.drop_index(op.f("ix_user_feedbacks_status"), table_name="user_feedbacks")
    op.drop_index(op.f("ix_user_feedbacks_user_id"), table_name="user_feedbacks")
    op.drop_table("user_feedbacks")
