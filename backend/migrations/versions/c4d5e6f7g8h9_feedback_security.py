"""Feedback-only credentials and quarantined external problems."""
import sqlalchemy as sa
from alembic import op

revision = "c4d5e6f7g8h9"
down_revision = "b3c4d5e6f7g8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("skill_feedback_credentials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("device_name", sa.String(150), nullable=False),
        sa.Column("allowed_skills", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("per_minute", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("per_day", sa.Integer(), nullable=False, server_default="500"),
        sa.Column("minute_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("day_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("minute_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("day_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_skill_feedback_credentials_owner_id", "skill_feedback_credentials", ["owner_id"])
    for table, key, constraint in (("skill_feedback_runs", "correlation_id", "uq_feedback_run_credential"), ("skill_feedback_events", "event_id", "uq_feedback_event_credential")):
        with op.batch_alter_table(table) as batch:
            batch.alter_column("client_id", existing_type=sa.Integer(), nullable=True)
            batch.add_column(sa.Column("credential_id", sa.Integer(), nullable=True))
            batch.create_foreign_key(f"fk_{table}_credential", "skill_feedback_credentials", ["credential_id"], ["id"])
            batch.create_index(f"ix_{table}_credential_id", ["credential_id"])
            batch.create_unique_constraint(constraint, ["credential_id", key])
    with op.batch_alter_table("skill_feedback_events") as batch:
        # Existing records retain their links and are explicitly unverified legacy evidence.
        batch.add_column(sa.Column("review_status", sa.String(30), nullable=False, server_default="legacy"))
        batch.add_column(sa.Column("review_note", sa.Text(), nullable=False, server_default=""))
        batch.add_column(sa.Column("reviewed_by", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
        batch.create_foreign_key("fk_feedback_event_reviewer", "users", ["reviewed_by"], ["id"])
        batch.create_index("ix_skill_feedback_events_review_status", ["review_status"])


def downgrade():
    # New credential-only rows cannot safely become legacy Agent rows.
    bind = op.get_bind()
    if bind.scalar(sa.text("SELECT count(*) FROM skill_feedback_credentials")) or bind.scalar(sa.text("SELECT count(*) FROM skill_feedback_events WHERE credential_id IS NOT NULL")) or bind.scalar(sa.text("SELECT count(*) FROM skill_feedback_runs WHERE credential_id IS NOT NULL")):
        raise RuntimeError("Feedback security downgrade refused: preserve credential-only history")
    with op.batch_alter_table("skill_feedback_events") as batch:
        batch.drop_constraint("fk_feedback_event_reviewer", type_="foreignkey")
        batch.drop_index("ix_skill_feedback_events_review_status")
        for name in ("reviewed_at", "reviewed_by", "review_note", "review_status"):
            batch.drop_column(name)
    for table, constraint in (("skill_feedback_events", "uq_feedback_event_credential"), ("skill_feedback_runs", "uq_feedback_run_credential")):
        with op.batch_alter_table(table) as batch:
            batch.drop_constraint(constraint, type_="unique")
            batch.drop_constraint(f"fk_{table}_credential", type_="foreignkey")
            batch.drop_index(f"ix_{table}_credential_id")
            batch.drop_column("credential_id")
            batch.alter_column("client_id", existing_type=sa.Integer(), nullable=False)
    op.drop_table("skill_feedback_credentials")
