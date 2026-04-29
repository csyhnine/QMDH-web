from __future__ import annotations

from fastapi import Header, HTTPException, status

from app.core.config import AuthUserProfile, settings


def get_current_auth_user(
    x_qmdh_auth: str | None = Header(default=None),
    x_qmdh_user: str | None = Header(default=None),
) -> AuthUserProfile:
    if not x_qmdh_auth:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication token")

    profile = settings.get_auth_user_profiles().get(x_qmdh_auth.strip())
    if not profile:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token")

    if x_qmdh_user and x_qmdh_user.strip() != profile.name:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Authenticated user does not match token")

    return profile


def ensure_project_access(auth_user: AuthUserProfile, project_code: str) -> None:
    if "*" in auth_user.project_codes:
        return
    if project_code not in auth_user.project_codes:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project access denied")


def can_access_project(auth_user: AuthUserProfile, project_code: str) -> bool:
    return "*" in auth_user.project_codes or project_code in auth_user.project_codes
