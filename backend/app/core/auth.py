from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import AgentAuthProfile, AuthUserProfile, settings
from app.core.security import hash_session_token
from app.database import get_db
from app.models import AgentClient, AuthSession, User

ADMIN_ROLE_ALIASES = {"owner", "admin", "ops"}


def normalize_user_role(role: str) -> str:
    normalized = (role or "").strip().lower()
    return "admin" if normalized in ADMIN_ROLE_ALIASES else "designer"


def has_admin_access(role: str) -> bool:
    return normalize_user_role(role) == "admin"


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
            role=normalize_user_role(session.user.role),
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

    return AuthUserProfile(
        name=profile.name,
        token=profile.token,
        role=normalize_user_role(profile.role),
        project_codes=profile.project_codes,
        user_id=profile.user_id,
        display_name=profile.display_name or profile.name,
    )


def get_current_agent_auth(
    x_qmdh_agent_token: str | None = Header(default=None),
    x_qmdh_agent_key: str | None = Header(default=None),
    x_qmdh_execution_id: str | None = Header(default=None),
    x_request_id: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> AgentAuthProfile:
    if not x_qmdh_agent_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing agent authentication token")

    client = db.scalar(
        select(AgentClient)
        .join(AgentClient.user, isouter=True)
        .where(
            AgentClient.token_hash == hash_session_token(x_qmdh_agent_token.strip()),
            AgentClient.is_active.is_(True),
        )
    )
    if not client:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid agent authentication token")

    if x_qmdh_agent_key and x_qmdh_agent_key.strip() != client.key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Agent identity does not match token")

    if client.user and not client.user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Agent user is inactive")

    user_name = client.user.name if client.user else client.key
    user_role = normalize_user_role(client.user.role if client.user else client.role)
    project_codes = tuple(client.project_codes or client.user.project_codes or [])

    client.last_seen_at = datetime.now(timezone.utc)
    client.last_request_id = (x_request_id or "").strip()
    db.commit()

    return AgentAuthProfile(
        client_id=client.id,
        key=client.key,
        display_name=client.display_name or (client.user.display_name if client.user else client.key),
        device_id=client.device_id,
        environment=client.environment,
        user_id=client.user_id,
        user_name=user_name,
        user_role=user_role,
        project_codes=project_codes,
        request_id=(x_request_id or "").strip(),
        external_execution_id=(x_qmdh_execution_id or "").strip(),
    )


def require_user_admin(auth_user: AuthUserProfile) -> None:
    if not has_admin_access(auth_user.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User admin access required")


def require_ops_access(auth_user: AuthUserProfile) -> None:
    if not has_admin_access(auth_user.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Operations access required")


def ensure_project_access(auth_user: AuthUserProfile, project_code: str) -> None:
    if "*" in auth_user.project_codes:
        return
    if project_code not in auth_user.project_codes:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project access denied")


def can_access_project(auth_user: AuthUserProfile, project_code: str) -> bool:
    return "*" in auth_user.project_codes or project_code in auth_user.project_codes
