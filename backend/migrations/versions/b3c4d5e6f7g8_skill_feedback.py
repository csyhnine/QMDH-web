"""Skill task/event intake and aggregated improvement issues."""
import sqlalchemy as sa
from alembic import op

revision = "b3c4d5e6f7g8"
down_revision = "z1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("user_feedbacks", sa.Column("improvement_status", sa.String(30), nullable=False, server_default="pending_analysis"))
    op.create_table("skill_feedback_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("agent_clients.id"), nullable=False),
        sa.Column("correlation_id", sa.String(150), nullable=False),
        sa.Column("platform", sa.String(50), nullable=False),
        sa.Column("skill_name", sa.String(150), nullable=False),
        sa.Column("skill_version", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("client_id", "correlation_id"))
    op.create_index("ix_skill_feedback_runs_client_id", "skill_feedback_runs", ["client_id"])
    op.create_table("skill_feedback_issues",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("skill_name", sa.String(150), nullable=False),
        sa.Column("skill_version", sa.String(100), nullable=False),
        sa.Column("problem_code", sa.String(100), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("communication_status", sa.String(30), nullable=False, server_default="pending_reply"),
        sa.Column("improvement_status", sa.String(30), nullable=False, server_default="pending_analysis"),
        sa.Column("root_cause", sa.Text(), nullable=False, server_default=""),
        sa.Column("modification_suggestion", sa.Text(), nullable=False, server_default=""),
        sa.Column("retest_result", sa.Text(), nullable=False, server_default=""),
        sa.Column("admin_reply", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("skill_name", "skill_version", "problem_code"))
    op.create_index("ix_skill_feedback_issues_skill_name", "skill_feedback_issues", ["skill_name"])
    op.create_table("skill_feedback_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("agent_clients.id"), nullable=False),
        sa.Column("event_id", sa.String(150), nullable=False),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("skill_feedback_runs.id"), nullable=False),
        sa.Column("issue_id", sa.Integer(), sa.ForeignKey("skill_feedback_issues.id"), nullable=True),
        sa.Column("source", sa.String(30), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("problem_code", sa.String(100), nullable=False, server_default=""),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("evidence", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("evaluation", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("client_id", "event_id"))
    for column in ("client_id", "run_id", "issue_id"):
        op.create_index(f"ix_skill_feedback_events_{column}", "skill_feedback_events", [column])


def downgrade():
    for table in ("skill_feedback_events", "skill_feedback_issues", "skill_feedback_runs"):
        op.drop_table(table)
    op.drop_column("user_feedbacks", "improvement_status")
