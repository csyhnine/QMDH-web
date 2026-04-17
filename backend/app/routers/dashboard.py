from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AuditLog, Task, TaskStatus, Workflow
from app.schemas import DashboardStats

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)) -> DashboardStats:
    active_workflows = db.scalar(select(func.count(Workflow.id))) or 0
    total_tasks = db.scalar(select(func.count(Task.id))) or 0
    successful_tasks = db.scalar(select(func.count(Task.id)).where(Task.status == TaskStatus.completed)) or 0
    avg_cost = db.scalar(select(func.avg(Task.cost))) or 0.0
    avg_latency = db.scalar(select(func.avg(Task.latency_ms))) or 0.0
    audit_logs = db.scalar(select(func.count(AuditLog.id))) or 0
    outbound_tasks = db.scalar(select(func.count(Task.id)).where(Task.requested_provider.is_not(None))) or 0

    success_rate = round((successful_tasks / total_tasks) * 100, 2) if total_tasks else 0.0
    audit_coverage_rate = round((audit_logs / total_tasks) * 100, 2) if total_tasks else 100.0

    return DashboardStats(
        active_workflows=active_workflows,
        total_tasks=total_tasks,
        successful_tasks=successful_tasks,
        success_rate=success_rate,
        average_cost=round(float(avg_cost), 2),
        average_latency_ms=round(float(avg_latency), 2),
        audit_coverage_rate=audit_coverage_rate,
        outbound_tasks=outbound_tasks,
    )
