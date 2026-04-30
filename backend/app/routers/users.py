from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, require_user_admin
from app.core.config import AuthUserProfile
from app.core.security import hash_password
from app.database import get_db
from app.models import User
from app.schemas import UserCreate, UserOut, UserPasswordReset, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])
VALID_ROLES = {"owner", "admin", "ops", "designer"}


def _normalize_project_codes(project_codes: list[str]) -> list[str]:
    normalized = [code.strip() for code in project_codes if code.strip()]
    return normalized or ["QMDH-001"]


def _validate_role(role: str) -> str:
    normalized = role.strip()
    if normalized not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid user role")
    return normalized


def _to_user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        display_name=user.display_name or user.name,
        role=user.role,
        project_codes=user.project_codes or [],
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        last_login_at=user.last_login_at,
    )


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[UserOut]:
    require_user_admin(auth_user)
    users = db.scalars(select(User).order_by(User.created_at.desc(), User.id.desc())).all()
    return [_to_user_out(user) for user in users]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> UserOut:
    require_user_admin(auth_user)
    existing = db.scalar(select(User).where(User.name == payload.name.strip()))
    if existing:
        raise HTTPException(status_code=409, detail="User already exists")

    user = User(
        name=payload.name.strip(),
        display_name=payload.display_name.strip() or payload.name.strip(),
        role=_validate_role(payload.role),
        password_hash=hash_password(payload.password),
        is_active=payload.is_active,
        project_codes=_normalize_project_codes(payload.project_codes),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _to_user_out(user)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> UserOut:
    require_user_admin(auth_user)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    updates = payload.model_dump(exclude_unset=True)
    if "display_name" in updates and updates["display_name"] is not None:
        user.display_name = updates["display_name"].strip() or user.name
    if "role" in updates and updates["role"] is not None:
        user.role = _validate_role(updates["role"])
    if "project_codes" in updates and updates["project_codes"] is not None:
        user.project_codes = _normalize_project_codes(updates["project_codes"])
    if "is_active" in updates and updates["is_active"] is not None:
        if auth_user.user_id == user.id and not updates["is_active"]:
            raise HTTPException(status_code=400, detail="Cannot disable the current user")
        user.is_active = bool(updates["is_active"])

    db.commit()
    db.refresh(user)
    return _to_user_out(user)


@router.post("/{user_id}/reset-password", response_model=UserOut)
def reset_user_password(
    user_id: int,
    payload: UserPasswordReset,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> UserOut:
    require_user_admin(auth_user)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(payload.password)
    db.commit()
    db.refresh(user)
    return _to_user_out(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Response:
    require_user_admin(auth_user)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if auth_user.user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot disable the current user")
    user.is_active = False
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
