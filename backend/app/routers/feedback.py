from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log
from app.core.auth import get_current_auth_user, require_user_admin
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import User, UserFeedback
from app.schemas import UserFeedbackAdminUpdate, UserFeedbackCreate, UserFeedbackOut
from app.services.media_storage import resolve_storage_path

router = APIRouter(prefix="/feedback", tags=["feedback"])


def _resolve_db_user(db: Session, auth_user: AuthUserProfile) -> User:
    user = db.get(User, auth_user.user_id) if auth_user.user_id is not None else None
    if user is None:
        user = db.scalar(select(User).where(User.name == auth_user.name))
    if user is None:
        raise HTTPException(status_code=404, detail="Authenticated user is not provisioned in the database")
    return user


def _to_feedback_out(feedback: UserFeedback) -> UserFeedbackOut:
    user = feedback.user
    replied_by = feedback.replied_by
    return UserFeedbackOut(
        id=feedback.id,
        user_id=feedback.user_id,
        user_name=user.name if user else "",
        user_display_name=(user.display_name or user.name) if user else "",
        title=feedback.title,
        message=feedback.message,
        attachment_paths=[resolve_storage_path(path) for path in (feedback.attachment_paths or []) if str(path).strip()],
        status=feedback.status,
        admin_reply=feedback.admin_reply or "",
        replied_by_user_name=replied_by.name if replied_by else None,
        replied_at=feedback.replied_at,
        created_at=feedback.created_at,
        updated_at=feedback.updated_at or feedback.created_at,
    )


@router.get("", response_model=list[UserFeedbackOut])
def list_my_feedback(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[UserFeedbackOut]:
    user = _resolve_db_user(db, auth_user)
    feedback_items = db.scalars(
        select(UserFeedback)
        .where(UserFeedback.user_id == user.id)
        .order_by(UserFeedback.updated_at.desc(), UserFeedback.id.desc())
    ).all()
    return [_to_feedback_out(item) for item in feedback_items]


@router.post("", response_model=UserFeedbackOut, status_code=status.HTTP_201_CREATED)
def create_feedback(
    payload: UserFeedbackCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> UserFeedbackOut:
    user = _resolve_db_user(db, auth_user)
    feedback = UserFeedback(
        user_id=user.id,
        title=payload.title.strip(),
        message=payload.message.strip(),
        attachment_paths=[path.strip() for path in payload.attachment_paths if path.strip()][:6],
        status="open",
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    write_audit_log(
        db=db,
        event_type="feedback.created",
        actor_name=auth_user.name,
        actor_id=user.id,
        target_type="user_feedback",
        target_id=feedback.id,
        target_name=feedback.title,
        details={"status": feedback.status},
    )
    db.commit()
    db.refresh(feedback)
    return _to_feedback_out(feedback)


@router.get("/admin", response_model=list[UserFeedbackOut])
def list_all_feedback(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[UserFeedbackOut]:
    require_user_admin(auth_user)
    feedback_items = db.scalars(
        select(UserFeedback).order_by(UserFeedback.updated_at.desc(), UserFeedback.id.desc())
    ).all()
    return [_to_feedback_out(item) for item in feedback_items]


@router.patch("/admin/{feedback_id}", response_model=UserFeedbackOut)
def reply_feedback(
    feedback_id: int,
    payload: UserFeedbackAdminUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> UserFeedbackOut:
    require_user_admin(auth_user)
    feedback = db.get(UserFeedback, feedback_id)
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    admin_user = _resolve_db_user(db, auth_user)
    feedback.status = payload.status
    feedback.admin_reply = payload.admin_reply.strip()
    feedback.replied_by_user_id = admin_user.id
    feedback.replied_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(feedback)

    write_audit_log(
        db=db,
        event_type="feedback.replied",
        actor_name=auth_user.name,
        actor_id=admin_user.id,
        target_type="user_feedback",
        target_id=feedback.id,
        target_name=feedback.title,
        details={"status": feedback.status},
    )
    db.commit()
    db.refresh(feedback)
    return _to_feedback_out(feedback)
