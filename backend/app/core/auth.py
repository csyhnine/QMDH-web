from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import AuthUserProfile, settings
from app.core.security import hash_session_token
from app.database import get_db
from app.models import AuthSession, User

USER_ADMIN_ROLES = {"owner", "admin"}
OPS_ROLES = {"owner", "admin", "ops"}


def get_current_auth_user(
    authorization: str | None = Header(default=None),
    x_qmdh_auth: str | None = Header(default=None),
    x_qmdh_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AuthUserProfile:
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        session = db.scalar(
            select(AuthSession)
            .join(AuthSession.user)
            .where(
                AuthSession.token_hash == hash_session_token(token),
                AuthSession.revoked_at.is_(None),
                AuthSession.expires_at > datetime.now(timezone.utc),
                User.is_active.is_(True),
            )
        )
        if not session:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")
        return AuthUserProfile(
            name=session.user.name,
            token=token,
            role=session.user.role,
            project_codes=tuple(session.user.project_codes or []),
            user_id=session.user.id,
            display_name=session.user.display_name or session.user.name,
        )

    if not x_qmdh_auth:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication token")

    profile = settings.get_auth_user_profiles().get(x_qmdh_auth.strip())
    if not profile:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token")

    if x_qmdh_user and x_qmdh_user.strip() != profile.name:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Authenticated user does not match token")

    return profile


def require_user_admin(auth_user: AuthUserProfile) -> None:
    if auth_user.role not in USER_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User admin access required")


def require_ops_access(auth_user: AuthUserProfile) -> None:
    if auth_user.role not in OPS_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Operations access required")


def ensure_project_access(auth_user: AuthUserProfile, project_code: str) -> None:
    if "*" in auth_user.project_codes:
        return
    if project_code not in auth_user.project_codes:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project access denied")


def can_access_project(auth_user: AuthUserProfile, project_code: str) -> bool:
    return "*" in auth_user.project_codes or project_code in auth_user.project_codes
