"""Recover tasks stuck in pending/running after worker restarts or upstream hangs."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Task, TaskStatus
from app.services.usage_ledger import ensure_usage_ledger_for_task

STALE_RUNNING_SECONDS = 15 * 60
STALE_PENDING_SECONDS = 30 * 60


def build_stale_task_failure_result(*, status: TaskStatus) -> dict[str, str]:
    if status == TaskStatus.pending:
        summary = "任务执行失败：排队超时，任务未被 worker 执行。"
        hint = "请重新提交；若持续出现，请联系管理员检查 worker 与 Redis 队列。"
        error_code = "task_stale_pending"
    else:
        summary = "任务执行失败：执行超时或 worker 中断，系统已自动终止。"
        hint = "请重新提交；若刚完成部署，旧任务可能已被中断。"
        error_code = "task_stale_running"

    return {
        "error": summary,
        "error_summary": summary,
        "error_detail": f"Recovered stale task in status={status.value}.",
        "error_code": error_code,
        "error_stage": "task_stale_recovery",
        "error_hint": hint,
        "error_raw": summary,
    }


def recover_stale_tasks(
    db: Session,
    *,
    now: datetime | None = None,
    running_seconds: int = STALE_RUNNING_SECONDS,
    pending_seconds: int = STALE_PENDING_SECONDS,
) -> int:
    current = now or datetime.now(timezone.utc)
    running_cutoff = current - timedelta(seconds=max(running_seconds, 60))
    pending_cutoff = current - timedelta(seconds=max(pending_seconds, 60))

    stale_tasks = db.scalars(
        select(Task).where(
            Task.deleted_at.is_(None),
            or_(
                (Task.status == TaskStatus.running) & (Task.updated_at < running_cutoff),
                (Task.status == TaskStatus.pending) & (Task.created_at < pending_cutoff),
            ),
        )
    ).all()

    recovered = 0
    for task in stale_tasks:
        previous_status = task.status
        failure = build_stale_task_failure_result(status=previous_status)
        task.status = TaskStatus.failed
        task.result = {
            **(task.result if isinstance(task.result, dict) else {}),
            **failure,
            "queued_stage": "failed",
            "recovered_at": current.isoformat(),
            "recovered_from_status": previous_status.value,
        }
        ensure_usage_ledger_for_task(db, task, ledger_source="task.stale_recovery")
        recovered += 1

    if recovered:
        db.commit()
    return recovered
