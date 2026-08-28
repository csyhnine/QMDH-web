"""Aggregate generation intents into behavior sessions (gacha vs explore)."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import GenerationIntent, GenerationSession
from app.services.generation_outcome_service import summarize_session_outcomes

SESSION_GAP = timedelta(minutes=30)


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _transition_scores(prompt_fps: list[str]) -> tuple[float, float]:
    if len(prompt_fps) < 2:
        return 0.0, 0.0
    same = 0
    different = 0
    for left, right in zip(prompt_fps, prompt_fps[1:], strict=False):
        if left == right:
            same += 1
        else:
            different += 1
    total = same + different
    if total <= 0:
        return 0.0, 0.0
    return round(same / total, 4), round(different / total, 4)


def recompute_session_metrics(db: Session, session_id: int) -> GenerationSession | None:
    session = db.get(GenerationSession, session_id)
    if session is None:
        return None

    intents = db.scalars(
        select(GenerationIntent)
        .where(GenerationIntent.session_id == session_id)
        .order_by(GenerationIntent.submitted_at.asc(), GenerationIntent.id.asc())
    ).all()
    if not intents:
        return session

    prompt_fps = [intent.prompt_fingerprint for intent in intents]
    providers = [intent.requested_provider for intent in intents]
    template_ids = [intent.template_id for intent in intents if intent.template_id is not None]

    prompt_counter = Counter(prompt_fps)
    template_counter = Counter(template_ids)
    dominant_prompt = prompt_counter.most_common(1)[0][0] if prompt_counter else ""
    dominant_template = template_counter.most_common(1)[0][0] if template_counter else None
    gacha_score, explore_score = _transition_scores(prompt_fps)

    provider_switch_count = sum(
        1 for left, right in zip(providers, providers[1:], strict=False) if left != right
    )

    session.project_id = intents[0].project_id
    session.session_started_at = _utc(intents[0].submitted_at) or session.session_started_at
    session.session_ended_at = _utc(intents[-1].submitted_at) or session.session_ended_at
    session.submit_count = len(intents)
    session.prompt_variant_count = len(set(prompt_fps))
    session.dominant_prompt_fingerprint = dominant_prompt
    session.dominant_template_id = dominant_template
    session.gacha_score = gacha_score
    session.explore_score = explore_score
    session.provider_switch_count = provider_switch_count
    session.completed_count = sum(1 for intent in intents if intent.task_status == "completed")
    session.failed_count = sum(1 for intent in intents if intent.task_status == "failed")
    session.metrics = {
        "asset_count": sum(1 for intent in intents if intent.has_asset),
        "template_ids": sorted(set(template_ids)),
        "source_surfaces": sorted({intent.source_surface for intent in intents}),
        **summarize_session_outcomes(intents),
    }
    session.computed_at = datetime.now(timezone.utc)
    db.flush()
    return session


def assign_intent_to_session(db: Session, intent: GenerationIntent) -> GenerationSession:
    submitted_at = _utc(intent.submitted_at) or datetime.now(timezone.utc)
    ref_fp = intent.ref_fingerprint or ""

    recent_intent = db.scalar(
        select(GenerationIntent)
        .where(
            GenerationIntent.user_id == intent.user_id,
            GenerationIntent.ref_fingerprint == ref_fp,
            GenerationIntent.id != intent.id,
        )
        .order_by(GenerationIntent.submitted_at.desc(), GenerationIntent.id.desc())
    )

    session: GenerationSession | None = None
    if recent_intent is not None:
        recent_at = _utc(recent_intent.submitted_at)
        if recent_at and submitted_at - recent_at <= SESSION_GAP and recent_intent.session_id is not None:
            session = db.get(GenerationSession, recent_intent.session_id)

    if session is None:
        session = GenerationSession(
            user_id=intent.user_id,
            project_id=intent.project_id,
            ref_fingerprint=ref_fp,
            session_started_at=submitted_at,
            session_ended_at=submitted_at,
        )
        db.add(session)
        db.flush()

    intent.session_id = session.id
    db.flush()
    recompute_session_metrics(db, session.id)
    return session


def recompute_all_generation_sessions(db: Session) -> dict[str, int]:
    """Rebuild sessions from scratch using time-gap clustering."""
    intents = db.scalars(
        select(GenerationIntent).order_by(GenerationIntent.user_id.asc(), GenerationIntent.submitted_at.asc())
    ).all()
    for intent in intents:
        intent.session_id = None
    db.flush()

    db.execute(delete(GenerationSession))
    db.flush()

    sessions_created = 0
    current_session: GenerationSession | None = None
    current_key: tuple[int, str] | None = None
    last_submitted_at: datetime | None = None

    for intent in intents:
        submitted_at = _utc(intent.submitted_at) or datetime.now(timezone.utc)
        key = (intent.user_id, intent.ref_fingerprint or "")
        gap_exceeded = (
            current_session is not None
            and last_submitted_at is not None
            and submitted_at - last_submitted_at > SESSION_GAP
        )
        if current_session is None or current_key != key or gap_exceeded:
            current_session = GenerationSession(
                user_id=intent.user_id,
                project_id=intent.project_id,
                ref_fingerprint=intent.ref_fingerprint or "",
                session_started_at=submitted_at,
                session_ended_at=submitted_at,
            )
            db.add(current_session)
            db.flush()
            sessions_created += 1
            current_key = key

        intent.session_id = current_session.id
        last_submitted_at = submitted_at
        current_session.session_ended_at = submitted_at

    db.flush()
    session_ids = db.scalars(select(GenerationSession.id)).all()
    for session_id in session_ids:
        recompute_session_metrics(db, session_id)

    return {
        "intents_processed": len(intents),
        "sessions_created": sessions_created,
    }
