from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import math
import re
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import ImageProviderProfile
from app.models import ProviderCall, ProviderCallArchive, Task, TaskArchive, TaskStatus, UsageLedger, Workflow
from app.services.haodeya_pricing import GROK_VIDEO_SKU_PRICES, IMAGE_MODEL_PRICES, PRICING_CURRENCY
from app.services.provider_adapters.video_common import calculate_tiered_media_billing
from app.services.usage_ledger import ensure_usage_ledger_for_task

IMAGE_CAPABILITIES = frozenset({"image.generate", "image.edit"})
VIDEO_CAPABILITY = "video.generate"
COST_BACKFILL_CATALOG_ID = "haodeya-qmdh-2026-07-03"
GROK_CONTRACT_ADAPTER = {
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
    pricing = next((value for key, value in IMAGE_MODEL_PRICES.items() if _normalize_key(key) == _normalize_key(model_name)), None)
    if pricing is None:
        return None
    return {key: float(pricing[key]) for key in ("unit_price_1k", "unit_price_2k", "unit_price_4k") if key in pricing}


def _resolve_image_tier(payload: dict[str, Any], result: dict[str, Any]) -> str | None:
    return _image_resolution_details(payload, result)["tier"]


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


def _profile_with_contract(*, provider: str, model: str, endpoint: str, adapter: dict[str, float], unit: str) -> ImageProviderProfile:
    # Repricing is pure arithmetic. Never decode mutable live-profile credentials.
    return ImageProviderProfile(provider_name=provider, api_key="", base_url=endpoint, model_name=model,
                                adapter_config=dict(adapter), pricing_currency=PRICING_CURRENCY, pricing_unit=unit)


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _confirmed_contract_plan(plan: dict | None, *, dry_run: bool) -> dict | None:
    if plan is None:
        if dry_run:
            return None
        raise ValueError("apply requires an explicitly confirmed historical contract plan")
    if not isinstance(plan, dict) or type(plan.get("version")) is not int or plan["version"] != 1:
        raise ValueError("invalid historical contract plan version")
    if plan.get("catalog_id") != COST_BACKFILL_CATALOG_ID or plan.get("supplier") != "haodeya" or plan.get("currency") != "CNY":
        raise ValueError("unsupported supplier, currency or historical price catalog")
    if not isinstance(plan.get("source"), str) or not plan["source"].strip():
        raise ValueError("historical contract source must be confirmed explicitly")
    endpoint = urlsplit(str(plan.get("endpoint") or ""))
    if not endpoint.scheme or not endpoint.netloc:
        raise ValueError("historical contract endpoint is required")
    bounds = []
    for key in ("effective_from", "effective_until"):
        try:
            value = datetime.fromisoformat(plan[key])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("contract requires explicit effective dates") from exc
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("contract effective dates require a timezone")
        bounds.append(_utc(value))
    if bounds[0] >= bounds[1] or not isinstance(plan.get("tasks"), list):
        raise ValueError("invalid historical contract interval or task list")
    entries = {}
    for entry in plan["tasks"]:
        if not isinstance(entry, dict) or type(entry.get("task_id")) is not int or entry["task_id"] <= 0 or entry["task_id"] in entries:
            raise ValueError("contract requires unique exact task ids")
        if not all(isinstance(entry.get(key), str) and entry[key].strip() for key in ("provider", "model")):
            raise ValueError("contract requires exact historical provider and model")
        if not isinstance(entry.get("fingerprint"), str) or re.fullmatch(r"[0-9a-f]{64}", entry["fingerprint"]) is None:
            raise ValueError("contract requires an approved accounting-graph fingerprint")
        if "image_4k_quote" in entry:
            quote = entry["image_4k_quote"]
            price = quote.get("unit_price") if isinstance(quote, dict) else None
            try:
                finite_price = type(price) in (int, float) and math.isfinite(price) and price >= 0
            except OverflowError:
                finite_price = False
            if (not isinstance(quote, dict) or type(quote.get("version")) is not int or quote["version"] != 1
                    or quote.get("resolution_tier") != "4k" or quote.get("currency") != "CNY" or quote.get("pricing_unit") != "per_image"
                    or not finite_price
                    or not isinstance(quote.get("source"), str) or not quote["source"].strip()):
                raise ValueError("4K supplement requires version, explicit finite price, CNY/per_image and historical source")
        entries[entry["task_id"]] = entry
    return {**plan, "_from": bounds[0], "_until": bounds[1], "_entries": entries}


def _backfill_graph(db: Session, task: Task, *, lock: bool = False) -> dict:
    def rows(statement):
        return db.scalars(statement.with_for_update() if lock else statement).all()
    calls = rows(select(ProviderCall).where(ProviderCall.task_id == task.id).order_by(ProviderCall.id))
    archives = rows(select(TaskArchive).where(TaskArchive.task_id == task.id))
    archive = archives[0] if archives else None
    archived_calls = rows(select(ProviderCallArchive).where(ProviderCallArchive.task_archive_id == archive.id).order_by(ProviderCallArchive.id)) if archive else []
    terms = [UsageLedger.task_id == task.id, (UsageLedger.source_table == "tasks") & (UsageLedger.source_id == task.id)]
    if calls:
        terms.append((UsageLedger.source_table == "provider_calls") & UsageLedger.source_id.in_([row.id for row in calls]))
    if archive:
        terms.append(UsageLedger.task_archive_id == archive.id)
    ledgers = rows(select(UsageLedger).where(or_(*terms)).order_by(UsageLedger.id))
    return {"task": task, "calls": list(calls), "archive": archive, "archived_calls": list(archived_calls), "ledgers": list(ledgers)}


def _graph_fingerprint(graph: dict) -> str:
    def columns(row):
        return {column.name: getattr(row, column.name) for column in row.__table__.columns}
    data = {"task": columns(graph["task"]), "calls": [columns(row) for row in graph["calls"]],
            "archive": columns(graph["archive"]) if graph["archive"] else None,
            "archived_calls": [columns(row) for row in graph["archived_calls"]], "ledgers": [columns(row) for row in graph["ledgers"]]}
    def encode(value):
        if isinstance(value, datetime):
            return value.isoformat()
        if hasattr(value, "value"):
            return value.value
        raise TypeError("unsupported historical graph value")
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False, default=encode).encode("utf-8")).hexdigest()


def backfill_task_fingerprint(db: Session, task: Task) -> str:
    with db.no_autoflush:
        return _graph_fingerprint(_backfill_graph(db, task))


def _matches_contract_endpoint(url: str, endpoint: str) -> bool:
    actual, expected = urlsplit(str(url)), urlsplit(endpoint)
    path = expected.path.rstrip("/")
    return (actual.scheme.lower(), actual.netloc.lower()) == (expected.scheme.lower(), expected.netloc.lower()) and (actual.path == path or actual.path.startswith(path + "/"))


def _image_billing_snapshots(result: dict, call_result: dict) -> list[dict]:
    snapshots = []
    for source in (result, call_result):
        progress = source.get("generation_progress")
        progress = progress if isinstance(progress, dict) else {}
        for billing in (source.get("billing"), progress.get("billing_template")):
            if isinstance(billing, dict):
                snapshots.append(billing)
    return snapshots


def _image_resolution_details(payload: dict, result: dict, call_result: dict | None = None) -> dict:
    payload = payload if isinstance(payload, dict) else {}
    result = result if isinstance(result, dict) else {}
    call_result = call_result if isinstance(call_result, dict) else {}
    strong, actual, requested = [], [], []

    def add(items, value, name, *, dimensions=False):
        if value is None or not str(value).strip():
            return
        normalized = _normalize_key(str(value))
        # Physical size is retained as a reference; it cannot establish a historical billing tier.
        if dimensions and re.fullmatch(r"\d+\s*[x×]\s*\d+", normalized):
            return
        items.append((normalized, name))

    def fields(items, source, prefix):
        add(items, source.get("resolution"), prefix + ".resolution")
        for key in ("image_size", "imageSize"):
            add(items, source.get(key), prefix + "." + key, dimensions=True)

    for label, source in (("result", result), ("call_result", call_result)):
        add(strong, source.get("effective_resolution"), label + ".effective_resolution")
        progress = source.get("generation_progress")
        progress = progress if isinstance(progress, dict) else {}
        plan = progress.get("resolution_plan")
        if isinstance(plan, dict):
            add(strong, plan.get("effective_resolution"), label + ".generation_progress.resolution_plan.effective_resolution")
            add(strong, plan.get("resolution"), label + ".generation_progress.resolution_plan.resolution")
        fields(actual, source, label)
    for index, billing in enumerate(_image_billing_snapshots(result, call_result)):
        add(strong, billing.get("resolution_tier"), f"execution_billing[{index}].resolution_tier")
    fields(requested, payload, "payload")
    if isinstance(payload.get("billing"), dict):
        add(requested, payload["billing"].get("resolution_tier"), "payload.billing.resolution_tier")
    candidates = strong + actual if strong else actual + requested
    values = {value for value, _ in candidates}
    valid = bool(values) and values <= {"1k", "2k", "4k"} and len(values) == 1
    return {"tier": next(iter(values)) if valid else None,
            "source": "historical_execution" if strong else "legacy_explicit_fields",
            "reason": "eligible" if valid else "image_spec_conflict" if len(values) > 1 else "image_spec_unknown",
            "evidence_fields": [name for _, name in candidates],
            "requested_resolution": payload.get("resolution", payload.get("image_size", payload.get("imageSize")))}


def _image_snapshot_conflict(snapshots: list[dict], calculated: dict, catalog_id: str) -> str | None:
    for billing in snapshots:
        if billing.get("currency") and str(billing["currency"]).strip().upper() != "CNY":
            return "historical_currency_snapshot_conflict"
        if billing.get("pricing_unit") and billing["pricing_unit"] != calculated["pricing_unit"]:
            return "historical_pricing_unit_conflict"
        if billing.get("contract_id") and billing["contract_id"] != catalog_id:
            return "historical_contract_snapshot_conflict"
        if billing.get("amount_kind") in {"actual", "provider_reported"} or billing.get("source") in {"invoice", "provider_reported", "upstream_usage"}:
            return "actual_upstream_charge_not_repriced"
        if billing.get("unit_price") is not None:
            try:
                price = float(billing["unit_price"])
            except (TypeError, ValueError):
                return "historical_price_snapshot_conflict"
            if not math.isfinite(price) or abs(price - calculated["unit_price"]) >= 0.000001:
                return "historical_price_snapshot_conflict"
    return None


def _contract_candidate(graph: dict, plan: dict | None) -> tuple[dict | None, str, dict]:
    task, calls = graph["task"], graph["calls"]
    fingerprint = _graph_fingerprint(graph)
    model = calls[0].model_name if len(calls) == 1 else ""
    sample = {"task_id": task.id, "provider": task.requested_provider, "capability": task.workflow.provider_capability,
              "model": model, "old_cost": round(float(task.cost or 0), 4), "old_currency": task.cost_currency,
              "new_cost": None, "new_currency": None, "contract_source": plan["source"] if plan else None,
              "contract_id": plan["catalog_id"] if plan else None, "fingerprint": fingerprint}
    if task.workflow.provider_capability in IMAGE_CAPABILITIES:
        summary = calls[0].request_summary if len(calls) == 1 and isinstance(calls[0].request_summary, dict) else {}
        historical_execution = summary.get("execution")
        historical_result = historical_execution.get("result") if isinstance(historical_execution, dict) else None
        resolution = _image_resolution_details(task.payload, task.result, historical_result)
        sample.update(tier=resolution["tier"], resolution=resolution)
    if plan is None:
        return None, "contract_required", sample
    entry = plan["_entries"].get(task.id)
    if entry is None:
        return None, "task_not_approved", sample
    if entry["fingerprint"] != fingerprint:
        raise ValueError(f"task {task.id} accounting graph changed; preview and confirm again")
    if len(calls) != 1:
        return None, "historical_call_allocation_unconfirmed", sample
    call = calls[0]
    if entry["provider"] != task.requested_provider or call.provider_name != task.requested_provider or call.capability != task.workflow.provider_capability:
        return None, "historical_provider_or_capability_mismatch", sample
    if _normalize_key(entry["model"]) != _normalize_key(model):
        return None, "historical_model_mismatch", sample
    if not (plan["_from"] <= _utc(call.created_at) < plan["_until"]):
        return None, "historical_call_outside_contract_period", sample
    result = task.result if isinstance(task.result, dict) else {}
    execution = call.request_summary.get("execution", {}) if isinstance(call.request_summary, dict) else {}
    execution = execution if isinstance(execution, dict) else {}
    call_result = execution.get("result", {})
    call_result = call_result if isinstance(call_result, dict) else {}
    urls = [str(value) for value in (result.get("request_url"), call_result.get("request_url")) if value]
    if not urls:
        return None, "historical_endpoint_missing", sample
    if not all(_matches_contract_endpoint(url, plan["endpoint"]) for url in urls):
        return None, "historical_endpoint_mismatch", sample
    old_billing = result.get("billing", {})
    old_billing = old_billing if isinstance(old_billing, dict) else {}
    actual_models = [result.get("response_model"), result.get("video_sku"), old_billing.get("video_sku"), execution.get("model_name")]
    if any(value and _normalize_key(str(value)) != _normalize_key(model) for value in actual_models):
        return None, "historical_model_snapshot_conflict", sample
    all_rows = [task, call, *graph["archived_calls"], *graph["ledgers"]] + ([graph["archive"]] if graph["archive"] else [])
    if any(str(row.cost_currency or "").strip().upper() != "CNY" for row in all_rows):
        return None, "historical_currency_conflict", sample
    if old_billing.get("currency") and str(old_billing["currency"]).strip().upper() != "CNY":
        return None, "historical_currency_snapshot_conflict", sample
    if graph["archive"] and {row.provider_call_id for row in graph["archived_calls"]} != {call.id}:
        return None, "historical_archive_call_set_ambiguous", sample
    if any(row.provider_call_id != call.id or row.provider_name != call.provider_name or row.capability != call.capability or _normalize_key(row.model_name) != _normalize_key(model) for row in graph["archived_calls"]):
        return None, "historical_archive_call_set_ambiguous", sample
    ledger_sources = {("tasks", task.id, "task.finalized"), ("provider_calls", call.id, "provider_call.recorded")}
    if any((row.source_table, row.source_id, row.entry_type) not in ledger_sources for row in graph["ledgers"]):
        return None, "historical_ledger_source_ambiguous", sample
    capability = task.workflow.provider_capability
    if capability in IMAGE_CAPABILITIES:
        adapter = _image_contract_adapter(model)
        if adapter is None:
            return None, "image_sku_not_in_confirmed_catalog", sample
        tier = resolution["tier"]
        if tier is None:
            return None, resolution["reason"], sample
        quote = entry.get("image_4k_quote")
        if quote and tier != "4k":
            return None, "historical_4k_quote_tier_conflict", sample
        if tier == "4k":
            catalog_price = adapter.get("unit_price_4k")
            if quote and catalog_price is not None and abs(quote["unit_price"] - catalog_price) >= 0.000001:
                return None, "historical_4k_catalog_quote_conflict", sample
            if catalog_price is None and not quote:
                return None, "historical_4k_price_unconfirmed", sample
            adapter = {**adapter, "unit_price_4k": quote["unit_price"] if quote else catalog_price}
        unit, count = "per_image", _task_output_count(task)
    elif capability == VIDEO_CAPABILITY and _normalize_key(model) in {_normalize_key(key) for key in GROK_VIDEO_SKU_PRICES}:
        adapter, unit, count = GROK_CONTRACT_ADAPTER, "per_video", 1
        tier = _resolve_grok_tier({}, {}, calls)
    else:
        return None, "video_sku_not_in_confirmed_grok_catalog", sample
    if old_billing.get("pricing_unit") and old_billing["pricing_unit"] != unit:
        return None, "historical_pricing_unit_conflict", sample
    if old_billing.get("contract_id") and old_billing["contract_id"] != plan["catalog_id"]:
        return None, "historical_contract_snapshot_conflict", sample
    if old_billing.get("amount_kind") in {"actual", "provider_reported"} or old_billing.get("source") in {"invoice", "provider_reported", "upstream_usage"}:
        return None, "actual_upstream_charge_not_repriced", sample
    profile = _profile_with_contract(provider=task.requested_provider, model=model, endpoint=plan["endpoint"], adapter=adapter, unit=unit)
    calculated = calculate_tiered_media_billing(profile=profile, output_count=count, tier=tier, pricing_unit=unit)
    if capability in IMAGE_CAPABILITIES:
        conflict = _image_snapshot_conflict(_image_billing_snapshots(result, call_result), calculated, plan["catalog_id"])
        if conflict:
            return None, conflict, sample
    if old_billing.get("unit_price") is not None and abs(float(old_billing["unit_price"]) - float(calculated["unit_price"])) >= 0.000001:
        return None, "historical_price_snapshot_conflict", sample
    billing = {**old_billing, **calculated, "source": "confirmed_haodeya_contract", "contract_id": plan["catalog_id"],
               "contract_source": plan["source"], "actual_model": model,
               "contract_effective_from": plan["effective_from"], "contract_effective_until": plan["effective_until"]}
    if old_billing and "backfill_previous_billing" not in old_billing:
        billing["backfill_previous_billing"] = dict(old_billing)
    if capability in IMAGE_CAPABILITIES:
        billing["backfill_resolution"] = resolution
        if entry.get("image_4k_quote"):
            billing["image_4k_quote"] = dict(entry["image_4k_quote"])
    sample.update(new_cost=round(float(billing["cost"]), 4), new_currency="CNY", tier=tier)
    return billing, "eligible", sample


def _graph_matches_billing(graph: dict, billing: dict) -> bool:
    task, call = graph["task"], graph["calls"][0]
    rows = [task, call, *graph["archived_calls"], *graph["ledgers"]] + ([graph["archive"]] if graph["archive"] else [])
    if any(abs(float(row.cost or 0) - float(billing["cost"])) >= 0.0001 or row.cost_currency != "CNY" for row in rows):
        return False
    sources = {(row.source_table, row.source_id) for row in graph["ledgers"]}
    return ("tasks", task.id) in sources and ("provider_calls", call.id) in sources


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
    confirmed_plan: dict | None = None,
) -> TaskCostBackfillResult:
    plan = _confirmed_contract_plan(confirmed_plan, dry_run=dry_run)
    if not dry_run and (db.in_transaction() or db.new or db.dirty or db.deleted):
        raise ValueError("apply requires a fresh, clean maintenance session")
    try:
        if not dry_run and db.get_bind().dialect.name == "sqlite":
            db.connection().exec_driver_sql("BEGIN IMMEDIATE")
        with db.no_autoflush:
            query = (select(Task).join(Workflow, Task.workflow_id == Workflow.id)
                     .where(Task.status == TaskStatus.completed, Workflow.provider_capability.in_(tuple(IMAGE_CAPABILITIES | {VIDEO_CAPABILITY})))
                     .options(selectinload(Task.workflow), selectinload(Task.project), selectinload(Task.user)).order_by(Task.id))
            if task_ids is not None:
                query = query.where(Task.id.in_(task_ids))
            if not dry_run:
                query = query.with_for_update(of=Task)
            tasks = list(db.scalars(query).all())
            prepared = []
            updated = unchanged = skipped = 0
            samples = []
            # Validate the whole approved batch before writing any accounting row.
            for task in tasks:
                graph = _backfill_graph(db, task, lock=not dry_run)
                billing, reason, sample = _contract_candidate(graph, plan)
                if billing is None:
                    skipped += 1
                elif _graph_matches_billing(graph, billing):
                    unchanged += 1
                    reason = "unchanged"
                else:
                    updated += 1
                    reason = "would_update" if dry_run else "updated"
                    prepared.append((task, billing))
                if len(samples) < max(sample_limit, 0):
                    samples.append({**sample, "reason": reason})
        if not dry_run:
            for task, billing in prepared:
                _apply_billing_to_task(db, task, billing)
            db.commit()
        return TaskCostBackfillResult(scanned=len(tasks), updated=updated, unchanged=unchanged, skipped=skipped,
                                      dry_run=dry_run, samples=samples)
    except Exception:
        if not dry_run:
            db.rollback()
        raise
