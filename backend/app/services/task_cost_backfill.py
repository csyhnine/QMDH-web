from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import ImageProviderProfile
from app.models import (
    ProviderCall,
    ProviderCallArchive,
    ProviderProfile,
    Task,
    TaskArchive,
    TaskStatus,
    UsageLedger,
    Workflow,
)
from app.services.haodeya_pricing import GROK_VIDEO_SKU_PRICES, IMAGE_MODEL_PRICES, PRICING_CURRENCY
from app.services.model_registry import _profile_from_record
from app.services.provider_adapters.video_common import calculate_tiered_media_billing
from app.services.usage_ledger import ensure_usage_ledger_for_task

IMAGE_CAPABILITIES = frozenset({"image.generate", "image.edit"})
VIDEO_CAPABILITY = "video.generate"

GROK_CONTRACT_ADAPTER: dict[str, float] = {
    "unit_price_1k": float(GROK_VIDEO_SKU_PRICES["x-ai/grok-imagine-video-i2v"]),
    "unit_price_2k": float(GROK_VIDEO_SKU_PRICES["x-ai/grok-imagine-video-i2v-10s"]),
}


@dataclass(frozen=True)
class TaskCostBackfillResult:
    scanned: int
    updated: int
    unchanged: int
    skipped: int
    dry_run: bool
    samples: list[dict[str, Any]]


def _normalize_key(value: str) -> str:
    return str(value or "").strip().lower()


def _image_contract_adapter(model_name: str) -> dict[str, float] | None:
    normalized = _normalize_key(model_name)
    if not normalized:
        return None
    for key, pricing in IMAGE_MODEL_PRICES.items():
        key_norm = _normalize_key(key)
        if normalized == key_norm or key_norm in normalized or normalized in key_norm:
            return {
                "unit_price_1k": float(pricing["unit_price_1k"]),
                "unit_price_2k": float(pricing["unit_price_2k"]),
            }
    if "gemini" in normalized and "image" in normalized:
        pricing = IMAGE_MODEL_PRICES["gemini-3.1-flash-image"]
        return {
            "unit_price_1k": float(pricing["unit_price_1k"]),
            "unit_price_2k": float(pricing["unit_price_2k"]),
        }
    if "gpt" in normalized and "image" in normalized:
        pricing = IMAGE_MODEL_PRICES["gpt-image-2"]
        return {
            "unit_price_1k": float(pricing["unit_price_1k"]),
            "unit_price_2k": float(pricing["unit_price_2k"]),
        }
    return None


def _is_grok_video_profile(record: ProviderProfile) -> bool:
    if _normalize_key(record.adapter_kind) == "haodeya_grok":
        return True
    if VIDEO_CAPABILITY not in (record.capabilities or []):
        return False
    strategies = record.strategies if isinstance(record.strategies, dict) else {}
    return _normalize_key(strategies.get(VIDEO_CAPABILITY)) == "haodeya_grok_video"


def _resolve_image_tier(payload: dict[str, Any], result: dict[str, Any]) -> str:
    for source in (payload, result):
        if not isinstance(source, dict):
            continue
        billing = source.get("billing")
        if isinstance(billing, dict):
            tier = _normalize_key(str(billing.get("resolution_tier") or ""))
            if tier in {"1k", "2k"}:
                return tier
        tier = _normalize_key(str(source.get("resolution") or ""))
        if tier == "2k":
            return "2k"
        image_size = str(source.get("image_size") or source.get("imageSize") or "")
        if image_size.upper() == "2K":
            return "2k"
    return "1k"


def _resolve_grok_tier(payload: dict[str, Any], result: dict[str, Any], calls: list[ProviderCall]) -> str:
    sku = ""
    for source in (payload, result):
        if not isinstance(source, dict):
            continue
        for key in ("video_sku", "response_model"):
            candidate = str(source.get(key) or "").strip()
            if candidate:
                sku = candidate
                break
        if sku:
            break
    if not sku and calls:
        sku = str(calls[0].model_name or "").strip()
    if sku.endswith("-10s") or "10s" in sku:
        return "2k"
    return "1k"


def _task_output_count(task: Task) -> int:
    result = task.result if isinstance(task.result, dict) else {}
    raw = result.get("output_count")
    if raw is None:
        storage_paths = result.get("storage_paths")
        if isinstance(storage_paths, list) and storage_paths:
            return len(storage_paths)
        return 1 if result.get("storage_path") else 1
    try:
        return max(int(raw or 0), 1)
    except (TypeError, ValueError):
        return 1


def _profile_with_contract(record: ProviderProfile, adapter_overlay: dict[str, float]) -> ImageProviderProfile:
    profile = _profile_from_record(record)
    adapter_config = dict(profile.adapter_config or {})
    adapter_config.update(adapter_overlay)
    return replace(
        profile,
        adapter_config=adapter_config,
        pricing_currency=PRICING_CURRENCY,
    )


def _apply_billing_to_task(db: Session, task: Task, billing: dict[str, Any]) -> None:
    result = dict(task.result or {})
    result["billing"] = billing
    task.result = result
    task.cost = float(billing["cost"])
    task.cost_currency = str(billing.get("currency") or PRICING_CURRENCY).upper()

    provider_calls = db.scalars(
        select(ProviderCall).where(ProviderCall.task_id == task.id).order_by(ProviderCall.id.asc())
    ).all()
    for call in provider_calls:
        call.cost = task.cost if len(provider_calls) == 1 else float(billing["cost"])
        call.cost_currency = task.cost_currency

    archive = db.scalar(select(TaskArchive).where(TaskArchive.task_id == task.id))
    if archive is not None:
        archive.cost = task.cost
        archive.cost_currency = task.cost_currency
        archived_calls = db.scalars(
            select(ProviderCallArchive).where(ProviderCallArchive.task_archive_id == archive.id)
        ).all()
        for archived_call in archived_calls:
            archived_call.cost = task.cost if len(archived_calls) == 1 else float(billing["cost"])
            archived_call.cost_currency = task.cost_currency

    ensure_usage_ledger_for_task(db, task, ledger_source="task.cost_backfill", task_archive=archive)


def backfill_task_costs(
    db: Session,
    *,
    dry_run: bool = False,
    task_ids: list[int] | None = None,
    sample_limit: int = 20,
) -> TaskCostBackfillResult:
    profiles = db.scalars(select(ProviderProfile)).all()
    profiles_by_name = {profile.provider_name: profile for profile in profiles}

    query = (
        select(Task)
        .join(Workflow, Task.workflow_id == Workflow.id)
        .where(
            Task.status == TaskStatus.completed,
            Workflow.provider_capability.in_(tuple(IMAGE_CAPABILITIES | {VIDEO_CAPABILITY})),
        )
        .options(
            selectinload(Task.workflow),
            selectinload(Task.project),
            selectinload(Task.user),
        )
        .order_by(Task.id.asc())
    )
    if task_ids:
        query = query.where(Task.id.in_(task_ids))

    tasks = db.scalars(query).all()
    updated = 0
    unchanged = 0
    skipped = 0
    samples: list[dict[str, Any]] = []

    for task in tasks:
        profile_record = profiles_by_name.get(task.requested_provider)
        if profile_record is None:
            skipped += 1
            continue

        capability = task.workflow.provider_capability
        payload = task.payload if isinstance(task.payload, dict) else {}
        result = task.result if isinstance(task.result, dict) else {}
        provider_calls = db.scalars(
            select(ProviderCall).where(ProviderCall.task_id == task.id).order_by(ProviderCall.id.asc())
        ).all()

        billing: dict[str, Any] | None = None
        if capability in IMAGE_CAPABILITIES:
            contract = _image_contract_adapter(profile_record.model_name)
            if contract is None:
                skipped += 1
                continue
            profile = _profile_with_contract(profile_record, contract)
            profile = replace(profile, pricing_unit="per_image")
            tier = _resolve_image_tier(payload, result)
            billing = calculate_tiered_media_billing(
                profile=profile,
                output_count=_task_output_count(task),
                tier=tier,
                pricing_unit="per_image",
            )
        elif capability == VIDEO_CAPABILITY and _is_grok_video_profile(profile_record):
            profile = _profile_with_contract(profile_record, GROK_CONTRACT_ADAPTER)
            profile = replace(profile, pricing_unit="per_video")
            tier = _resolve_grok_tier(payload, result, provider_calls)
            billing = calculate_tiered_media_billing(
                profile=profile,
                output_count=1,
                tier=tier,
                pricing_unit="per_video",
            )
        else:
            skipped += 1
            continue

        old_cost = round(float(task.cost or 0.0), 4)
        new_cost = round(float(billing["cost"]), 4)
        if abs(old_cost - new_cost) < 0.0001:
            unchanged += 1
            continue

        if len(samples) < sample_limit:
            samples.append(
                {
                    "task_id": task.id,
                    "provider": task.requested_provider,
                    "capability": capability,
                    "tier": billing.get("resolution_tier"),
                    "old_cost": old_cost,
                    "new_cost": new_cost,
                }
            )

        if not dry_run:
            _apply_billing_to_task(db, task, billing)
        updated += 1

    if not dry_run:
        db.commit()

    return TaskCostBackfillResult(
        scanned=len(tasks),
        updated=updated,
        unchanged=unchanged,
        skipped=skipped,
        dry_run=dry_run,
        samples=samples,
    )
