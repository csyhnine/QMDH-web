"""Opt-in public feedback sessions, never business credentials."""
import sqlalchemy as sa
from alembic import op

revision = "d5e6f7g8h9i0"
down_revision = "c4d5e6f7g8h9"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("skill_feedback_public_grants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("skill_id", sa.String(36), nullable=False, unique=True),
        sa.Column("skill_name", sa.String(150), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_table("skill_feedback_public_quotas",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("hour_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("day_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hour_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("day_count", sa.Integer(), nullable=False, server_default="0"))
    op.create_index("ix_skill_feedback_public_quotas_day_start", "skill_feedback_public_quotas", ["day_start"])
    with op.batch_alter_table("skill_feedback_credentials") as batch:
        batch.alter_column("owner_id", existing_type=sa.Integer(), nullable=True)
        batch.add_column(sa.Column("public_grant_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_feedback_public_grant", "skill_feedback_public_grants", ["public_grant_id"], ["id"])
        batch.create_index("ix_skill_feedback_credentials_public_grant_id", ["public_grant_id"])
        batch.add_column(sa.Column("origin_hash", sa.String(64), nullable=True))
        batch.add_column(sa.Column("bound_correlation_id", sa.String(150), nullable=True))
        batch.add_column(sa.Column("bound_platform", sa.String(50), nullable=True))
        batch.add_column(sa.Column("submission_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("skill_feedback_runs", sa.Column("skill_id", sa.String(36), nullable=True))
    op.create_index("ix_skill_feedback_runs_skill_id", "skill_feedback_runs", ["skill_id"])
    old_constraint = next(item for item in sa.inspect(op.get_bind()).get_unique_constraints("skill_feedback_issues")
        if item["column_names"] == ["skill_name", "skill_version", "problem_code"])
    with op.batch_alter_table("skill_feedback_issues", naming_convention={"uq": "uq_%(table_name)s_%(column_0_name)s"}) as batch:
        batch.drop_constraint(old_constraint["name"] or "uq_skill_feedback_issues_skill_name", type_="unique")
        batch.add_column(sa.Column("skill_id", sa.String(36), nullable=True))
        batch.add_column(sa.Column("aggregation_key", sa.String(160), nullable=False, server_default=""))
        batch.create_index("ix_skill_feedback_issues_skill_id", ["skill_id"])
    op.execute(sa.text("UPDATE skill_feedback_issues SET aggregation_key = 'legacy:' || skill_name"))
    with op.batch_alter_table("skill_feedback_issues") as batch:
        batch.create_unique_constraint("uq_feedback_issue_identity", ["aggregation_key", "skill_version", "problem_code"])


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM skill_feedback_credentials WHERE owner_id IS NULL")) or op.get_bind().scalar(sa.text("SELECT count(*) FROM skill_feedback_public_grants")):
        raise RuntimeError("Public feedback downgrade refused: preserve anonymous session history")
    with op.batch_alter_table("skill_feedback_issues") as batch:
        batch.drop_constraint("uq_feedback_issue_identity", type_="unique")
        batch.drop_index("ix_skill_feedback_issues_skill_id")
        batch.drop_column("skill_id")
        batch.drop_column("aggregation_key")
        batch.create_unique_constraint("uq_skill_feedback_issues_skill_name", ["skill_name", "skill_version", "problem_code"])
    with op.batch_alter_table("skill_feedback_runs") as batch:
        batch.drop_index("ix_skill_feedback_runs_skill_id")
        batch.drop_column("skill_id")
    with op.batch_alter_table("skill_feedback_credentials") as batch:
        batch.drop_constraint("fk_feedback_public_grant", type_="foreignkey")
        batch.drop_index("ix_skill_feedback_credentials_public_grant_id")
        for name in ("public_grant_id", "origin_hash", "bound_correlation_id", "bound_platform", "submission_count"):
            batch.drop_column(name)
        batch.alter_column("owner_id", existing_type=sa.Integer(), nullable=False)
    op.drop_table("skill_feedback_public_quotas")
    op.drop_table("skill_feedback_public_grants")
