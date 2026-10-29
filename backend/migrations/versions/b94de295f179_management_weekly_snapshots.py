"""Immutable, institute-scoped weekly planning snapshots."""
from alembic import op
import sqlalchemy as sa

revision = "b94de295f179"
down_revision = "a83cd184e068"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("management_weekly_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("unit", sa.String(120), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_management_weekly_snapshots_unit", "management_weekly_snapshots", ["unit"])
    op.create_index("ix_management_weekly_snapshots_year", "management_weekly_snapshots", ["year"])


def downgrade():
    op.drop_table("management_weekly_snapshots")
