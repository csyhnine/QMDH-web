"""Record positive outcome signals on generation intents (settle / reuse)."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import GenerationIntent, Task

GenerationOutcomeType = Literal[
    "reused_as_reference",
    "upscaled",
    "bookmarked",
    "shared_to_inspiration",
    "applied_to_composer",
    "regenerated",
]

SETTLE_OUTCOME_TYPES: frozenset[str] = frozenset(
    {
        "reused_as_reference",
        "upscaled",
        "bookmarked",
        "shared_to_inspiration",
        "applied_to_composer",
    }
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _intent_is_settled(signals: dict) -> bool:
    for outcome_type in SETTLE_OUTCOME_TYPES:
        bucket = signals.get(outcome_type)
        if isinstance(bucket, dict) and int(bucket.get("count") or 0) > 0:
            return True
    return False


def record_generation_outcome(
    db: Session,
    *,
    task_id: int,
    outcome_type: str,
    asset_id: int | None = None,
    metadata: dict | None = None,
) -> GenerationIntent | None:
    intent = db.scalar(select(GenerationIntent).where(GenerationIntent.task_id == task_id))
    if intent is None:
        return None

    signals = dict(intent.outcome_signals or {})
    bucket = dict(signals.get(outcome_type) or {})
    bucket["count"] = int(bucket.get("count") or 0) + 1
    bucket["last_at"] = _utc_now_iso()
    if asset_id is not None:
        asset_ids = [int(item) for item in bucket.get("asset_ids") or [] if isinstance(item, int)]
        if asset_id not in asset_ids:
            asset_ids.append(asset_id)
        bucket["asset_ids"] = asset_ids[-20:]
    if metadata:
        bucket["last_metadata"] = metadata

    signals[outcome_type] = bucket
    signals["settled"] = _intent_is_settled(signals)
    intent.outcome_signals = signals
    db.flush()

    if intent.session_id is not None:
        from app.services.generation_session_service import recompute_session_metrics

        recompute_session_metrics(db, intent.session_id)
    return intent


def record_generation_outcome_from_task_payload(db: Session, *, task: Task) -> None:
    """Infer outcomes from task payload (e.g. upscale referencing source_task_id)."""
    payload = task.payload if isinstance(task.payload, dict) else {}
    source_task_id = payload.get("source_task_id")
    if source_task_id is None:
        return
    try:
        parsed_task_id = int(source_task_id)
    except (TypeError, ValueError):
        return

    source_asset_id = payload.get("source_asset_id")
    asset_id = int(source_asset_id) if source_asset_id is not None else None
    record_generation_outcome(
        db,
        task_id=parsed_task_id,
        outcome_type="upscaled",
        asset_id=asset_id,
        metadata={"derived_task_id": task.id},
    )


def summarize_session_outcomes(intents: list[GenerationIntent]) -> dict[str, int | float | dict]:
    settle_count = sum(1 for intent in intents if (intent.outcome_signals or {}).get("settled"))
    outcome_totals: Counter[str] = Counter()
    for intent in intents:
        for key, value in (intent.outcome_signals or {}).items():
            if key == "settled" or not isinstance(value, dict):
                continue
            outcome_totals[key] += int(value.get("count") or 0)

    submit_count = len(intents)
    return {
        "settle_count": settle_count,
        "settle_score": round(settle_count / submit_count, 4) if submit_count else 0.0,
        "outcome_totals": dict(outcome_totals),
    }
