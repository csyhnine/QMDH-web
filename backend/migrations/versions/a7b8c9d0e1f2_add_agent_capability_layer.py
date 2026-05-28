"""add agent capability layer

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-05-28 16:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "a7b8c9d0e1f2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_clients",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("display_name", sa.String(length=150), nullable=False),
        sa.Column("device_id", sa.String(length=150), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.Column("environment", sa.String(length=30), nullable=False),
        sa.Column("project_codes", sa.JSON(), nullable=False),
        sa.Column("capabilities", sa.JSON(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_request_id", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_clients_device_id", "agent_clients", ["device_id"], unique=False)
    op.create_index("ix_agent_clients_environment", "agent_clients", ["environment"], unique=False)
    op.create_index("ix_agent_clients_key", "agent_clients", ["key"], unique=True)
    op.create_index("ix_agent_clients_last_seen_at", "agent_clients", ["last_seen_at"], unique=False)
    op.create_index("ix_agent_clients_token_hash", "agent_clients", ["token_hash"], unique=True)
    op.create_index("ix_agent_clients_user_id", "agent_clients", ["user_id"], unique=False)

    op.create_table(
        "project_research_notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=False),
        sa.Column("source_name", sa.String(length=150), nullable=False),
        sa.Column("source_execution_id", sa.String(length=150), nullable=False),
        sa.Column("tags", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_project_research_notes_project_id", "project_research_notes", ["project_id"], unique=False)
    op.create_index("ix_project_research_notes_source_execution_id", "project_research_notes", ["source_execution_id"], unique=False)
    op.create_index("ix_project_research_notes_user_id", "project_research_notes", ["user_id"], unique=False)

    op.create_table(
        "agent_jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_type", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("task_id", sa.Integer(), nullable=True),
        sa.Column("asset_id", sa.Integer(), nullable=True),
        sa.Column("inspiration_post_id", sa.Integer(), nullable=True),
        sa.Column("research_note_id", sa.Integer(), nullable=True),
        sa.Column("workflow_key", sa.String(length=100), nullable=False),
        sa.Column("requested_provider", sa.String(length=100), nullable=False),
        sa.Column("request_id", sa.String(length=100), nullable=False),
        sa.Column("external_execution_id", sa.String(length=150), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("error_detail", sa.Text(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"]),
        sa.ForeignKeyConstraint(["client_id"], ["agent_clients.id"]),
        sa.ForeignKeyConstraint(["inspiration_post_id"], ["inspiration_posts.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["research_note_id"], ["project_research_notes.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_jobs_client_id", "agent_jobs", ["client_id"], unique=False)
    op.create_index("ix_agent_jobs_completed_at", "agent_jobs", ["completed_at"], unique=False)
    op.create_index("ix_agent_jobs_external_execution_id", "agent_jobs", ["external_execution_id"], unique=False)
    op.create_index("ix_agent_jobs_job_type", "agent_jobs", ["job_type"], unique=False)
    op.create_index("ix_agent_jobs_project_id", "agent_jobs", ["project_id"], unique=False)
    op.create_index("ix_agent_jobs_request_id", "agent_jobs", ["request_id"], unique=False)
    op.create_index("ix_agent_jobs_status", "agent_jobs", ["status"], unique=False)
    op.create_index("ix_agent_jobs_task_id", "agent_jobs", ["task_id"], unique=False)
    op.create_index("ix_agent_jobs_user_id", "agent_jobs", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_agent_jobs_user_id", table_name="agent_jobs")
    op.drop_index("ix_agent_jobs_task_id", table_name="agent_jobs")
    op.drop_index("ix_agent_jobs_status", table_name="agent_jobs")
    op.drop_index("ix_agent_jobs_request_id", table_name="agent_jobs")
    op.drop_index("ix_agent_jobs_project_id", table_name="agent_jobs")
    op.drop_index("ix_agent_jobs_job_type", table_name="agent_jobs")
    op.drop_index("ix_agent_jobs_external_execution_id", table_name="agent_jobs")
    op.drop_index("ix_agent_jobs_completed_at", table_name="agent_jobs")
    op.drop_index("ix_agent_jobs_client_id", table_name="agent_jobs")
    op.drop_table("agent_jobs")

    op.drop_index("ix_project_research_notes_user_id", table_name="project_research_notes")
    op.drop_index("ix_project_research_notes_source_execution_id", table_name="project_research_notes")
    op.drop_index("ix_project_research_notes_project_id", table_name="project_research_notes")
    op.drop_table("project_research_notes")

    op.drop_index("ix_agent_clients_user_id", table_name="agent_clients")
    op.drop_index("ix_agent_clients_token_hash", table_name="agent_clients")
    op.drop_index("ix_agent_clients_last_seen_at", table_name="agent_clients")
    op.drop_index("ix_agent_clients_key", table_name="agent_clients")
    op.drop_index("ix_agent_clients_environment", table_name="agent_clients")
    op.drop_index("ix_agent_clients_device_id", table_name="agent_clients")
    op.drop_table("agent_clients")
