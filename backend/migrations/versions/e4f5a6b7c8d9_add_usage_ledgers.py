"""add usage ledgers

Revision ID: e4f5a6b7c8d9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-18 19:30:00.000000

"""
from __future__ import annotations

from typing import Any, Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _read_mapping_payload(raw: Any) -> dict[str, Any]:
    return raw if isinstance(raw, dict) else {}


def _read_task_billing(result: dict[str, Any], fallback_cost: float, fallback_currency: str) -> tuple[float, str, float, str]:
    billing = result.get("billing") if isinstance(result, dict) else None
    if isinstance(billing, dict):
        return (
            float(fallback_cost or billing.get("cost") or 0.0),
            str(fallback_currency or billing.get("currency") or "CNY").upper(),
            float(billing.get("billable_units") or 0.0),
            str(billing.get("pricing_unit") or "").strip(),
        )
    return float(fallback_cost or 0.0), str(fallback_currency or "CNY").upper(), 0.0, ""


def upgrade() -> None:
    classification_enum = postgresql.ENUM("a", "b", "c", name="dataclassification", create_type=False)
    task_status_enum = postgresql.ENUM(
        "pending", "running", "completed", "failed", name="taskstatus", create_type=False
    )

    op.create_table(
        "usage_ledgers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("entry_type", sa.String(length=50), nullable=False),
        sa.Column("source_table", sa.String(length=50), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=True),
        sa.Column("task_archive_id", sa.Integer(), nullable=True),
        sa.Column("provider_call_id", sa.Integer(), nullable=True),
        sa.Column("provider_call_archive_id", sa.Integer(), nullable=True),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("project_code", sa.String(length=50), nullable=False),
        sa.Column("project_name", sa.String(length=150), nullable=False),
        sa.Column("workflow_key", sa.String(length=100), nullable=False),
        sa.Column("workflow_name", sa.String(length=150), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("user_name", sa.String(length=100), nullable=False),
        sa.Column("requested_provider", sa.String(length=100), nullable=False),
        sa.Column("provider_name", sa.String(length=100), nullable=False),
        sa.Column("model_name", sa.String(length=150), nullable=False),
        sa.Column("capability", sa.String(length=50), nullable=False),
        sa.Column("classification", classification_enum, nullable=False),
        sa.Column("task_status", task_status_enum, nullable=True),
        sa.Column("cost", sa.Float(), nullable=False),
        sa.Column("cost_currency", sa.String(length=12), nullable=False),
        sa.Column("billable_units", sa.Float(), nullable=False),
        sa.Column("billing_unit", sa.String(length=50), nullable=False),
        sa.Column("output_count", sa.Integer(), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("error_code", sa.String(length=100), nullable=False),
        sa.Column("error_summary", sa.Text(), nullable=False),
        sa.Column("ledger_source", sa.String(length=50), nullable=False),
        sa.Column("source_deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_table", "source_id", name="uq_usage_ledgers_source"),
    )
    op.create_index("ix_usage_ledgers_billing_unit", "usage_ledgers", ["billing_unit"], unique=False)
    op.create_index("ix_usage_ledgers_entry_type", "usage_ledgers", ["entry_type"], unique=False)
    op.create_index("ix_usage_ledgers_ledger_source", "usage_ledgers", ["ledger_source"], unique=False)
    op.create_index("ix_usage_ledgers_project_code", "usage_ledgers", ["project_code"], unique=False)
    op.create_index("ix_usage_ledgers_provider_call_archive_id", "usage_ledgers", ["provider_call_archive_id"], unique=False)
    op.create_index("ix_usage_ledgers_provider_call_id", "usage_ledgers", ["provider_call_id"], unique=False)
    op.create_index("ix_usage_ledgers_provider_name", "usage_ledgers", ["provider_name"], unique=False)
    op.create_index("ix_usage_ledgers_recorded_at", "usage_ledgers", ["recorded_at"], unique=False)
    op.create_index("ix_usage_ledgers_requested_provider", "usage_ledgers", ["requested_provider"], unique=False)
    op.create_index("ix_usage_ledgers_task_archive_id", "usage_ledgers", ["task_archive_id"], unique=False)
    op.create_index("ix_usage_ledgers_task_id", "usage_ledgers", ["task_id"], unique=False)
    op.create_index("ix_usage_ledgers_user_name", "usage_ledgers", ["user_name"], unique=False)

    bind = op.get_bind()
    metadata = sa.MetaData()

    tasks = sa.Table("tasks", metadata, autoload_with=bind)
    projects = sa.Table("projects", metadata, autoload_with=bind)
    workflows = sa.Table("workflows", metadata, autoload_with=bind)
    users = sa.Table("users", metadata, autoload_with=bind)
    task_archives = sa.Table("task_archives", metadata, autoload_with=bind)
    provider_calls = sa.Table("provider_calls", metadata, autoload_with=bind)
    provider_call_archives = sa.Table("provider_call_archives", metadata, autoload_with=bind)
    usage_ledgers = sa.Table("usage_ledgers", metadata, autoload_with=bind)

    task_rows = bind.execute(
        sa.select(
            tasks.c.id.label("task_id"),
            tasks.c.project_id,
            projects.c.code.label("project_code"),
            projects.c.name.label("project_name"),
            workflows.c.key.label("workflow_key"),
            workflows.c.name.label("workflow_name"),
            tasks.c.user_id,
            users.c.name.label("user_name"),
            tasks.c.requested_provider,
            tasks.c.classification,
            tasks.c.status.label("task_status"),
            tasks.c.cost,
            tasks.c.cost_currency,
            tasks.c.latency_ms,
            tasks.c.result,
            tasks.c.deleted_at,
            tasks.c.created_at,
            tasks.c.updated_at,
            task_archives.c.id.label("task_archive_id"),
        )
        .select_from(
            tasks.join(projects, tasks.c.project_id == projects.c.id)
            .join(workflows, tasks.c.workflow_id == workflows.c.id)
            .join(users, tasks.c.user_id == users.c.id)
            .outerjoin(task_archives, task_archives.c.task_id == tasks.c.id)
        )
        .order_by(tasks.c.id.asc())
    ).mappings().all()

    task_entries: list[dict[str, Any]] = []
    for row in task_rows:
        result = _read_mapping_payload(row["result"])
        cost, cost_currency, billable_units, billing_unit = _read_task_billing(
            result,
            float(row["cost"] or 0.0),
            str(row["cost_currency"] or "CNY"),
        )
        task_entries.append(
            {
                "entry_type": "task.finalized",
                "source_table": "tasks",
                "source_id": row["task_id"],
                "task_id": row["task_id"],
                "task_archive_id": row["task_archive_id"],
                "provider_call_id": None,
                "provider_call_archive_id": None,
                "project_id": row["project_id"],
                "project_code": row["project_code"],
                "project_name": row["project_name"],
                "workflow_key": row["workflow_key"],
                "workflow_name": row["workflow_name"],
                "user_id": row["user_id"],
                "user_name": row["user_name"],
                "requested_provider": row["requested_provider"],
                "provider_name": "",
                "model_name": "",
                "capability": "",
                "classification": row["classification"],
                "task_status": row["task_status"],
                "cost": cost,
                "cost_currency": cost_currency,
                "billable_units": billable_units,
                "billing_unit": billing_unit,
                "output_count": int(result.get("output_count") or 0),
                "latency_ms": int(row["latency_ms"] or 0),
                "error_code": str(result.get("error_code") or "").strip(),
                "error_summary": str(result.get("error_summary") or result.get("error") or "").strip(),
                "ledger_source": "migration.backfill",
                "source_deleted_at": row["deleted_at"],
                "recorded_at": row["created_at"] or row["updated_at"],
            }
        )

    if task_entries:
        bind.execute(usage_ledgers.insert(), task_entries)

    provider_rows = bind.execute(
        sa.select(
            provider_calls.c.id.label("provider_call_id"),
            provider_calls.c.task_id,
            tasks.c.project_id,
            projects.c.code.label("project_code"),
            projects.c.name.label("project_name"),
            workflows.c.key.label("workflow_key"),
            workflows.c.name.label("workflow_name"),
            tasks.c.user_id,
            users.c.name.label("user_name"),
            tasks.c.requested_provider,
            provider_calls.c.provider_name,
            provider_calls.c.model_name,
            provider_calls.c.capability,
            tasks.c.classification,
            tasks.c.status.label("task_status"),
            provider_calls.c.cost,
            provider_calls.c.cost_currency,
            provider_calls.c.latency_ms,
            provider_calls.c.request_summary,
            provider_calls.c.created_at,
            tasks.c.deleted_at,
            task_archives.c.id.label("task_archive_id"),
            provider_call_archives.c.id.label("provider_call_archive_id"),
        )
        .select_from(
            provider_calls.join(tasks, provider_calls.c.task_id == tasks.c.id)
            .join(projects, tasks.c.project_id == projects.c.id)
            .join(workflows, tasks.c.workflow_id == workflows.c.id)
            .join(users, tasks.c.user_id == users.c.id)
            .outerjoin(task_archives, task_archives.c.task_id == tasks.c.id)
            .outerjoin(provider_call_archives, provider_call_archives.c.provider_call_id == provider_calls.c.id)
        )
        .order_by(provider_calls.c.id.asc())
    ).mappings().all()

    provider_entries: list[dict[str, Any]] = []
    for row in provider_rows:
        request_summary = _read_mapping_payload(row["request_summary"])
        failure = _read_mapping_payload(request_summary.get("failure"))
        provider_entries.append(
            {
                "entry_type": "provider_call.recorded",
                "source_table": "provider_calls",
                "source_id": row["provider_call_id"],
                "task_id": row["task_id"],
                "task_archive_id": row["task_archive_id"],
                "provider_call_id": row["provider_call_id"],
                "provider_call_archive_id": row["provider_call_archive_id"],
                "project_id": row["project_id"],
                "project_code": row["project_code"],
                "project_name": row["project_name"],
                "workflow_key": row["workflow_key"],
                "workflow_name": row["workflow_name"],
                "user_id": row["user_id"],
                "user_name": row["user_name"],
                "requested_provider": row["requested_provider"],
                "provider_name": row["provider_name"],
                "model_name": row["model_name"],
                "capability": row["capability"],
                "classification": row["classification"],
                "task_status": row["task_status"],
                "cost": float(row["cost"] or 0.0),
                "cost_currency": str(row["cost_currency"] or "CNY").upper(),
                "billable_units": 1.0,
                "billing_unit": "provider_call",
                "output_count": 0,
                "latency_ms": int(row["latency_ms"] or 0),
                "error_code": str(failure.get("error_code") or "").strip(),
                "error_summary": str(failure.get("error_summary") or "").strip(),
                "ledger_source": "migration.backfill",
                "source_deleted_at": row["deleted_at"],
                "recorded_at": row["created_at"],
            }
        )

    if provider_entries:
        bind.execute(usage_ledgers.insert(), provider_entries)


def downgrade() -> None:
    op.drop_index("ix_usage_ledgers_user_name", table_name="usage_ledgers")
    op.drop_index("ix_usage_ledgers_task_id", table_name="usage_ledgers")
    op.drop_index("ix_usage_ledgers_task_archive_id", table_name="usage_ledgers")
    op.drop_index("ix_usage_ledgers_requested_provider", table_name="usage_ledgers")
    op.drop_index("ix_usage_ledgers_recorded_at", table_name="usage_ledgers")
    op.drop_index("ix_usage_ledgers_provider_name", table_name="usage_ledgers")
    op.drop_index("ix_usage_ledgers_provider_call_id", table_name="usage_ledgers")
    op.drop_index("ix_usage_ledgers_provider_call_archive_id", table_name="usage_ledgers")
    op.drop_index("ix_usage_ledgers_project_code", table_name="usage_ledgers")
    op.drop_index("ix_usage_ledgers_ledger_source", table_name="usage_ledgers")
    op.drop_index("ix_usage_ledgers_entry_type", table_name="usage_ledgers")
    op.drop_index("ix_usage_ledgers_billing_unit", table_name="usage_ledgers")
    op.drop_table("usage_ledgers")
