from collections import Counter, defaultdict
from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, require_ops_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import AuditLog, Project, ProviderCall, Task, TaskStatus, User, Workflow
from app.schemas import (
    DashboardDailyPoint,
    DashboardDayModelCalls,
    DashboardModelCallSlice,
    DashboardStats,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _round(value: float) -> float:
    return round(float(value or 0), 2)


def _utc_date_key(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).date().isoformat()


def _failure_reason(task: Task) -> str:
    if isinstance(task.result, dict):
        raw_reason = task.result.get("error") or task.result.get("asset_warning") or task.result.get("summary")
        if raw_reason:
            return str(raw_reason)[:220]
    return "Task failed without a recorded error message"


def _success_rate(successful_tasks: int, total_tasks: int) -> float:
    return round((successful_tasks / total_tasks) * 100, 2) if total_tasks else 0.0


def _quota_status(quota_limit: float | None, quota_used: float) -> str:
    if quota_limit is None:
        return "unlimited"
    if quota_used > quota_limit:
        return "exceeded"
    if quota_limit > 0 and quota_used / quota_limit >= 0.8:
        return "warning"
    return "ok"


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
    now = datetime.now(timezone.utc)
    end_date = now.date()
    start_date = end_date - timedelta(days=days - 1)
    since = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
    date_keys: list[str] = []
    walk = start_date
    while walk <= end_date:
        date_keys.append(walk.isoformat())
        walk += timedelta(days=1)
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
    cost_by_currency_counter: Counter[str] = Counter()
    for task in tasks:
        cost_by_currency_counter[(task.cost_currency or "CNY").upper()] += float(task.cost or 0)
    total_cost = sum(cost_by_currency_counter.values())
    primary_currency = cost_by_currency_counter.most_common(1)[0][0] if cost_by_currency_counter else "CNY"
    avg_cost = total_cost / total_tasks if total_tasks else 0.0
    avg_latency = sum(int(task.latency_ms or 0) for task in tasks) / total_tasks if total_tasks else 0.0
    audit_logs = db.scalar(select(func.count(AuditLog.id))) or 0
    outbound_tasks = sum(1 for task in tasks if task.requested_provider)

    success_rate = _success_rate(successful_tasks, total_tasks)
    audit_coverage_rate = round((audit_logs / total_tasks) * 100, 2) if total_tasks else 100.0
    user_counts = Counter(task.user.name for task in tasks)
    project_counts = Counter(task.project.code for task in tasks)
    provider_counts = Counter(task.requested_provider for task in tasks)
    failure_counts = Counter(_failure_reason(task) for task in tasks if task.status == TaskStatus.failed)
    model_counts: Counter[str] = Counter()
    model_costs: Counter[str] = Counter()
    provider_calls: list[ProviderCall] = []
    if task_ids:
        provider_calls = list(db.scalars(select(ProviderCall).where(ProviderCall.task_id.in_(task_ids))).all())
        for call in provider_calls:
            model_name = call.model_name or call.provider_name
            model_counts[model_name] += 1
            model_costs[model_name] += float(call.cost or 0)

    provider_rows = []
    for name, count in provider_counts.most_common(10):
        provider_tasks = [task for task in tasks if task.requested_provider == name]
        provider_success = sum(1 for task in provider_tasks if task.status == TaskStatus.completed)
        provider_failed = sum(1 for task in provider_tasks if task.status == TaskStatus.failed)
        provider_cost = sum(float(task.cost or 0) for task in provider_tasks)
        provider_currency_counts = Counter((task.cost_currency or "CNY").upper() for task in provider_tasks)
        provider_currency = provider_currency_counts.most_common(1)[0][0] if provider_currency_counts else "CNY"
        provider_latency = (
            sum(int(task.latency_ms or 0) for task in provider_tasks) / len(provider_tasks)
            if provider_tasks
            else 0.0
        )
        provider_rows.append(
            {
                "name": name,
                "count": count,
                "successful_tasks": provider_success,
                "failed_tasks": provider_failed,
                "success_rate": _success_rate(provider_success, count),
                "total_cost": _round(provider_cost),
                "cost_currency": provider_currency,
                "average_latency_ms": _round(provider_latency),
            }
        )

    failure_rows = []
    for reason, count in failure_counts.most_common(10):
        failed_for_reason = [
            task for task in tasks if task.status == TaskStatus.failed and _failure_reason(task) == reason
        ]
        failure_rows.append(
            {
                "reason": reason,
                "count": count,
                "providers": sorted({task.requested_provider for task in failed_for_reason}),
                "users": sorted({task.user.name for task in failed_for_reason}),
                "projects": sorted({task.project.code for task in failed_for_reason}),
            }
        )

    user_filters = []
    if user_name:
        user_filters.append(User.name == user_name)
    users = db.scalars(select(User).where(*user_filters).order_by(User.created_at.desc(), User.id.desc())).all()
    tasks_by_user: dict[int, list[Task]] = {}
    for task in tasks:
        tasks_by_user.setdefault(task.user_id, []).append(task)

    account_usage = []
    for user in users:
        user_tasks = tasks_by_user.get(user.id, [])
        user_total = len(user_tasks)
        user_success = sum(1 for task in user_tasks if task.status == TaskStatus.completed)
        user_failed = sum(1 for task in user_tasks if task.status == TaskStatus.failed)
        user_cost = sum(float(task.cost or 0) for task in user_tasks)
        user_currency_counts = Counter((task.cost_currency or "CNY").upper() for task in user_tasks)
        user_currency = user_currency_counts.most_common(1)[0][0] if user_currency_counts else "CNY"
        user_latency = (
            sum(int(task.latency_ms or 0) for task in user_tasks) / user_total
            if user_total
            else 0.0
        )
        user_providers = Counter(task.requested_provider for task in user_tasks)
        user_models: Counter[str] = Counter()
        if task_ids and user_tasks:
            user_task_ids = {task.id for task in user_tasks}
            user_models.update(
                call.model_name or call.provider_name
                for call in provider_calls
                if call.task_id in user_task_ids
            )
        quota_limit = user.monthly_quota
        quota_remaining = None if quota_limit is None else _round(max(quota_limit - user_cost, 0.0))
        account_usage.append(
            {
                "name": user.name,
                "display_name": user.display_name or user.name,
                "role": user.role,
                "is_active": user.is_active,
                "project_codes": user.project_codes or [],
                "quota_limit": quota_limit,
                "quota_used": _round(user_cost),
                "quota_currency": user_currency,
                "quota_remaining": quota_remaining,
                "quota_status": _quota_status(quota_limit, user_cost),
                "total_tasks": user_total,
                "successful_tasks": user_success,
                "failed_tasks": user_failed,
                "success_rate": _success_rate(user_success, user_total),
                "average_latency_ms": _round(user_latency),
                "provider_calls": [
                    {"name": name, "count": count} for name, count in user_providers.most_common(5)
                ],
                "model_calls": [
                    {"name": name, "count": count} for name, count in user_models.most_common(5)
                ],
                "last_task_at": max((task.created_at for task in user_tasks), default=None),
            }
        )

    date_key_set = set(date_keys)
    task_id_to_date = {task.id: _utc_date_key(task.created_at) for task in tasks}
    daily_tasks_map: dict[str, list[Task]] = defaultdict(list)
    for task in tasks:
        dk = task_id_to_date[task.id]
        if dk in date_key_set:
            daily_tasks_map[dk].append(task)

    daily_series = [
        DashboardDailyPoint(
            date=dk,
            total_tasks=len(daily_tasks_map.get(dk, [])),
            successful_tasks=sum(1 for t in daily_tasks_map.get(dk, []) if t.status == TaskStatus.completed),
            failed_tasks=sum(1 for t in daily_tasks_map.get(dk, []) if t.status == TaskStatus.failed),
            total_cost=_round(sum(float(t.cost or 0) for t in daily_tasks_map.get(dk, []))),
        )
        for dk in date_keys
    ]

    model_top = [name for name, _ in model_counts.most_common(5)]
    calls_by_day_model: dict[tuple[str, str], int] = defaultdict(int)
    for call in provider_calls:
        dk = task_id_to_date.get(call.task_id)
        if dk is None or dk not in date_key_set:
            continue
        mname = call.model_name or call.provider_name
        slot = mname if mname in model_top else "__other__"
        calls_by_day_model[(dk, slot)] += 1

    model_calls_by_day: list[DashboardDayModelCalls] = []
    for dk in date_keys:
        slices_list: list[DashboardModelCallSlice] = []
        for m in model_top:
            slices_list.append(
                DashboardModelCallSlice(model_name=m, count=calls_by_day_model.get((dk, m), 0))
            )
        other_c = calls_by_day_model.get((dk, "__other__"), 0)
        if other_c > 0:
            slices_list.append(DashboardModelCallSlice(model_name="其他", count=other_c))
        model_calls_by_day.append(DashboardDayModelCalls(date=dk, slices=slices_list))

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
        cost_unit=primary_currency if len(cost_by_currency_counter) <= 1 else "multiple currencies",
        cost_formula=(
            "总成本按币种分别汇总：total_cost = sum(tasks.cost)。真实生图任务按模型配置中的单价计费："
            "按张计费时单价乘以实际输出张数，按次计费时单价乘以 1 次请求。失败任务默认成本为 0，除非任务已记录成本。"
        ),
        cost_notes=[
            "只有在模型配置里维护了 pricing_currency、pricing_unit 和 unit_price 后，成本才代表真实计费口径。",
            "免费额度或暂未计价的模型请将 unit_price 配置为 0。",
            "账号额度目前是软监管，只展示和预警，不会阻断任务创建。",
        ],
        cost_by_currency=[
            {"currency": currency, "total_cost": _round(cost)}
            for currency, cost in cost_by_currency_counter.most_common()
        ],
        user_rankings=[{"name": name, "count": count} for name, count in user_counts.most_common(10)],
        project_rankings=[{"code": code, "count": count} for code, count in project_counts.most_common(10)],
        provider_rankings=provider_rows,
        model_rankings=[
            {
                "name": name,
                "count": count,
                "successful_tasks": count,
                "failed_tasks": 0,
                "total_cost": _round(model_costs.get(name, 0.0)),
                "cost_currency": primary_currency,
            }
            for name, count in model_counts.most_common(10)
        ],
        failure_reasons=failure_rows,
        account_usage=account_usage,
        daily_series=daily_series,
        model_calls_by_day=model_calls_by_day,
    )
