"""Read-only aggregates for Admin generation behavior analytics."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import AuditEventType
from app.models import AuditLog, GenerationIntent, GenerationSession, PromptTemplate, User
from app.services.generation_outcome_service import SETTLE_OUTCOME_TYPES

DEFAULT_LOOKBACK_DAYS = 30

SETTLE_OUTCOME_TYPES_EXCLUDING_DOWNLOAD = SETTLE_OUTCOME_TYPES - frozenset({"downloaded"})


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=max(1, days))


def _weighted_average(pairs: list[tuple[float, int]]) -> float:
    total_weight = sum(weight for _, weight in pairs)
    if total_weight <= 0:
        return 0.0
    return round(sum(value * weight for value, weight in pairs) / total_weight, 4)


def _completion_rate(session: GenerationSession) -> float:
    if session.submit_count <= 0:
        return 0.0
    return round(session.completed_count / session.submit_count, 4)


def compute_template_quality_score(
    *,
    avg_gacha: float,
    avg_explore: float,
    avg_settle: float,
    completion_rate: float,
) -> float:
    """Higher = template helps designers settle faster with less prompt tweaking."""
    return round(
        0.35 * avg_gacha + 0.40 * avg_settle + 0.15 * completion_rate + 0.10 * (1 - avg_explore),
        4,
    )


def _merge_outcome_totals(target: Counter[str], metrics: dict | None) -> None:
    raw = (metrics or {}).get("outcome_totals")
    if not isinstance(raw, dict):
        return
    for key, value in raw.items():
        target[key] += int(value or 0)


def _intent_was_prompt_polished(intent: GenerationIntent) -> bool:
    submission = (intent.outcome_signals or {}).get("submission")
    if not isinstance(submission, dict):
        return False
    return bool(submission.get("prompt_polished"))


def _intent_is_settled(intent: GenerationIntent) -> bool:
    return bool((intent.outcome_signals or {}).get("settled"))


def _intent_download_count(intent: GenerationIntent) -> int:
    bucket = (intent.outcome_signals or {}).get("downloaded")
    if not isinstance(bucket, dict):
        return 0
    return int(bucket.get("count") or 0)


def _intent_has_download(intent: GenerationIntent) -> bool:
    return _intent_download_count(intent) > 0


def _intent_has_explicit_settle(intent: GenerationIntent) -> bool:
    signals = intent.outcome_signals or {}
    for outcome_type in SETTLE_OUTCOME_TYPES_EXCLUDING_DOWNLOAD:
        bucket = signals.get(outcome_type)
        if isinstance(bucket, dict) and int(bucket.get("count") or 0) > 0:
            return True
    return False


def get_download_usage_stats(db: Session, *, days: int = DEFAULT_LOOKBACK_DAYS) -> dict:
    since = _since(days)
    intents = db.scalars(select(GenerationIntent).where(GenerationIntent.submitted_at >= since)).all()

    download_event_count = sum(_intent_download_count(intent) for intent in intents)
    downloaded_intent_count = sum(1 for intent in intents if _intent_has_download(intent))
    download_only_settled_count = sum(
        1
        for intent in intents
        if _intent_is_settled(intent) and _intent_has_download(intent) and not _intent_has_explicit_settle(intent)
    )
    settled_intent_count = sum(1 for intent in intents if _intent_is_settled(intent))
    intent_count = len(intents)

    return {
        "download_event_count": download_event_count,
        "downloaded_intent_count": downloaded_intent_count,
        "download_rate": round(downloaded_intent_count / intent_count, 4) if intent_count else 0.0,
        "download_only_settled_count": download_only_settled_count,
        "download_settle_share": round(download_only_settled_count / settled_intent_count, 4)
        if settled_intent_count
        else 0.0,
    }


def get_prompt_polish_usage_stats(db: Session, *, days: int = DEFAULT_LOOKBACK_DAYS) -> dict:
    since = _since(days)
    polish_logs = db.scalars(
        select(AuditLog).where(
            AuditLog.event_type == AuditEventType.STUDIO_PROMPT_POLISH,
            AuditLog.created_at >= since,
        )
    ).all()
    intents = db.scalars(select(GenerationIntent).where(GenerationIntent.submitted_at >= since)).all()

    polish_count = len(polish_logs)
    unique_users = len({log.actor_id for log in polish_logs if log.actor_id is not None})
    studio_count = 0
    canvas_count = 0
    for log in polish_logs:
        details = log.details if isinstance(log.details, dict) else {}
        surface = str(details.get("source_surface") or "studio")
        if surface == "canvas":
            canvas_count += 1
        else:
            studio_count += 1

    polished_intent_count = sum(1 for intent in intents if _intent_was_prompt_polished(intent))
    polished_settled_count = sum(
        1 for intent in intents if _intent_was_prompt_polished(intent) and _intent_is_settled(intent)
    )
    intent_count = len(intents)

    return {
        "polish_event_count": polish_count,
        "polish_unique_users": unique_users,
        "polish_studio_count": studio_count,
        "polish_canvas_count": canvas_count,
        "polished_intent_count": polished_intent_count,
        "polish_adoption_rate": round(polished_intent_count / intent_count, 4) if intent_count else 0.0,
        "polish_settle_rate": round(polished_settled_count / polished_intent_count, 4)
        if polished_intent_count
        else 0.0,
    }


def get_generation_analytics_overview(db: Session, *, days: int = DEFAULT_LOOKBACK_DAYS) -> dict:
    since = _since(days)
    sessions = db.scalars(
        select(GenerationSession).where(GenerationSession.session_started_at >= since)
    ).all()
    intents = db.scalars(select(GenerationIntent).where(GenerationIntent.submitted_at >= since)).all()

    gacha_pairs = [(session.gacha_score, session.submit_count) for session in sessions if session.submit_count > 0]
    explore_pairs = [(session.explore_score, session.submit_count) for session in sessions if session.submit_count > 0]
    settle_pairs: list[tuple[float, int]] = []
    outcome_totals: Counter[str] = Counter()
    high_gacha_sessions = 0
    high_explore_sessions = 0
    settled_sessions = 0

    for session in sessions:
        metrics = session.metrics if isinstance(session.metrics, dict) else {}
        settle_score = float(metrics.get("settle_score") or 0.0)
        if session.submit_count > 0:
            settle_pairs.append((settle_score, session.submit_count))
        if session.gacha_score >= 0.7 and session.submit_count >= 2:
            high_gacha_sessions += 1
        if session.explore_score >= 0.7 and session.submit_count >= 2:
            high_explore_sessions += 1
        if int(metrics.get("settle_count") or 0) > 0:
            settled_sessions += 1
        _merge_outcome_totals(outcome_totals, metrics)

    template_intent_count = sum(1 for intent in intents if intent.template_id is not None)
    settled_intent_count = sum(
        1 for intent in intents if (intent.outcome_signals or {}).get("settled")
    )

    return {
        "window_days": days,
        "intent_count": len(intents),
        "session_count": len(sessions),
        "template_intent_count": template_intent_count,
        "settled_intent_count": settled_intent_count,
        "avg_gacha_score": _weighted_average(gacha_pairs),
        "avg_explore_score": _weighted_average(explore_pairs),
        "avg_settle_score": _weighted_average(settle_pairs),
        "high_gacha_sessions": high_gacha_sessions,
        "high_explore_sessions": high_explore_sessions,
        "settled_sessions": settled_sessions,
        "outcome_totals": dict(outcome_totals),
        **get_download_usage_stats(db, days=days),
        **get_prompt_polish_usage_stats(db, days=days),
    }


def list_generation_sessions(
    db: Session,
    *,
    days: int = DEFAULT_LOOKBACK_DAYS,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    since = _since(days)
    total = db.scalar(
        select(func.count())
        .select_from(GenerationSession)
        .where(GenerationSession.session_started_at >= since)
    ) or 0

    sessions = db.scalars(
        select(GenerationSession)
        .where(GenerationSession.session_started_at >= since)
        .order_by(GenerationSession.session_started_at.desc(), GenerationSession.id.desc())
        .offset(max(0, offset))
        .limit(min(max(1, limit), 200))
    ).all()

    user_ids = {session.user_id for session in sessions}
    template_ids = {session.dominant_template_id for session in sessions if session.dominant_template_id is not None}
    users = {
        user.id: user.name
        for user in db.scalars(select(User).where(User.id.in_(user_ids))).all()
    } if user_ids else {}
    templates = {
        template.id: template
        for template in db.scalars(select(PromptTemplate).where(PromptTemplate.id.in_(template_ids))).all()
    } if template_ids else {}

    items = []
    for session in sessions:
        metrics = session.metrics if isinstance(session.metrics, dict) else {}
        dominant = templates.get(session.dominant_template_id) if session.dominant_template_id else None
        items.append(
            {
                "id": session.id,
                "user_name": users.get(session.user_id, f"user#{session.user_id}"),
                "submit_count": session.submit_count,
                "prompt_variant_count": session.prompt_variant_count,
                "gacha_score": session.gacha_score,
                "explore_score": session.explore_score,
                "settle_score": float(metrics.get("settle_score") or 0.0),
                "settle_count": int(metrics.get("settle_count") or 0),
                "completed_count": session.completed_count,
                "failed_count": session.failed_count,
                "dominant_template_id": session.dominant_template_id,
                "dominant_template_label": dominant.label if dominant else "",
                "outcome_totals": metrics.get("outcome_totals") if isinstance(metrics.get("outcome_totals"), dict) else {},
                "session_started_at": _utc(session.session_started_at),
                "session_ended_at": _utc(session.session_ended_at),
            }
        )

    return {"total": int(total), "items": items}


def get_template_quality_scores(db: Session, *, days: int = DEFAULT_LOOKBACK_DAYS, min_intents: int = 1) -> dict:
    since = _since(days)
    intents = db.scalars(
        select(GenerationIntent)
        .where(
            GenerationIntent.submitted_at >= since,
            GenerationIntent.template_id.is_not(None),
        )
        .order_by(GenerationIntent.submitted_at.desc(), GenerationIntent.id.desc())
    ).all()

    session_ids = {intent.session_id for intent in intents if intent.session_id is not None}
    sessions = {
        session.id: session
        for session in db.scalars(select(GenerationSession).where(GenerationSession.id.in_(session_ids))).all()
    } if session_ids else {}

    template_ids = {intent.template_id for intent in intents if intent.template_id is not None}
    templates = {
        template.id: template
        for template in db.scalars(select(PromptTemplate).where(PromptTemplate.id.in_(template_ids))).all()
    } if template_ids else {}

    buckets: dict[int, dict] = defaultdict(
        lambda: {
            "intent_count": 0,
            "session_ids": set(),
            "gacha_pairs": [],
            "explore_pairs": [],
            "settle_pairs": [],
            "completion_pairs": [],
            "outcome_totals": Counter(),
            "settled_intent_count": 0,
        }
    )

    for intent in intents:
        template_id = intent.template_id
        if template_id is None:
            continue
        bucket = buckets[template_id]
        bucket["intent_count"] += 1
        if (intent.outcome_signals or {}).get("settled"):
            bucket["settled_intent_count"] += 1
        if intent.session_id is not None:
            bucket["session_ids"].add(intent.session_id)
            session = sessions.get(intent.session_id)
            if session is not None and session.submit_count > 0:
                metrics = session.metrics if isinstance(session.metrics, dict) else {}
                bucket["gacha_pairs"].append((session.gacha_score, 1))
                bucket["explore_pairs"].append((session.explore_score, 1))
                bucket["settle_pairs"].append((float(metrics.get("settle_score") or 0.0), 1))
                bucket["completion_pairs"].append((_completion_rate(session), 1))
                _merge_outcome_totals(bucket["outcome_totals"], metrics)

    items = []
    for template_id, bucket in buckets.items():
        if bucket["intent_count"] < min_intents:
            continue
        template = templates.get(template_id)
        avg_gacha = _weighted_average(bucket["gacha_pairs"])
        avg_explore = _weighted_average(bucket["explore_pairs"])
        avg_settle = _weighted_average(bucket["settle_pairs"])
        completion_rate = _weighted_average(bucket["completion_pairs"])
        quality_score = compute_template_quality_score(
            avg_gacha=avg_gacha,
            avg_explore=avg_explore,
            avg_settle=avg_settle,
            completion_rate=completion_rate,
        )
        items.append(
            {
                "template_id": template_id,
                "label": template.label if template else f"模板 #{template_id}",
                "title": template.title if template else "",
                "category": template.category if template else "",
                "intent_count": bucket["intent_count"],
                "session_count": len(bucket["session_ids"]),
                "settled_intent_count": bucket["settled_intent_count"],
                "avg_gacha_score": avg_gacha,
                "avg_explore_score": avg_explore,
                "avg_settle_score": avg_settle,
                "completion_rate": completion_rate,
                "quality_score": quality_score,
                "outcome_totals": dict(bucket["outcome_totals"]),
            }
        )

    items.sort(key=lambda row: (row["quality_score"], row["intent_count"]), reverse=True)
    return {"window_days": days, "items": items}
