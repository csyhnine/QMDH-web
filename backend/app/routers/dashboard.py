from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, require_ops_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import AuditLog, Project, ProviderCall, Task, TaskStatus, User, Workflow
from app.schemas import DashboardStats

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
def get_dashboard_stats(
    days: int = Query(default=30, ge=1, le=365),
    project_code: str | None = None,
    user_name: str | None = None,
    provider_name: str | None = None,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> DashboardStats:
    require_ops_access(auth_user)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    filters = [Task.created_at >= since]
    if project_code:
        filters.append(Project.code == project_code)
    if user_name:
        filters.append(User.name == user_name)
    if provider_name:
        filters.append(Task.requested_provider == provider_name)

    active_workflows = db.scalar(select(func.count(Workflow.id))) or 0
    base_query = select(Task).join(Task.project).join(Task.user).where(*filters)
    tasks = list(db.scalars(base_query).all())
    task_ids = [task.id for task in tasks]
    total_tasks = len(tasks)
    successful_tasks = sum(1 for task in tasks if task.status == TaskStatus.completed)
    failed_tasks = sum(1 for task in tasks if task.status == TaskStatus.failed)
    total_cost = sum(float(task.cost or 0) for task in tasks)
    avg_cost = total_cost / total_tasks if total_tasks else 0.0
    avg_latency = sum(int(task.latency_ms or 0) for task in tasks) / total_tasks if total_tasks else 0.0
    audit_logs = db.scalar(select(func.count(AuditLog.id))) or 0
    outbound_tasks = sum(1 for task in tasks if task.requested_provider)

    success_rate = round((successful_tasks / total_tasks) * 100, 2) if total_tasks else 0.0
    audit_coverage_rate = round((audit_logs / total_tasks) * 100, 2) if total_tasks else 100.0
    user_counts = Counter(task.user.name for task in tasks)
    project_counts = Counter(task.project.code for task in tasks)
    provider_counts = Counter(task.requested_provider for task in tasks)
    failure_counts = Counter(
        str(task.result.get("error") or "Unknown failure")[:160]
        for task in tasks
        if task.status == TaskStatus.failed
    )
    model_counts: Counter[str] = Counter()
    if task_ids:
        provider_calls = db.scalars(select(ProviderCall).where(ProviderCall.task_id.in_(task_ids))).all()
        model_counts.update(call.model_name or call.provider_name for call in provider_calls)

    return DashboardStats(
        active_workflows=active_workflows,
        total_tasks=total_tasks,
        successful_tasks=successful_tasks,
        failed_tasks=failed_tasks,
        success_rate=success_rate,
        average_cost=round(float(avg_cost), 2),
        average_latency_ms=round(float(avg_latency), 2),
        audit_coverage_rate=audit_coverage_rate,
        outbound_tasks=outbound_tasks,
        total_cost=round(total_cost, 2),
        user_rankings=[{"name": name, "count": count} for name, count in user_counts.most_common(10)],
        project_rankings=[{"code": code, "count": count} for code, count in project_counts.most_common(10)],
        provider_rankings=[
            {"name": name, "count": count}
            for name, count in provider_counts.most_common(10)
        ],
        model_rankings=[{"name": name, "count": count} for name, count in model_counts.most_common(10)],
        failure_reasons=[{"reason": reason, "count": count} for reason, count in failure_counts.most_common(10)],
    )
