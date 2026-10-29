"""Read-only aggregates for Admin Chat UX telemetry."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ChatTurnTelemetry, User
from app.services.chat_telemetry_observation_service import aggregate_model_observations, read_model_observation

DEFAULT_LOOKBACK_DAYS = 30

SUCCESS_OUTCOMES = frozenset({"success", "agent_success"})


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=max(1, days))


def _percentile(values: list[int], percentile: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((percentile / 100) * (len(ordered) - 1)))))
    return ordered[index]


def _avg(values: list[int]) -> int:
    if not values:
        return 0
    return int(round(sum(values) / len(values)))


def _merge_client_event_totals(target: Counter[str], events: list[dict[str, object]] | None) -> None:
    for item in events or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("event") or "").strip()
        if name:
            target[name] += 1


def get_chat_experience_overview(db: Session, *, days: int = DEFAULT_LOOKBACK_DAYS) -> dict:
    since = _since(days)
    turns = db.scalars(
        select(ChatTurnTelemetry).where(
            ChatTurnTelemetry.started_at >= since,
            ChatTurnTelemetry.outcome != "in_progress",
        )
    ).all()

    outcome_totals: Counter[str] = Counter()
    client_event_totals: Counter[str] = Counter()
    pack_ms: list[int] = []
    total_ms: list[int] = []
    attachment_turn_count = 0
    agent_turn_count = 0
    success_count = 0

    for turn in turns:
        outcome_totals[turn.outcome or "unknown"] += 1
        if turn.outcome in SUCCESS_OUTCOMES:
            success_count += 1
        if turn.attachment_count > 0:
            attachment_turn_count += 1
        if turn.agent_mode:
            agent_turn_count += 1
        if turn.pack_duration_ms > 0:
            pack_ms.append(turn.pack_duration_ms)
        if turn.total_duration_ms > 0:
            total_ms.append(turn.total_duration_ms)
        _merge_client_event_totals(client_event_totals, turn.client_events_json)

    turn_count = len(turns)
    success_rate = round(success_count / turn_count, 4) if turn_count else 0.0
    attachment_turn_share = round(attachment_turn_count / turn_count, 4) if turn_count else 0.0
    agent_mode_share = round(agent_turn_count / turn_count, 4) if turn_count else 0.0

    return {
        "window_days": days,
        "window_started_at": since,
        "turn_count": turn_count,
        "success_rate": success_rate,
        **aggregate_model_observations(turns),
        "attachment_turn_count": attachment_turn_count,
        "attachment_turn_share": attachment_turn_share,
        "agent_mode_share": agent_mode_share,
        "avg_pack_duration_ms": _avg(pack_ms),
        "p95_pack_duration_ms": _percentile(pack_ms, 95),
        "avg_total_duration_ms": _avg(total_ms),
        "outcome_totals": dict(outcome_totals),
        "client_event_totals": dict(client_event_totals),
    }


def list_chat_turns(
    db: Session,
    *,
    days: int = DEFAULT_LOOKBACK_DAYS,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    since = _since(days)
    base_filter = (
        ChatTurnTelemetry.started_at >= since,
        ChatTurnTelemetry.outcome != "in_progress",
    )

    total = db.scalar(
        select(func.count())
        .select_from(ChatTurnTelemetry)
        .where(*base_filter)
    ) or 0

    rows = db.execute(
        select(ChatTurnTelemetry, User.name, User.display_name)
        .outerjoin(User, User.id == ChatTurnTelemetry.user_id)
        .where(*base_filter)
        .order_by(ChatTurnTelemetry.started_at.desc())
        .limit(max(1, min(limit, 200)))
        .offset(max(0, offset))
    ).all()

    items = []
    for turn, user_name, display_name in rows:
        items.append(
            {
                "id": turn.id,
                "correlation_id": turn.correlation_id,
                "conversation_id": turn.conversation_id,
                "user_name": user_name or "",
                "user_display_name": display_name or "",
                "provider_name": turn.provider_name,
                "model_name": turn.model_name,
                "agent_mode": turn.agent_mode,
                "outcome": turn.outcome,
                "error_code": turn.error_code,
                "error_summary": turn.error_summary,
                "attachment_count": turn.attachment_count,
                "attachment_total_bytes": turn.attachment_total_bytes,
                "pack_duration_ms": turn.pack_duration_ms,
                **read_model_observation(turn),
                "total_duration_ms": turn.total_duration_ms,
                "client_event_count": len(turn.client_events_json or []),
                "started_at": turn.started_at,
            }
        )

    return {"total": total, "items": items}
