"""Aggregate generation intents into behavior sessions (gacha vs explore)."""

from __future__ import annotations

from collections import Counter, defaultdict
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, or_, select
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


@contextmanager
def _session_update(db: Session):
    """Keep maintenance in the caller's transaction, including SQLite savepoints."""
    connection = db.connection()
    if connection.dialect.name == "sqlite" and not connection.connection.driver_connection.in_transaction:
        connection.exec_driver_sql("BEGIN IMMEDIATE")
    with db.begin_nested():
        yield


def _session_key(row) -> tuple[int, str]:
    return row.user_id, row.ref_fingerprint or ""


def _cluster_generation_intents(intents: list[GenerationIntent]) -> list[list[GenerationIntent]]:
    if any(_utc(intent.submitted_at) is None for intent in intents):
        raise ValueError("Session clustering requires an explicit historical submission time")
    ordered = sorted(intents, key=lambda row: (*_session_key(row), _utc(row.submitted_at), row.id))
    components = []
    for intent in ordered:
        previous = components[-1][-1] if components else None
        gap = _utc(intent.submitted_at) - _utc(previous.submitted_at) if previous is not None else None
        if previous is None or _session_key(previous) != _session_key(intent) or not (timedelta(0) <= gap <= SESSION_GAP):
            components.append([])
        components[-1].append(intent)
    return components


def _reconcile_generation_sessions(db: Session, intents: list[GenerationIntent], sessions: list[GenerationSession], *, full: bool) -> dict[str, int]:
    components = _cluster_generation_intents(intents)
    old = {session.id: session for session in sessions}
    members = defaultdict(set)
    for intent in intents:
        if intent.session_id is not None:
            members[intent.session_id].add(intent.id)
    if not full and old:
        outside = db.scalar(select(GenerationIntent.id).where(
            GenerationIntent.session_id.in_(old), GenerationIntent.id.not_in([intent.id for intent in intents])).limit(1))
        mismatched = any(intent.session_id in old and _session_key(old[intent.session_id]) != _session_key(intent) for intent in intents)
        if outside is not None or mismatched:
            raise ValueError("Historical session crosses user/reference keys; explicit full reconciliation is required")

    used = set()
    inserted = 0
    metrics_ids = []
    for component in components:
        key = _session_key(component[0])
        candidates = sorted({intent.session_id for intent in component
                             if intent.session_id in old and intent.session_id not in used and _session_key(old[intent.session_id]) == key})
        if candidates:
            session = old[candidates[0]]
        else:
            session = GenerationSession(user_id=key[0], project_id=component[0].project_id, ref_fingerprint=key[1],
                                        session_started_at=_utc(component[0].submitted_at), session_ended_at=_utc(component[-1].submitted_at))
            db.add(session)
            db.flush()
            inserted += 1
        used.add(session.id)
        if full or members[session.id] != {intent.id for intent in component}:
            metrics_ids.append(session.id)
        for intent in component:
            if intent.session_id != session.id:
                intent.session = session
                intent.session_id = session.id
    db.flush()
    for session_id in metrics_ids:
        recompute_session_metrics(db, session_id)
    obsolete = set(old) - used
    removed = 0
    if obsolete:
        # Move/flush all FKs first; ORM parent deletion could otherwise null loaded relationships.
        removed = db.execute(delete(GenerationSession).where(
            GenerationSession.id.in_(obsolete), ~GenerationSession.intents.any()
        ).execution_options(synchronize_session="fetch")).rowcount
    return {"intents_processed": len(intents),
            # Retain the old API's rebuilt-component count; report actual inserts separately.
            "sessions_created": len(components), "sessions_inserted": inserted,
            "sessions_reused": len(components) - inserted, "sessions_removed": removed}


def assign_intent_to_session(db: Session, intent: GenerationIntent) -> GenerationSession:
    with _session_update(db):
        user_id, ref = _session_key(intent)
        same_ref = or_(GenerationIntent.ref_fingerprint == ref, GenerationIntent.ref_fingerprint.is_(None)) if not ref else GenerationIntent.ref_fingerprint == ref
        intents = list(db.scalars(select(GenerationIntent).where(GenerationIntent.user_id == user_id, same_ref)))
        old_ids = {row.session_id for row in intents if row.session_id is not None}
        same_session_ref = or_(GenerationSession.ref_fingerprint == ref, GenerationSession.ref_fingerprint.is_(None)) if not ref else GenerationSession.ref_fingerprint == ref
        sessions = list(db.scalars(select(GenerationSession).where(or_(
            (GenerationSession.user_id == user_id) & same_session_ref, GenerationSession.id.in_(old_ids)))))
        _reconcile_generation_sessions(db, intents, sessions, full=False)
        return db.get(GenerationSession, intent.session_id)


def recompute_all_generation_sessions(db: Session) -> dict[str, int]:
    """Reconcile canonical components while reusing surviving session identities."""
    with _session_update(db):
        intents = list(db.scalars(select(GenerationIntent)))
        sessions = list(db.scalars(select(GenerationSession)))
        return _reconcile_generation_sessions(db, intents, sessions, full=True)
