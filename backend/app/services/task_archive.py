from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Asset, ProviderCall, ProviderCallArchive, Task, TaskArchive


def ensure_task_archive(
    db: Session,
    task: Task,
    *,
    archive_source: str,
    archive_reason: str = "",
    archived_at: datetime | None = None,
) -> TaskArchive:
    archive = db.scalar(select(TaskArchive).where(TaskArchive.task_id == task.id))
    provider_calls = db.scalars(
        select(ProviderCall).where(ProviderCall.task_id == task.id).order_by(ProviderCall.id.asc())
    ).all()
    asset_count = db.scalar(select(func.count(Asset.id)).where(Asset.source_task_id == task.id)) or 0

    if not archive:
        archive = TaskArchive(
            task_id=task.id,
            project_id=task.project_id,
            project_code=task.project.code,
            project_name=task.project.name,
            workflow_key=task.workflow.key,
            workflow_name=task.workflow.name,
            user_id=task.user_id,
            user_name=task.user.name,
            requested_provider=task.requested_provider,
            classification=task.classification,
            task_status=task.status,
            cost=float(task.cost or 0.0),
            cost_currency=task.cost_currency or "CNY",
            latency_ms=int(task.latency_ms or 0),
            provider_call_count=len(provider_calls),
            asset_count=int(asset_count),
            archive_source=archive_source,
            archive_reason=archive_reason,
            source_deleted_at=task.deleted_at,
            task_created_at=task.created_at,
            task_updated_at=task.updated_at,
            archived_at=archived_at or datetime.now(timezone.utc),
        )
        db.add(archive)
        db.flush()
    else:
        archive.provider_call_count = max(int(archive.provider_call_count or 0), len(provider_calls))
        archive.asset_count = max(int(archive.asset_count or 0), int(asset_count))
        if not archive.archive_reason and archive_reason:
            archive.archive_reason = archive_reason
        if archived_at and archive.archived_at > archived_at:
            archive.archived_at = archived_at
        archive.source_deleted_at = task.deleted_at

    archived_call_ids = set(
        db.scalars(
            select(ProviderCallArchive.provider_call_id).where(ProviderCallArchive.task_archive_id == archive.id)
        ).all()
    )
    for call in provider_calls:
        if call.id in archived_call_ids:
            continue
        db.add(
            ProviderCallArchive(
                provider_call_id=call.id,
                task_archive_id=archive.id,
                provider_name=call.provider_name,
                model_name=call.model_name,
                capability=call.capability,
                cost=float(call.cost or 0.0),
                cost_currency=call.cost_currency or "CNY",
                latency_ms=int(call.latency_ms or 0),
                outbound=bool(call.outbound),
                call_created_at=call.created_at,
                archived_at=archived_at or datetime.now(timezone.utc),
            )
        )

    return archive
