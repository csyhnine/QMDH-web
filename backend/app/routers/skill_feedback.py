"""Authenticated skill telemetry. Only explicit problems enter the ops inbox."""
from datetime import datetime, timedelta, timezone
import secrets
import hashlib
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, Request
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, require_content_ops_access, require_ops_access
from app.core.audit import write_audit_log
from app.core.feedback_security import get_feedback_credential
from app.core.feedback_public import consume_public_budget, origin_hash
from app.core.security import hash_session_token
from app.database import get_db
from app.models import SkillFeedbackEvent, SkillFeedbackIssue, SkillFeedbackRun, SkillFeedbackCredential, SkillFeedbackPublicGrant, User
from app.skill_feedback_schemas import SkillEventIn, SkillIssueUpdate, FeedbackCredentialCreate, FeedbackEventReview, FeedbackPublicGrantCreate, FeedbackPublicGrantUpdate, FeedbackSessionCreate

router = APIRouter(prefix="/skills", tags=["skill-feedback"])


def _serialize(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns if column.name not in ("payload_hash", "token_hash", "origin_hash", "aggregation_key")}


@router.post("/sessions", status_code=201)
def create_public_session(payload: FeedbackSessionCreate, request: Request, response: Response, db: Session = Depends(get_db)):
    grant = db.scalar(select(SkillFeedbackPublicGrant).where(SkillFeedbackPublicGrant.skill_id == payload.skill_id,
        SkillFeedbackPublicGrant.is_active.is_(True)).with_for_update())
    if grant is None:
        raise HTTPException(403, "This skill ID is not open for public feedback")
    now = datetime.now(timezone.utc)
    origin = origin_hash(request)
    consume_public_budget(db, "session", origin, now)
    token = "qfb_" + secrets.token_urlsafe(32)
    row = SkillFeedbackCredential(owner_id=None, public_grant_id=grant.id, origin_hash=origin,
        bound_correlation_id=payload.correlation_id, bound_platform=payload.platform,
        token_hash=hash_session_token(token), device_name=payload.device_name,
        allowed_skills=[{"skill_id": grant.skill_id, "skill_name": payload.skill_name, "skill_version": payload.skill_version}],
        expires_at=now + timedelta(hours=1), per_minute=5, per_day=10)
    db.add(row)
    db.flush()
    # Reply contains only this session's capability, not users/admin metadata.
    result = {"token": token, "expires_at": row.expires_at, "correlation_id": row.bound_correlation_id,
        "platform": row.bound_platform, "skill_id": grant.skill_id, "skill_name": payload.skill_name, "skill_version": payload.skill_version,
        "max_events": 10, "per_minute": 5, "identity": "anonymous_session"}
    db.commit()
    response.headers["Cache-Control"] = "no-store"
    return result


@router.get("/admin/public-grants")
def public_grants(limit: int = Query(50, ge=1, le=100), before_id: int | None = Query(None, ge=1), db: Session = Depends(get_db), auth=Depends(get_current_auth_user)):
    require_ops_access(auth)
    query = select(SkillFeedbackPublicGrant).order_by(SkillFeedbackPublicGrant.id.desc()).limit(limit)
    if before_id:
        query = query.where(SkillFeedbackPublicGrant.id < before_id)
    return [_serialize(row) for row in db.scalars(query)]


@router.post("/admin/public-grants", status_code=201)
def register_public_skill(payload: FeedbackPublicGrantCreate, db: Session = Depends(get_db), auth=Depends(get_current_auth_user)):
    require_ops_access(auth)
    row = SkillFeedbackPublicGrant(skill_id="qsk_" + uuid.uuid4().hex, **payload.model_dump())
    db.add(row)
    db.flush()
    write_audit_log(db=db, event_type="skill_feedback.skill_registered", actor_name=auth.name, actor_id=auth.user_id,
        target_type="skill_feedback_public_grant", target_id=row.id, details={"skill_id": row.skill_id, **payload.model_dump()})
    db.commit()
    return _serialize(row)


@router.patch("/admin/public-grants/{skill_id}")
def update_public_grant(skill_id: str, payload: FeedbackPublicGrantUpdate, db: Session = Depends(get_db), auth=Depends(get_current_auth_user)):
    require_ops_access(auth)
    row = db.scalar(select(SkillFeedbackPublicGrant).where(SkillFeedbackPublicGrant.skill_id == skill_id).with_for_update())
    if row is None:
        raise HTTPException(404, "Registered skill not found")
    row.skill_name = payload.skill_name
    row.is_active = payload.is_active
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Concurrent publication; refresh and retry")
    if not row.is_active:
        db.execute(update(SkillFeedbackCredential).where(SkillFeedbackCredential.public_grant_id == row.id).values(is_active=False))
    write_audit_log(db=db, event_type="skill_feedback.public_grant_updated", actor_name=auth.name, actor_id=auth.user_id,
        target_type="skill_feedback_public_grant", target_id=row.id, details=payload.model_dump())
    db.commit()
    return _serialize(row)


@router.post("/events")
def ingest_event(payload: SkillEventIn, db: Session = Depends(get_db), credential=Depends(get_feedback_credential)):
    scope = {"skill_name": payload.skill_name, "skill_version": payload.skill_version}
    if payload.skill_id is not None:
        scope["skill_id"] = payload.skill_id
    if scope not in credential.allowed_skills or (credential.owner_id is None and payload.skill_id is None):
        raise HTTPException(403, "Skill and version outside feedback credential scope")
    if credential.owner_id is None and (payload.correlation_id != credential.bound_correlation_id or payload.platform != credential.bound_platform):
        raise HTTPException(403, "Temporary feedback session is bound to one task and platform")
    # Preserve canonical hashes for old events without a skill_id.
    data = payload.model_dump(mode="json", exclude_none=True)
    encoded = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    if len(encoded) > 65536:
        raise HTTPException(413, "Event exceeds 64 KiB")
    if payload.event_type in ("problem", "user_correction") and not payload.problem_code:
        raise HTTPException(422, "Problems and corrections require a stable problem_code")
    if payload.event_type == "user_correction" and payload.source != "human":
        raise HTTPException(422, "User correction must be explicitly attributed to human input")
    digest = hashlib.sha256(encoded).hexdigest()
    for attempt in range(3):
        duplicate = db.scalar(select(SkillFeedbackEvent).where(SkillFeedbackEvent.credential_id == credential.id, SkillFeedbackEvent.event_id == payload.event_id))
        if duplicate:
            if duplicate.payload_hash != digest:
                raise HTTPException(409, "event_id already used for different content")
            return {"event_id": duplicate.id, "run_id": duplicate.run_id, "duplicate": True}
        try:
            run = db.scalar(select(SkillFeedbackRun).where(SkillFeedbackRun.credential_id == credential.id, SkillFeedbackRun.correlation_id == payload.correlation_id))
            if run and (run.platform, run.skill_id, run.skill_name, run.skill_version) != (payload.platform, payload.skill_id, payload.skill_name, payload.skill_version):
                raise HTTPException(409, "Task correlation metadata cannot change")
            if not run:
                run = SkillFeedbackRun(credential_id=credential.id, correlation_id=payload.correlation_id, platform=payload.platform, skill_id=payload.skill_id, skill_name=payload.skill_name, skill_version=payload.skill_version)
                db.add(run)
                db.flush()
            needs_review = bool(payload.problem_code and payload.event_type != "execution")
            event = SkillFeedbackEvent(credential_id=credential.id, event_id=payload.event_id, run_id=run.id, source=payload.source, event_type=payload.event_type, problem_code=payload.problem_code, summary=payload.summary, evidence=payload.evidence, evaluation=payload.evaluation, payload_hash=digest, occurred_at=payload.occurred_at, review_status="pending" if needs_review else "not_required")
            db.add(event)
            db.flush()
            result = {"event_id": event.id, "run_id": run.id, "duplicate": False}
            db.commit()
            return result
        except IntegrityError:
            db.rollback()
            if attempt == 2:
                raise HTTPException(409, "Concurrent intake conflict; retry this event_id")


def _ops(auth):
    require_content_ops_access(auth)


@router.get("/admin/credentials")
def credentials(limit: int = Query(50, ge=1, le=100), before_id: int | None = Query(None, ge=1), db: Session = Depends(get_db), auth=Depends(get_current_auth_user)):
    require_ops_access(auth)
    query = select(SkillFeedbackCredential).order_by(SkillFeedbackCredential.id.desc()).limit(limit)
    if before_id:
        query = query.where(SkillFeedbackCredential.id < before_id)
    return [_serialize(row) for row in db.scalars(query)]


@router.post("/admin/credentials", status_code=201)
def create_credential(payload: FeedbackCredentialCreate, response: Response, db: Session = Depends(get_db), auth=Depends(get_current_auth_user)):
    require_ops_access(auth)
    owner = db.scalar(select(User).where(User.id == payload.owner_id).with_for_update())
    if owner is None or not owner.is_active:
        raise HTTPException(422, "Credential requires an active user")
    # Bound total allocations per user, so new devices cannot bypass user-level budgets.
    existing = db.scalars(select(SkillFeedbackCredential).where(SkillFeedbackCredential.owner_id == owner.id, SkillFeedbackCredential.is_active.is_(True), SkillFeedbackCredential.expires_at > datetime.now(timezone.utc))).all()
    if len(existing) >= 5 or sum(row.per_day for row in existing) + payload.per_day > 2000:
        raise HTTPException(422, "User credential allocation exceeds 5 devices or 2000 requests/day")
    token = "qfb_" + secrets.token_urlsafe(32)
    row = SkillFeedbackCredential(token_hash=hash_session_token(token), owner_id=owner.id, device_name=payload.device_name,
        allowed_skills=[item.model_dump() for item in payload.allowed_skills], expires_at=datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days),
        per_minute=payload.per_minute, per_day=payload.per_day)
    db.add(row)
    db.flush()
    write_audit_log(db=db, event_type="skill_feedback.credential_created", actor_name=auth.name, actor_id=auth.user_id, target_type="skill_feedback_credential", target_id=row.id, details={"owner_id": owner.id, "device_name": row.device_name, "allowed_skills": row.allowed_skills})
    db.commit()
    response.headers["Cache-Control"] = "no-store"
    return {**_serialize(row), "token": token}


@router.post("/admin/credentials/{credential_id}/revoke")
def revoke_credential(credential_id: int, db: Session = Depends(get_db), auth=Depends(get_current_auth_user)):
    require_ops_access(auth)
    row = db.get(SkillFeedbackCredential, credential_id)
    if row is None:
        raise HTTPException(404, "Credential not found")
    row.is_active = False
    write_audit_log(db=db, event_type="skill_feedback.credential_revoked", actor_name=auth.name, actor_id=auth.user_id, target_type="skill_feedback_credential", target_id=row.id)
    db.commit()
    return _serialize(row)


@router.patch("/admin/events/{event_id}/review")
def review_event(event_id: int, payload: FeedbackEventReview, db: Session = Depends(get_db), auth=Depends(get_current_auth_user)):
    _ops(auth)
    event = db.scalar(select(SkillFeedbackEvent).where(SkillFeedbackEvent.id == event_id).with_for_update())
    if event is None:
        raise HTTPException(404, "Event not found")
    if event.review_status != "pending":
        raise HTTPException(409, "Only pending evidence can be reviewed")
    if payload.review_status == "accepted":
        run = db.get(SkillFeedbackRun, event.run_id)
        aggregation_key = "skill:" + run.skill_id if run.skill_id else "legacy:" + run.skill_name
        issue = db.scalar(select(SkillFeedbackIssue).where(SkillFeedbackIssue.aggregation_key == aggregation_key, SkillFeedbackIssue.skill_version == run.skill_version, SkillFeedbackIssue.problem_code == event.problem_code).with_for_update())
        if issue is None:
            issue = SkillFeedbackIssue(skill_id=run.skill_id, aggregation_key=aggregation_key, skill_name=run.skill_name, skill_version=run.skill_version, problem_code=event.problem_code, title=event.summary[:200] or event.problem_code)
            db.add(issue)
            try:
                db.flush()
            except IntegrityError:
                db.rollback()
                raise HTTPException(409, "Concurrent issue review; reload and retry")
        elif event.event_type != "retest" or event.evaluation.get("outcome") == "failed":
            if issue.improvement_status == "resolved":
                issue.improvement_status = "pending_analysis"
            if event.source == "human":
                issue.communication_status = "pending_reply"
        issue.updated_at = datetime.now(timezone.utc)
        event.issue_id = issue.id
    event.review_status = payload.review_status
    event.review_note = payload.review_note
    event.reviewed_by = auth.user_id
    event.reviewed_at = datetime.now(timezone.utc)
    write_audit_log(db=db, event_type="skill_feedback.evidence_reviewed", actor_name=auth.name, actor_id=auth.user_id, target_type="skill_feedback_event", target_id=event.id, details=payload.model_dump())
    db.commit()
    return _serialize(event)


@router.get("/admin/summary")
def summary(db: Session = Depends(get_db), auth=Depends(get_current_auth_user)):
    _ops(auth)
    groups = db.execute(select(SkillFeedbackRun.platform, SkillFeedbackRun.skill_id, SkillFeedbackRun.skill_name, SkillFeedbackRun.skill_version, func.count(SkillFeedbackEvent.id)).join(SkillFeedbackEvent, SkillFeedbackEvent.run_id == SkillFeedbackRun.id).group_by(SkillFeedbackRun.platform, SkillFeedbackRun.skill_id, SkillFeedbackRun.skill_name, SkillFeedbackRun.skill_version)).all()
    completed = db.scalar(select(func.count(func.distinct(SkillFeedbackEvent.run_id))).where(SkillFeedbackEvent.event_type == "delivery", SkillFeedbackEvent.evaluation["outcome"].as_string() == "completed")) or 0
    return {"runs": db.scalar(select(func.count()).select_from(SkillFeedbackRun)), "completed_runs": completed, "events": db.scalar(select(func.count()).select_from(SkillFeedbackEvent)), "issues": db.scalar(select(func.count()).select_from(SkillFeedbackIssue)), "pending_review": db.scalar(select(func.count()).select_from(SkillFeedbackEvent).where(SkillFeedbackEvent.review_status == "pending")), "by_skill": [{"platform": p, "skill_id": s, "skill_name": n, "skill_version": v, "events": c} for p, s, n, v, c in groups]}


@router.get("/admin/issues")
def issues(limit: int = Query(50, ge=1, le=100), before_id: int | None = Query(None, ge=1), db: Session = Depends(get_db), auth=Depends(get_current_auth_user)):
    _ops(auth)
    query = select(SkillFeedbackIssue).order_by(SkillFeedbackIssue.id.desc()).limit(limit)
    if before_id:
        query = query.where(SkillFeedbackIssue.id < before_id)
    rows = db.scalars(query).all()
    counts = dict(db.execute(select(SkillFeedbackEvent.issue_id, func.count()).where(SkillFeedbackEvent.issue_id.in_([row.id for row in rows])).group_by(SkillFeedbackEvent.issue_id)).all())
    sources = {}
    for issue_id, source in db.execute(select(SkillFeedbackEvent.issue_id, SkillFeedbackEvent.source).where(SkillFeedbackEvent.issue_id.in_([row.id for row in rows])).distinct()):
        sources.setdefault(issue_id, []).append(source)
    people = dict(db.execute(select(SkillFeedbackEvent.issue_id, func.count(func.distinct(SkillFeedbackCredential.owner_id))).join(SkillFeedbackCredential, SkillFeedbackCredential.id == SkillFeedbackEvent.credential_id).where(SkillFeedbackEvent.issue_id.in_([row.id for row in rows]), SkillFeedbackEvent.review_status == "accepted").group_by(SkillFeedbackEvent.issue_id)).all())
    anonymous = dict(db.execute(select(SkillFeedbackEvent.issue_id, func.count(func.distinct(SkillFeedbackCredential.id))).join(SkillFeedbackCredential, SkillFeedbackCredential.id == SkillFeedbackEvent.credential_id).where(SkillFeedbackEvent.issue_id.in_([row.id for row in rows]), SkillFeedbackEvent.review_status == "accepted", SkillFeedbackCredential.owner_id.is_(None)).group_by(SkillFeedbackEvent.issue_id)).all())
    return [{**_serialize(row), "submitter_count": people.get(row.id, 0), "anonymous_session_count": anonymous.get(row.id, 0), "evidence_count": counts.get(row.id, 0), "sources": sorted(sources.get(row.id, []))} for row in rows]


@router.get("/admin/events")
def events(issue_id: int | None = Query(None, ge=1), run_id: int | None = Query(None, ge=1), before_id: int | None = Query(None, ge=1), limit: int = Query(50, ge=1, le=100), review_status: str | None = Query(None, pattern="^(pending|accepted|rejected|not_required|legacy)$"), db: Session = Depends(get_db), auth=Depends(get_current_auth_user)):
    _ops(auth)
    query = select(SkillFeedbackEvent, SkillFeedbackRun).join(SkillFeedbackRun, SkillFeedbackRun.id == SkillFeedbackEvent.run_id).order_by(SkillFeedbackEvent.id.desc()).limit(limit)
    if review_status:
        query = query.where(SkillFeedbackEvent.review_status == review_status)
    if issue_id:
        query = query.where(SkillFeedbackEvent.issue_id == issue_id)
    if run_id:
        query = query.where(SkillFeedbackEvent.run_id == run_id)
    if before_id:
        query = query.where(SkillFeedbackEvent.id < before_id)
    rows = db.execute(query).all()
    credentials_by_id = {row.id: row for row in db.scalars(select(SkillFeedbackCredential).where(SkillFeedbackCredential.id.in_([event.credential_id for event, _ in rows])))}
    return [{**_serialize(event), "identity": "anonymous_session" if event.credential_id in credentials_by_id and credentials_by_id[event.credential_id].owner_id is None else "account" if event.credential_id in credentials_by_id else "legacy", "correlation_id": run.correlation_id, "platform": run.platform, "skill_id": run.skill_id, "skill_name": run.skill_name, "skill_version": run.skill_version} for event, run in rows]


@router.patch("/admin/issues/{issue_id}")
def update_issue(issue_id: int, payload: SkillIssueUpdate, db: Session = Depends(get_db), auth=Depends(get_current_auth_user)):
    _ops(auth)
    issue = db.scalar(select(SkillFeedbackIssue).where(SkillFeedbackIssue.id == issue_id).with_for_update())
    if not issue:
        raise HTTPException(404, "Issue not found")
    changes = payload.model_dump(exclude_unset=True)
    if not changes or any(value is None for value in changes.values()):
        raise HTTPException(422, "Provide non-null changes")
    final_communication = changes.get("communication_status", issue.communication_status)
    final_reply = changes.get("admin_reply", issue.admin_reply)
    final_improvement = changes.get("improvement_status", issue.improvement_status)
    final_retest = changes.get("retest_result", issue.retest_result)
    if final_communication == "replied" and not (final_reply or "").strip():
        raise HTTPException(422, "Reply text required to mark replied")
    if final_improvement == "resolved" and not (final_retest or "").strip():
        raise HTTPException(422, "Retest result required to resolve")
    for key, value in changes.items():
        setattr(issue, key, value)
    issue.updated_at = datetime.now(timezone.utc)
    write_audit_log(db=db, event_type="skill_feedback.updated", actor_name=auth.name, actor_id=auth.user_id, target_type="skill_feedback_issue", target_id=issue.id, target_name=issue.title, details=changes)
    db.commit()
    return _serialize(issue)
