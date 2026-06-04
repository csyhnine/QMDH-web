from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, normalize_user_role
from app.core.config import AuthUserProfile, settings
from app.core.security import create_session_token, hash_session_token, verify_password
from app.database import get_db
from app.models import AuthSession, User
from app.schemas import AuthLoginIn, AuthLoginOut, AuthUserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _to_auth_user_out(user: User) -> AuthUserOut:
    return AuthUserOut(
        id=user.id,
        name=user.name,
        display_name=user.display_name or user.name,
        group_name=user.group_name or "",
        role=normalize_user_role(user.role),
        project_codes=user.project_codes or [],
        is_active=user.is_active,
        monthly_quota=user.monthly_quota,
        billing_plan=user.billing_plan or "standard",
        billing_status=user.billing_status or "active",
        quota_policy=user.quota_policy or "soft_warn",
        quota_reset_cycle=user.quota_reset_cycle or "monthly",
    )


@router.post("/login", response_model=AuthLoginOut)
def login(payload: AuthLoginIn, db: Session = Depends(get_db)) -> AuthLoginOut:
    user = db.scalar(select(User).where(User.name == payload.username.strip()))
    if not user or not user.is_active or not user.password_hash:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    token = create_session_token()
    expires_at = datetime.now(timezone.utc) + timedelta(days=max(1, settings.auth_session_days))
    session = AuthSession(user_id=user.id, token_hash=hash_session_token(token), expires_at=expires_at)
    user.last_login_at = datetime.now(timezone.utc)
    db.add(session)
    db.commit()
    db.refresh(user)

    return AuthLoginOut(token=token, expires_at=expires_at, user=_to_auth_user_out(user))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Response:
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_session_token(token)))
        if session and not session.revoked_at:
            session.revoked_at = datetime.now(timezone.utc)
            db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=AuthUserOut)
def me(
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
    db: Session = Depends(get_db),
) -> AuthUserOut:
    if auth_user.user_id is not None:
        user = db.get(User, auth_user.user_id)
        if user:
            return _to_auth_user_out(user)

    return AuthUserOut(
        id=auth_user.user_id or 0,
        name=auth_user.name,
        display_name=auth_user.display_name or auth_user.name,
        group_name="",
        role=auth_user.role,
        project_codes=list(auth_user.project_codes),
        is_active=True,
        monthly_quota=None,
        billing_plan="standard",
        billing_status="active",
        quota_policy="soft_warn",
        quota_reset_cycle="monthly",
    )
