from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.services.billing import calculate_chat_billing, normalize_chat_usage
from app.models import (
    ChatMessage,
    Conversation,
    DataClassification,
    ProviderCall,
    ProviderCallArchive,
    ProviderProfile,
    Task,
    TaskArchive,
    UsageLedger,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _task_billing_snapshot(task: Task) -> tuple[float, str, float, str]:
    billing = task.result if isinstance(task.result, dict) else {}
    payload = billing.get("billing") if isinstance(billing, dict) else None
    if isinstance(payload, dict):
        return (
            float(task.cost or payload.get("cost") or 0.0),
            str(task.cost_currency or payload.get("currency") or "CNY").upper(),
            float(payload.get("billable_units") or 0.0),
            str(payload.get("pricing_unit") or "").strip(),
        )
    return (
        float(task.cost or 0.0),
        str(task.cost_currency or "CNY").upper(),
        0.0,
        "",
    )


def _task_output_count(task: Task) -> int:
    result = task.result if isinstance(task.result, dict) else {}
    raw = result.get("output_count") if isinstance(result, dict) else None
    try:
        return max(int(raw or 0), 0)
    except (TypeError, ValueError):
        return 0


def _reference_image_count(payload: dict) -> int:
    for key in ("reference_images", "images", "image_urls"):
        raw = payload.get(key)
        if isinstance(raw, list):
            return len([item for item in raw if str(item or "").strip()])
    for key in ("reference_image", "source_image", "image"):
        if str(payload.get(key) or "").strip():
            return 1
    try:
        return max(int(payload.get("reference_image_count") or 0), 0)
    except (TypeError, ValueError):
        return 0


def compose_task_input_summary(
    *,
    capability: str = "",
    aspect_ratio: str = "",
    resolution: str = "",
    size: str = "",
    duration: str = "",
    reference_count: int = 0,
    upscale_style: str = "",
) -> str:
    parts: list[str] = []
    ratio = str(aspect_ratio or "").strip()
    if ratio in {"", "smart", "auto", "source", "遵循原图"}:
        if (capability or "").startswith("image.edit") or ratio in {"source", "遵循原图"}:
            parts.append("遵循原图")
    elif ratio:
        parts.append(ratio)

    res = str(resolution or "").strip()
    if res:
        parts.append(res.upper() if res.lower() in {"1k", "2k", "4k"} else res)

    size_value = str(size or "").strip()
    if size_value and size_value not in parts:
        parts.append(size_value)

    duration_value = str(duration or "").strip()
    if duration_value:
        parts.append(duration_value if duration_value.endswith("s") else f"{duration_value}s")

    if reference_count > 0:
        parts.append(f"参考图 {reference_count}")

    style = str(upscale_style or "").strip()
    if style:
        parts.append(style)

    return " · ".join(parts)


def build_task_input_usage_payload(payload: dict | None, *, capability: str = "") -> dict:
    raw = payload if isinstance(payload, dict) else {}
    aspect_ratio = str(raw.get("aspect_ratio") or "").strip()
    resolution = str(raw.get("resolution") or "").strip()
    size = str(raw.get("size") or "").strip()
    duration = str(raw.get("duration") or raw.get("seconds") or "").strip()
    upscale_style = str(raw.get("upscale_style") or "").strip()
    reference_count = _reference_image_count(raw)
    summary = compose_task_input_summary(
        capability=capability,
        aspect_ratio=aspect_ratio,
        resolution=resolution,
        size=size,
        duration=duration,
        reference_count=reference_count,
        upscale_style=upscale_style,
    )
    data: dict[str, object] = {}
    if aspect_ratio:
        data["aspect_ratio"] = aspect_ratio
    if resolution:
        data["resolution"] = resolution
    if size:
        data["size"] = size
    if duration:
        data["duration"] = duration
    if reference_count:
        data["reference_count"] = reference_count
    if upscale_style:
        data["upscale_style"] = upscale_style
    if summary:
        data["input_summary"] = summary
    return data


def resolve_task_usage_meta(
    task: Task,
    provider_calls: list[ProviderCall] | None = None,
) -> tuple[str, str, str, dict]:
    calls = list(provider_calls if provider_calls is not None else getattr(task, "provider_calls", []) or [])
    capability = ""
    model_name = ""
    provider_name = ""
    for call in calls:
        if not capability and str(getattr(call, "capability", "") or "").strip():
            capability = str(call.capability).strip()
        if not model_name and str(getattr(call, "model_name", "") or "").strip():
            model_name = str(call.model_name).strip()
        if not provider_name and str(getattr(call, "provider_name", "") or "").strip():
            provider_name = str(call.provider_name).strip()

    if not capability:
        workflow = getattr(task, "workflow", None)
        capability = str(getattr(workflow, "provider_capability", "") or "").strip()

    usage_payload = build_task_input_usage_payload(
        task.payload if isinstance(task.payload, dict) else {},
        capability=capability,
    )
    return capability, model_name, provider_name, usage_payload


def ensure_usage_ledger_for_task(
    db: Session,
    task: Task,
    *,
    ledger_source: str,
    recorded_at: datetime | None = None,
    task_archive: TaskArchive | None = None,
) -> UsageLedger:
    current_archive = task_archive or db.scalar(select(TaskArchive).where(TaskArchive.task_id == task.id))
    project_id = task.project_id
    project_code = task.project.code
    project_name = task.project.name
    workflow_key = task.workflow.key
    workflow_name = task.workflow.name
    user_id = task.user_id
    user_name = task.user.name
    requested_provider = task.requested_provider
    classification = task.classification
    task_status = task.status
    latency_ms = int(task.latency_ms or 0)
    source_deleted_at = task.deleted_at
    cost, cost_currency, billable_units, billing_unit = _task_billing_snapshot(task)
    output_count = _task_output_count(task)
    result = task.result if isinstance(task.result, dict) else {}
    error_code = str(result.get("error_code") or "").strip()
    error_summary = str(result.get("error_summary") or result.get("error") or "").strip()

    provider_calls = db.scalars(
        select(ProviderCall).where(ProviderCall.task_id == task.id).order_by(ProviderCall.id.asc())
    ).all()
    capability, model_name, provider_name, usage_payload = resolve_task_usage_meta(task, provider_calls)

    task_entry = db.scalar(
        select(UsageLedger).where(
            UsageLedger.source_table == "tasks",
            UsageLedger.source_id == task.id,
        )
    )
    if not task_entry:
        task_entry = UsageLedger(
            entry_type="task.finalized",
            source_table="tasks",
            source_id=task.id,
            ledger_source=ledger_source,
            recorded_at=recorded_at or task.created_at or task.updated_at or _now(),
        )
        db.add(task_entry)

    task_entry.task_id = task.id
    task_entry.task_archive_id = current_archive.id if current_archive else None
    task_entry.provider_call_id = None
    task_entry.provider_call_archive_id = None
    task_entry.project_id = project_id
    task_entry.project_code = project_code
    task_entry.project_name = project_name
    task_entry.workflow_key = workflow_key
    task_entry.workflow_name = workflow_name
    task_entry.user_id = user_id
    task_entry.user_name = user_name
    task_entry.requested_provider = requested_provider
    task_entry.provider_name = provider_name
    task_entry.model_name = model_name
    task_entry.capability = capability
    task_entry.classification = classification
    task_entry.task_status = task_status
    task_entry.cost = cost
    task_entry.cost_currency = cost_currency
    task_entry.billable_units = billable_units
    task_entry.billing_unit = billing_unit
    task_entry.output_count = output_count
    task_entry.prompt_tokens = 0
    task_entry.completion_tokens = 0
    task_entry.total_tokens = 0
    task_entry.input_tokens = 0
    task_entry.output_tokens = 0
    task_entry.cached_input_tokens = 0
    task_entry.uncached_input_tokens = 0
    task_entry.usage_payload = usage_payload
    task_entry.latency_ms = latency_ms
    task_entry.error_code = error_code
    task_entry.error_summary = error_summary
    task_entry.source_deleted_at = source_deleted_at
    task_entry.recorded_at = recorded_at or task.created_at or task.updated_at or task_entry.recorded_at or _now()

    archived_provider_calls: dict[int, ProviderCallArchive] = {}
    if current_archive:
        archived_provider_calls = {
            item.provider_call_id: item
            for item in db.scalars(
                select(ProviderCallArchive).where(ProviderCallArchive.task_archive_id == current_archive.id)
            ).all()
        }

    for call in provider_calls:
        failure = call.request_summary.get("failure") if isinstance(call.request_summary, dict) else None
        provider_entry = db.scalar(
            select(UsageLedger).where(
                UsageLedger.source_table == "provider_calls",
                UsageLedger.source_id == call.id,
            )
        )
        if not provider_entry:
            provider_entry = UsageLedger(
                entry_type="provider_call.recorded",
                source_table="provider_calls",
                source_id=call.id,
                ledger_source=ledger_source,
                recorded_at=recorded_at or call.created_at or _now(),
            )
            db.add(provider_entry)

        provider_archive = archived_provider_calls.get(call.id)
        provider_entry.task_id = task.id
        provider_entry.task_archive_id = current_archive.id if current_archive else None
        provider_entry.provider_call_id = call.id
        provider_entry.provider_call_archive_id = provider_archive.id if provider_archive else None
        provider_entry.project_id = project_id
        provider_entry.project_code = project_code
        provider_entry.project_name = project_name
        provider_entry.workflow_key = workflow_key
        provider_entry.workflow_name = workflow_name
        provider_entry.user_id = user_id
        provider_entry.user_name = user_name
        provider_entry.requested_provider = requested_provider
        provider_entry.provider_name = call.provider_name
        provider_entry.model_name = call.model_name
        provider_entry.capability = call.capability
        provider_entry.classification = classification
        provider_entry.task_status = task_status
        provider_entry.cost = float(call.cost or 0.0)
        provider_entry.cost_currency = str(call.cost_currency or "CNY").upper()
        provider_entry.billable_units = 1.0
        provider_entry.billing_unit = "provider_call"
        provider_entry.output_count = 0
        provider_entry.prompt_tokens = 0
        provider_entry.completion_tokens = 0
        provider_entry.total_tokens = 0
        provider_entry.input_tokens = 0
        provider_entry.output_tokens = 0
        provider_entry.cached_input_tokens = 0
        provider_entry.uncached_input_tokens = 0
        provider_entry.usage_payload = {}
        provider_entry.latency_ms = int(call.latency_ms or 0)
        provider_entry.error_code = str((failure or {}).get("error_code") or "").strip()
        provider_entry.error_summary = str((failure or {}).get("error_summary") or "").strip()
        provider_entry.source_deleted_at = source_deleted_at
        provider_entry.recorded_at = recorded_at or call.created_at or provider_entry.recorded_at or _now()

    return task_entry


def record_chat_usage_ledger(
    db: Session,
    *,
    message: ChatMessage,
    conversation: Conversation,
    provider: ProviderProfile,
    provider_profile_id: int | None = None,
    user_id: int | None = None,
    user_name: str | None = None,
    provider_name: str | None = None,
    model_name: str | None = None,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    total_tokens: int = 0,
    usage_payload: dict | None = None,
    recorded_at: datetime | None = None,
) -> UsageLedger:
    ledger = db.scalar(
        select(UsageLedger).where(
            UsageLedger.source_table == "chat_messages",
            UsageLedger.source_id == message.id,
        )
    )
    if not ledger:
        ledger = UsageLedger(
            entry_type="chat.message.completed",
            source_table="chat_messages",
            source_id=message.id,
            ledger_source="chat.message.completed",
            recorded_at=recorded_at or message.created_at or _now(),
        )
        db.add(ledger)

    resolved_user_id = user_id if user_id is not None else conversation.__dict__.get("user_id")
    resolved_user_name = user_name or ""
    resolved_provider_name = provider_name or provider.__dict__.get("provider_name") or ""
    resolved_model_name = model_name or provider.__dict__.get("model_name") or ""

    ledger.task_id = None
    ledger.task_archive_id = None
    ledger.provider_call_id = None
    ledger.provider_call_archive_id = None
    ledger.project_id = None
    ledger.project_code = "__chat__"
    ledger.project_name = "Chat"
    ledger.workflow_key = "chat.completions"
    ledger.workflow_name = "Chat Conversation"
    ledger.user_id = resolved_user_id
    ledger.user_name = resolved_user_name
    ledger.requested_provider = resolved_provider_name
    ledger.provider_name = resolved_provider_name
    ledger.model_name = resolved_model_name
    ledger.capability = "chat.completions"
    ledger.classification = DataClassification.b
    ledger.task_status = None
    usage = normalize_chat_usage(
        usage_payload
        if usage_payload is not None
        else {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
        }
    )
    billing = calculate_chat_billing(
        db,
        provider_profile_id=provider_profile_id if provider_profile_id is not None else provider.__dict__.get("id"),
        usage=usage,
    )
    ledger.cost = float(billing["cost"])
    ledger.cost_currency = str(billing["currency"] or "CNY").upper()
    ledger.billable_units = float(billing.get("billable_units") or 0.0)
    ledger.billing_unit = "chat_tokens"
    ledger.output_count = 1
    ledger.prompt_tokens = usage.prompt_tokens
    ledger.completion_tokens = usage.completion_tokens
    ledger.total_tokens = usage.total_tokens
    ledger.input_tokens = usage.input_tokens
    ledger.output_tokens = usage.output_tokens
    ledger.cached_input_tokens = usage.cached_input_tokens
    ledger.uncached_input_tokens = usage.uncached_input_tokens
    ledger.usage_payload = usage.usage_payload
    ledger.latency_ms = 0
    ledger.error_code = ""
    ledger.error_summary = ""
    ledger.source_deleted_at = None
    ledger.recorded_at = recorded_at or message.created_at or ledger.recorded_at or _now()

    return ledger
