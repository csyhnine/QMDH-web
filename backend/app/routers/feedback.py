from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.audit import write_audit_log
from app.core.auth import get_current_auth_user, require_content_ops_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import User, UserFeedback, UserFeedbackMessage
from app.schemas import (
    FeedbackMessageOut,
    UserFeedbackAdminUpdate,
    UserFeedbackCreate,
    UserFeedbackMessageCreate,
    UserFeedbackOut,
)
from app.services.media_storage import resolve_storage_path

router = APIRouter(prefix="/feedback", tags=["feedback"])


def _resolve_db_user(db: Session, auth_user: AuthUserProfile) -> User:
    user = db.get(User, auth_user.user_id) if auth_user.user_id is not None else None
    if user is None:
        user = db.scalar(select(User).where(User.name == auth_user.name))
    if user is None:
        raise HTTPException(status_code=404, detail="Authenticated user is not provisioned in the database")
    return user


def _normalize_attachment_paths(paths: list[str]) -> list[str]:
    return [path.strip() for path in paths if path.strip()][:6]


def _resolved_attachment_paths(paths: list[str]) -> list[str]:
    return [resolve_storage_path(path) for path in paths if str(path).strip()]


def _author_labels(user: User | None) -> tuple[str, str]:
    if user is None:
        return "", ""
    return user.name, user.display_name or user.name


def _message_out(message: UserFeedbackMessage) -> FeedbackMessageOut:
    author_name, author_display_name = _author_labels(message.author)
    return FeedbackMessageOut(
        id=message.id,
        feedback_id=message.feedback_id,
        author_role=message.author_role,
        author_user_id=message.author_user_id,
        author_user_name=author_name,
        author_display_name=author_display_name,
        body=message.body,
        attachment_paths=_resolved_attachment_paths(message.attachment_paths or []),
        created_at=message.created_at,
    )


def _feedback_thread_messages(feedback: UserFeedback) -> list[FeedbackMessageOut]:
    user_name, user_display_name = _author_labels(feedback.user)
    thread: list[FeedbackMessageOut] = [
        FeedbackMessageOut(
            id=0,
            feedback_id=feedback.id,
            author_role="user",
            author_user_id=feedback.user_id,
            author_user_name=user_name,
            author_display_name=user_display_name,
            body=feedback.message,
            attachment_paths=_resolved_attachment_paths(feedback.attachment_paths or []),
            created_at=feedback.created_at,
        )
    ]

    stored_messages = list(feedback.messages or [])
    if stored_messages:
        thread.extend(_message_out(item) for item in stored_messages)
        return thread

    if feedback.admin_reply:
        admin_name, admin_display_name = _author_labels(feedback.replied_by)
        thread.append(
            FeedbackMessageOut(
                id=-1,
                feedback_id=feedback.id,
                author_role="admin",
                author_user_id=feedback.replied_by_user_id or 0,
                author_user_name=admin_name or "admin",
                author_display_name=admin_display_name or "管理员",
                body=feedback.admin_reply,
                attachment_paths=[],
                created_at=feedback.replied_at or feedback.updated_at or feedback.created_at,
            )
        )
    return thread


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
        attachment_paths=_resolved_attachment_paths(feedback.attachment_paths or []),
        status=feedback.status,
        admin_reply=feedback.admin_reply or "",
        replied_by_user_name=replied_by.name if replied_by else None,
        replied_at=feedback.replied_at,
        created_at=feedback.created_at,
        updated_at=feedback.updated_at or feedback.created_at,
        messages=_feedback_thread_messages(feedback),
    )


def _feedback_query():
    return select(UserFeedback).options(
        selectinload(UserFeedback.user),
        selectinload(UserFeedback.replied_by),
        selectinload(UserFeedback.messages).selectinload(UserFeedbackMessage.author),
    )


def _get_owned_feedback(db: Session, *, feedback_id: int, user_id: int) -> UserFeedback:
    feedback = db.scalar(_feedback_query().where(UserFeedback.id == feedback_id))
    if not feedback or feedback.user_id != user_id:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return feedback


def _append_feedback_message(
    *,
    db: Session,
    feedback: UserFeedback,
    author: User,
    author_role: str,
    body: str,
    attachment_paths: list[str] | None = None,
) -> UserFeedbackMessage:
    message = UserFeedbackMessage(
        feedback_id=feedback.id,
        author_user_id=author.id,
        author_role=author_role,
        body=body.strip(),
        attachment_paths=_normalize_attachment_paths(attachment_paths or []),
    )
    db.add(message)
    feedback.updated_at = datetime.now(timezone.utc)
    return message


@router.get("", response_model=list[UserFeedbackOut])
def list_my_feedback(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[UserFeedbackOut]:
    user = _resolve_db_user(db, auth_user)
    feedback_items = db.scalars(
        _feedback_query()
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
        attachment_paths=_normalize_attachment_paths(payload.attachment_paths),
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
    feedback = db.scalar(_feedback_query().where(UserFeedback.id == feedback.id))
    assert feedback is not None
    return _to_feedback_out(feedback)


@router.post("/{feedback_id}/messages", response_model=UserFeedbackOut)
def append_my_feedback_message(
    feedback_id: int,
    payload: UserFeedbackMessageCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> UserFeedbackOut:
    user = _resolve_db_user(db, auth_user)
    feedback = _get_owned_feedback(db, feedback_id=feedback_id, user_id=user.id)
    if feedback.status == "closed":
        raise HTTPException(status_code=400, detail="This feedback thread is closed")

    _append_feedback_message(
        db=db,
        feedback=feedback,
        author=user,
        author_role="user",
        body=payload.message,
        attachment_paths=payload.attachment_paths,
    )
    feedback.status = "open"
    db.commit()

    write_audit_log(
        db=db,
        event_type="feedback.user_replied",
        actor_name=auth_user.name,
        actor_id=user.id,
        target_type="user_feedback",
        target_id=feedback.id,
        target_name=feedback.title,
        details={"status": feedback.status},
    )
    db.commit()
    feedback = db.scalar(_feedback_query().where(UserFeedback.id == feedback.id))
    assert feedback is not None
    return _to_feedback_out(feedback)


@router.get("/admin", response_model=list[UserFeedbackOut])
def list_all_feedback(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[UserFeedbackOut]:
    require_content_ops_access(auth_user)
    feedback_items = db.scalars(
        _feedback_query().order_by(UserFeedback.updated_at.desc(), UserFeedback.id.desc())
    ).all()
    return [_to_feedback_out(item) for item in feedback_items]


@router.patch("/admin/{feedback_id}", response_model=UserFeedbackOut)
def reply_feedback(
    feedback_id: int,
    payload: UserFeedbackAdminUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> UserFeedbackOut:
    require_content_ops_access(auth_user)
    feedback = db.scalar(_feedback_query().where(UserFeedback.id == feedback_id))
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    admin_user = _resolve_db_user(db, auth_user)
    reply_body = payload.admin_reply.strip()
    _append_feedback_message(
        db=db,
        feedback=feedback,
        author=admin_user,
        author_role="admin",
        body=reply_body,
    )
    feedback.status = payload.status
    feedback.admin_reply = reply_body
    feedback.replied_by_user_id = admin_user.id
    feedback.replied_at = datetime.now(timezone.utc)
    db.commit()

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
    feedback = db.scalar(_feedback_query().where(UserFeedback.id == feedback.id))
    assert feedback is not None
    return _to_feedback_out(feedback)
