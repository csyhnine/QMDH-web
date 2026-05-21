from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, require_ops_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import AuditLog, TaskStatus, UsageLedger, User, Workflow
from app.schemas import (
    DashboardDailyPoint,
    DashboardDayModelCalls,
    DashboardExecutionRanking,
    DashboardModelCallSlice,
    DashboardStats,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")


def _round(value: float) -> float:
    return round(float(value or 0), 2)


def _with_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _shanghai_day_key(dt: datetime) -> str:
    return _with_utc(dt).astimezone(SHANGHAI_TZ).date().isoformat()


def _shanghai_date(dt: datetime) -> date:
    return _with_utc(dt).astimezone(SHANGHAI_TZ).date()


def _shanghai_day_start_utc(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=SHANGHAI_TZ).astimezone(timezone.utc)


def _failure_reason(entry: UsageLedger) -> str:
    raw_reason = (entry.error_summary or "").strip()
    if raw_reason:
        return raw_reason[:220]
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


def _infer_task_capability(entry: UsageLedger, provider_entries: list[UsageLedger]) -> str:
    for provider_entry in provider_entries:
        capability = (provider_entry.capability or "").strip()
        if capability:
            return capability

    workflow_key = (entry.workflow_key or "").strip().lower()
    if "edit" in workflow_key:
        return "image.edit"
    if "video" in workflow_key:
        return "video.generate"
    return "image.generate"


def _empty_execution_bucket() -> dict[str, int]:
    return {
        "image_generate_count": 0,
        "image_edit_count": 0,
        "video_generate_count": 0,
        "chat_turn_count": 0,
        "chat_prompt_tokens": 0,
        "chat_completion_tokens": 0,
        "chat_total_tokens": 0,
    }


def _apply_task_count(bucket: dict[str, int], capability: str) -> None:
    if capability == "image.edit":
        bucket["image_edit_count"] += 1
    elif capability == "video.generate":
        bucket["video_generate_count"] += 1
    else:
        bucket["image_generate_count"] += 1


def _apply_chat_usage(bucket: dict[str, int], entry: UsageLedger) -> None:
    bucket["chat_turn_count"] += 1
    bucket["chat_prompt_tokens"] += int(entry.prompt_tokens or 0)
    bucket["chat_completion_tokens"] += int(entry.completion_tokens or 0)
    bucket["chat_total_tokens"] += int(entry.total_tokens or 0)


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

    now_local = datetime.now(SHANGHAI_TZ)
    end_date = now_local.date()
    start_date = end_date - timedelta(days=days - 1)
    week_start = end_date - timedelta(days=end_date.weekday())
    fetch_start_date = min(start_date, week_start)
    since = _shanghai_day_start_utc(fetch_start_date)
    date_keys = [(start_date + timedelta(days=offset)).isoformat() for offset in range(days)]
    display_date_key_set = set(date_keys)

    task_filters = [
        UsageLedger.entry_type == "task.finalized",
        UsageLedger.recorded_at >= since,
    ]
    provider_filters = [
        UsageLedger.entry_type == "provider_call.recorded",
        UsageLedger.recorded_at >= since,
    ]
    chat_filters = [
        UsageLedger.entry_type == "chat.message.completed",
        UsageLedger.recorded_at >= since,
    ]
    if project_code:
        task_filters.append(UsageLedger.project_code == project_code)
        provider_filters.append(UsageLedger.project_code == project_code)
        chat_filters.append(UsageLedger.project_code == project_code)
    if user_name:
        task_filters.append(UsageLedger.user_name == user_name)
        provider_filters.append(UsageLedger.user_name == user_name)
        chat_filters.append(UsageLedger.user_name == user_name)
    if provider_name:
        task_filters.append(UsageLedger.requested_provider == provider_name)
        provider_filters.append(UsageLedger.provider_name == provider_name)
        chat_filters.append(UsageLedger.provider_name == provider_name)

    active_workflows = db.scalar(select(func.count(Workflow.id))) or 0
    task_entries_all = list(
        db.scalars(
            select(UsageLedger)
            .where(*task_filters)
            .order_by(UsageLedger.recorded_at.desc(), UsageLedger.id.desc())
        ).all()
    )
    provider_entries_all = list(
        db.scalars(
            select(UsageLedger)
            .where(*provider_filters)
            .order_by(UsageLedger.recorded_at.desc(), UsageLedger.id.desc())
        ).all()
    )
    chat_entries_all = list(
        db.scalars(
            select(UsageLedger)
            .where(*chat_filters)
            .order_by(UsageLedger.recorded_at.desc(), UsageLedger.id.desc())
        ).all()
    )

    task_entries = [entry for entry in task_entries_all if _shanghai_day_key(entry.recorded_at) in display_date_key_set]
    provider_entries = [entry for entry in provider_entries_all if _shanghai_day_key(entry.recorded_at) in display_date_key_set]
    chat_entries = [entry for entry in chat_entries_all if _shanghai_day_key(entry.recorded_at) in display_date_key_set]
    provider_entries_by_task: dict[int, list[UsageLedger]] = defaultdict(list)
    for provider_entry in provider_entries_all:
        if provider_entry.task_id is not None:
            provider_entries_by_task[provider_entry.task_id].append(provider_entry)

    task_capability_by_task_id: dict[int, str] = {}
    for task_entry in task_entries_all:
        if task_entry.task_id is not None:
            task_capability_by_task_id[task_entry.task_id] = _infer_task_capability(
                task_entry,
                provider_entries_by_task.get(task_entry.task_id, []),
            )

    total_tasks = len(task_entries)
    successful_tasks = sum(1 for entry in task_entries if entry.task_status == TaskStatus.completed)
    failed_tasks = sum(1 for entry in task_entries if entry.task_status == TaskStatus.failed)
    cost_by_currency_counter: Counter[str] = Counter()
    for entry in task_entries:
        cost_by_currency_counter[(entry.cost_currency or "CNY").upper()] += float(entry.cost or 0)
    total_cost = sum(cost_by_currency_counter.values())
    primary_currency = cost_by_currency_counter.most_common(1)[0][0] if cost_by_currency_counter else "CNY"
    avg_cost = total_cost / total_tasks if total_tasks else 0.0
    avg_latency = sum(int(entry.latency_ms or 0) for entry in task_entries) / total_tasks if total_tasks else 0.0
    audit_logs = db.scalar(select(func.count(AuditLog.id))) or 0
    outbound_tasks = sum(1 for entry in task_entries if entry.requested_provider)

    success_rate = _success_rate(successful_tasks, total_tasks)
    audit_coverage_rate = round((audit_logs / total_tasks) * 100, 2) if total_tasks else 100.0
    user_counts = Counter(entry.user_name for entry in task_entries)
    project_counts = Counter(entry.project_code for entry in task_entries)
    provider_counts = Counter(entry.requested_provider for entry in task_entries)
    failure_counts = Counter(_failure_reason(entry) for entry in task_entries if entry.task_status == TaskStatus.failed)
    model_counts: Counter[str] = Counter()
    model_costs: Counter[str] = Counter()
    for entry in provider_entries:
        model_name = entry.model_name or entry.provider_name
        model_counts[model_name] += 1
        model_costs[model_name] += float(entry.cost or 0)

    provider_rows = []
    for name, count in provider_counts.most_common(10):
        provider_tasks = [entry for entry in task_entries if entry.requested_provider == name]
        provider_success = sum(1 for entry in provider_tasks if entry.task_status == TaskStatus.completed)
        provider_failed = sum(1 for entry in provider_tasks if entry.task_status == TaskStatus.failed)
        provider_cost = sum(float(entry.cost or 0) for entry in provider_tasks)
        provider_currency_counts = Counter((entry.cost_currency or "CNY").upper() for entry in provider_tasks)
        provider_currency = provider_currency_counts.most_common(1)[0][0] if provider_currency_counts else "CNY"
        provider_latency = (
            sum(int(entry.latency_ms or 0) for entry in provider_tasks) / len(provider_tasks)
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
            entry for entry in task_entries if entry.task_status == TaskStatus.failed and _failure_reason(entry) == reason
        ]
        failure_rows.append(
            {
                "reason": reason,
                "count": count,
                "providers": sorted({entry.requested_provider for entry in failed_for_reason}),
                "users": sorted({entry.user_name for entry in failed_for_reason}),
                "projects": sorted({entry.project_code for entry in failed_for_reason}),
            }
        )

    user_filters = []
    if user_name:
        user_filters.append(User.name == user_name)
    users = db.scalars(select(User).where(*user_filters).order_by(User.created_at.desc(), User.id.desc())).all()

    tasks_by_user: dict[int, list[UsageLedger]] = defaultdict(list)
    chats_by_user: dict[int, list[UsageLedger]] = defaultdict(list)
    for entry in task_entries:
        if entry.user_id is not None:
            tasks_by_user[entry.user_id].append(entry)
    for entry in chat_entries:
        if entry.user_id is not None:
            chats_by_user[entry.user_id].append(entry)

    execution_rankings_map: dict[str, dict[str, object]] = {}

    def ensure_execution_row(name: str) -> dict[str, object]:
        row = execution_rankings_map.get(name)
        if row is None:
            row = {
                "user_name": name,
                **_empty_execution_bucket(),
                "last_activity_at": None,
            }
            execution_rankings_map[name] = row
        return row

    for entry in task_entries:
        row = ensure_execution_row(entry.user_name)
        capability = task_capability_by_task_id.get(entry.task_id or 0, "image.generate")
        _apply_task_count(row, capability)
        recorded_at = entry.recorded_at
        if row["last_activity_at"] is None or recorded_at > row["last_activity_at"]:
            row["last_activity_at"] = recorded_at
    for entry in chat_entries:
        row = ensure_execution_row(entry.user_name)
        _apply_chat_usage(row, entry)
        recorded_at = entry.recorded_at
        if row["last_activity_at"] is None or recorded_at > row["last_activity_at"]:
            row["last_activity_at"] = recorded_at

    account_usage = []
    for user in users:
        user_tasks = tasks_by_user.get(user.id, [])
        user_chats = chats_by_user.get(user.id, [])
        user_total = len(user_tasks)
        user_success = sum(1 for entry in user_tasks if entry.task_status == TaskStatus.completed)
        user_failed = sum(1 for entry in user_tasks if entry.task_status == TaskStatus.failed)
        user_cost = sum(float(entry.cost or 0) for entry in user_tasks)
        user_currency_counts = Counter((entry.cost_currency or "CNY").upper() for entry in user_tasks)
        user_currency = user_currency_counts.most_common(1)[0][0] if user_currency_counts else "CNY"
        user_latency = (
            sum(int(entry.latency_ms or 0) for entry in user_tasks) / user_total
            if user_total
            else 0.0
        )
        user_providers = Counter(entry.requested_provider for entry in user_tasks)
        user_models = Counter(
            (entry.model_name or entry.provider_name)
            for entry in provider_entries
            if entry.user_id == user.id
        )
        task_bucket = _empty_execution_bucket()
        for entry in user_tasks:
            _apply_task_count(task_bucket, task_capability_by_task_id.get(entry.task_id or 0, "image.generate"))
        for entry in user_chats:
            _apply_chat_usage(task_bucket, entry)

        quota_limit = user.monthly_quota
        quota_remaining = None if quota_limit is None else _round(max(quota_limit - user_cost, 0.0))
        last_activity = max(
            [entry.recorded_at for entry in user_tasks] + [entry.recorded_at for entry in user_chats],
            default=None,
        )
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
                "last_task_at": max((entry.recorded_at for entry in user_tasks), default=None),
                "last_activity_at": last_activity,
                **task_bucket,
            }
        )

    daily_tasks_map: dict[str, list[UsageLedger]] = defaultdict(list)
    daily_chat_map: dict[str, list[UsageLedger]] = defaultdict(list)
    for entry in task_entries:
        daily_tasks_map[_shanghai_day_key(entry.recorded_at)].append(entry)
    for entry in chat_entries:
        daily_chat_map[_shanghai_day_key(entry.recorded_at)].append(entry)

    daily_series = []
    for day_key in date_keys:
        task_bucket = _empty_execution_bucket()
        for entry in daily_tasks_map.get(day_key, []):
            _apply_task_count(task_bucket, task_capability_by_task_id.get(entry.task_id or 0, "image.generate"))
        for entry in daily_chat_map.get(day_key, []):
            _apply_chat_usage(task_bucket, entry)
        daily_series.append(
            DashboardDailyPoint(
                date=day_key,
                total_tasks=len(daily_tasks_map.get(day_key, [])),
                successful_tasks=sum(
                    1 for entry in daily_tasks_map.get(day_key, []) if entry.task_status == TaskStatus.completed
                ),
                failed_tasks=sum(
                    1 for entry in daily_tasks_map.get(day_key, []) if entry.task_status == TaskStatus.failed
                ),
                total_cost=_round(sum(float(entry.cost or 0) for entry in daily_tasks_map.get(day_key, []))),
                image_generate_count=task_bucket["image_generate_count"],
                image_edit_count=task_bucket["image_edit_count"],
                video_generate_count=task_bucket["video_generate_count"],
                chat_turn_count=task_bucket["chat_turn_count"],
                chat_total_tokens=task_bucket["chat_total_tokens"],
            )
        )

    model_top = [name for name, _ in model_counts.most_common(5)]
    calls_by_day_model: dict[tuple[str, str], int] = defaultdict(int)
    for entry in provider_entries:
        day_key = _shanghai_day_key(entry.recorded_at)
        model_name = entry.model_name or entry.provider_name
        slot = model_name if model_name in model_top else "__other__"
        calls_by_day_model[(day_key, slot)] += 1

    model_calls_by_day: list[DashboardDayModelCalls] = []
    for day_key in date_keys:
        slices_list: list[DashboardModelCallSlice] = []
        for model_name in model_top:
            slices_list.append(
                DashboardModelCallSlice(model_name=model_name, count=calls_by_day_model.get((day_key, model_name), 0))
            )
        other_count = calls_by_day_model.get((day_key, "__other__"), 0)
        if other_count > 0:
            slices_list.append(DashboardModelCallSlice(model_name="其他", count=other_count))
        model_calls_by_day.append(DashboardDayModelCalls(date=day_key, slices=slices_list))

    today_image_generate_count = 0
    week_image_generate_count = 0
    today_video_generate_count = 0
    week_video_generate_count = 0
    for entry in task_entries_all:
        capability = task_capability_by_task_id.get(entry.task_id or 0, "image.generate")
        entry_date = _shanghai_date(entry.recorded_at)
        if capability == "image.generate":
            if entry_date == end_date:
                today_image_generate_count += 1
            if entry_date >= week_start:
                week_image_generate_count += 1
        elif capability == "video.generate":
            if entry_date == end_date:
                today_video_generate_count += 1
            if entry_date >= week_start:
                week_video_generate_count += 1

    execution_rankings = sorted(
        (
            DashboardExecutionRanking(
                user_name=name,
                image_generate_count=int(values["image_generate_count"]),
                image_edit_count=int(values["image_edit_count"]),
                video_generate_count=int(values["video_generate_count"]),
                chat_turn_count=int(values["chat_turn_count"]),
                chat_prompt_tokens=int(values["chat_prompt_tokens"]),
                chat_completion_tokens=int(values["chat_completion_tokens"]),
                chat_total_tokens=int(values["chat_total_tokens"]),
                last_activity_at=values["last_activity_at"],
            )
            for name, values in execution_rankings_map.items()
        ),
        key=lambda item: (
            item.image_generate_count
            + item.image_edit_count
            + item.video_generate_count
            + item.chat_turn_count,
            item.chat_total_tokens,
            item.last_activity_at or datetime.min.replace(tzinfo=timezone.utc),
        ),
        reverse=True,
    )

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
            "总成本按币种分别汇总：total_cost = sum(tasks.cost)。真实任务仍保留成本口径，但运营主视图已切换为按执行次数与 Chat token 观察活跃度。"
        ),
        cost_notes=[
            "只有在模型配置里维护了 pricing_currency、pricing_unit 和 unit_price 后，成本才代表真实计费口径。",
            "Chat token 统计仅从本次版本之后的新消息开始准确记录，历史消息不做回填。",
            "账号额度目前仍是软监管，只做展示与预警，不会阻断任务创建。",
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
        today_image_generate_count=today_image_generate_count,
        week_image_generate_count=week_image_generate_count,
        today_video_generate_count=today_video_generate_count,
        week_video_generate_count=week_video_generate_count,
        window_chat_turn_count=len(chat_entries),
        window_chat_prompt_tokens=sum(int(entry.prompt_tokens or 0) for entry in chat_entries),
        window_chat_completion_tokens=sum(int(entry.completion_tokens or 0) for entry in chat_entries),
        window_chat_total_tokens=sum(int(entry.total_tokens or 0) for entry in chat_entries),
        execution_rankings=execution_rankings[:10],
    )
