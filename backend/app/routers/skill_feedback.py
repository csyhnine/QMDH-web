"""Authenticated skill telemetry. Only explicit problems enter the ops inbox."""
from datetime import datetime, timezone
import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import get_current_agent_auth, get_current_auth_user, require_content_ops_access
from app.core.audit import write_audit_log
from app.database import get_db
from app.models import SkillFeedbackEvent, SkillFeedbackIssue, SkillFeedbackRun
from app.skill_feedback_schemas import SkillEventIn, SkillIssueUpdate

router = APIRouter(prefix="/skills", tags=["skill-feedback"])


def _serialize(row):
    return {column.name: getattr(row, column.name) for column in row.__table__.columns if column.name != "payload_hash"}


@router.post("/events")
def ingest_event(payload: SkillEventIn, db: Session = Depends(get_db), agent=Depends(get_current_agent_auth)):
    data = payload.model_dump(mode="json")
    encoded = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()
    if len(encoded) > 65536:
        raise HTTPException(413, "Event exceeds 64 KiB")
    if payload.event_type in ("problem", "user_correction") and not payload.problem_code:
        raise HTTPException(422, "Problems and corrections require a stable problem_code")
    if payload.event_type == "user_correction" and payload.source != "human":
        raise HTTPException(422, "User correction must be explicitly attributed to human input")
    digest = hashlib.sha256(encoded).hexdigest()
    for attempt in range(3):
        duplicate = db.scalar(select(SkillFeedbackEvent).where(SkillFeedbackEvent.client_id == agent.client_id, SkillFeedbackEvent.event_id == payload.event_id))
        if duplicate:
            if duplicate.payload_hash != digest:
                raise HTTPException(409, "event_id already used for different content")
            return {"event_id": duplicate.id, "run_id": duplicate.run_id, "duplicate": True}
        try:
            run = db.scalar(select(SkillFeedbackRun).where(SkillFeedbackRun.client_id == agent.client_id, SkillFeedbackRun.correlation_id == payload.correlation_id))
            if run and (run.platform, run.skill_name, run.skill_version) != (payload.platform, payload.skill_name, payload.skill_version):
                raise HTTPException(409, "Task correlation metadata cannot change")
            if not run:
                run = SkillFeedbackRun(client_id=agent.client_id, correlation_id=payload.correlation_id, platform=payload.platform, skill_name=payload.skill_name, skill_version=payload.skill_version)
                db.add(run)
                db.flush()
            issue = None
            if payload.problem_code and payload.event_type != "execution":
                issue = db.scalar(select(SkillFeedbackIssue).where(SkillFeedbackIssue.skill_name == payload.skill_name, SkillFeedbackIssue.skill_version == payload.skill_version, SkillFeedbackIssue.problem_code == payload.problem_code).with_for_update())
                if not issue:
                    issue = SkillFeedbackIssue(skill_name=payload.skill_name, skill_version=payload.skill_version, problem_code=payload.problem_code, title=payload.summary[:200] or payload.problem_code)
                    db.add(issue)
                    db.flush()
                elif payload.event_type != "retest" or payload.evaluation.get("outcome") == "failed":
                    if issue.improvement_status == "resolved":
                        issue.improvement_status = "pending_analysis"
                    if payload.source == "human":
                        issue.communication_status = "pending_reply"
                issue.updated_at = datetime.now(timezone.utc)
            event = SkillFeedbackEvent(client_id=agent.client_id, event_id=payload.event_id, run_id=run.id, issue_id=issue.id if issue else None, source=payload.source, event_type=payload.event_type, problem_code=payload.problem_code, summary=payload.summary, evidence=payload.evidence, evaluation=payload.evaluation, payload_hash=digest, occurred_at=payload.occurred_at)
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


@router.get("/admin/summary")
def summary(db: Session = Depends(get_db), auth=Depends(get_current_auth_user)):
    _ops(auth)
    groups = db.execute(select(SkillFeedbackRun.platform, SkillFeedbackRun.skill_name, SkillFeedbackRun.skill_version, func.count(SkillFeedbackEvent.id)).join(SkillFeedbackEvent, SkillFeedbackEvent.run_id == SkillFeedbackRun.id).group_by(SkillFeedbackRun.platform, SkillFeedbackRun.skill_name, SkillFeedbackRun.skill_version)).all()
    completed = db.scalar(select(func.count(func.distinct(SkillFeedbackEvent.run_id))).where(SkillFeedbackEvent.event_type == "delivery", SkillFeedbackEvent.evaluation["outcome"].as_string() == "completed")) or 0
    return {"runs": db.scalar(select(func.count()).select_from(SkillFeedbackRun)), "completed_runs": completed, "events": db.scalar(select(func.count()).select_from(SkillFeedbackEvent)), "issues": db.scalar(select(func.count()).select_from(SkillFeedbackIssue)), "by_skill": [{"platform": p, "skill_name": n, "skill_version": v, "events": c} for p, n, v, c in groups]}


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
    return [{**_serialize(row), "evidence_count": counts.get(row.id, 0), "sources": sorted(sources.get(row.id, []))} for row in rows]


@router.get("/admin/events")
def events(issue_id: int | None = Query(None, ge=1), run_id: int | None = Query(None, ge=1), before_id: int | None = Query(None, ge=1), limit: int = Query(50, ge=1, le=100), db: Session = Depends(get_db), auth=Depends(get_current_auth_user)):
    _ops(auth)
    query = select(SkillFeedbackEvent, SkillFeedbackRun).join(SkillFeedbackRun, SkillFeedbackRun.id == SkillFeedbackEvent.run_id).order_by(SkillFeedbackEvent.id.desc()).limit(limit)
    if issue_id:
        query = query.where(SkillFeedbackEvent.issue_id == issue_id)
    if run_id:
        query = query.where(SkillFeedbackEvent.run_id == run_id)
    if before_id:
        query = query.where(SkillFeedbackEvent.id < before_id)
    return [{**_serialize(event), "correlation_id": run.correlation_id, "platform": run.platform, "skill_name": run.skill_name, "skill_version": run.skill_version} for event, run in db.execute(query)]


@router.patch("/admin/issues/{issue_id}")
def update_issue(issue_id: int, payload: SkillIssueUpdate, db: Session = Depends(get_db), auth=Depends(get_current_auth_user)):
    _ops(auth)
    issue = db.scalar(select(SkillFeedbackIssue).where(SkillFeedbackIssue.id == issue_id).with_for_update())
    if not issue:
        raise HTTPException(404, "Issue not found")
    changes = payload.model_dump(exclude_unset=True)
    if not changes or any(value is None for value in changes.values()):
        raise HTTPException(422, "Provide non-null changes")
    if changes.get("communication_status") == "replied" and not (changes.get("admin_reply") or issue.admin_reply).strip():
        raise HTTPException(422, "Reply text required to mark replied")
    if changes.get("improvement_status") == "resolved" and not (changes.get("retest_result") or issue.retest_result).strip():
        raise HTTPException(422, "Retest result required to resolve")
    for key, value in changes.items():
        setattr(issue, key, value)
    issue.updated_at = datetime.now(timezone.utc)
    write_audit_log(db=db, event_type="skill_feedback.updated", actor_name=auth.name, actor_id=auth.user_id, target_type="skill_feedback_issue", target_id=issue.id, target_name=issue.title, details=changes)
    db.commit()
    return _serialize(issue)
