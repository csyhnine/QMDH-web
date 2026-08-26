from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, require_ops_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.services.platform_settings_service import get_or_create_platform_settings

router = APIRouter(prefix="/settings", tags=["settings"])


class PlatformSettingsOut(BaseModel):
    chat_agent_ui_enabled: bool
    updated_at: datetime | None = None


class PlatformSettingsUpdate(BaseModel):
    chat_agent_ui_enabled: bool


@router.get("/platform", response_model=PlatformSettingsOut)
def get_platform_settings_public(db: Session = Depends(get_db)) -> PlatformSettingsOut:
    row = get_or_create_platform_settings(db)
    return PlatformSettingsOut(
        chat_agent_ui_enabled=row.chat_agent_ui_enabled,
        updated_at=row.updated_at,
    )


@router.patch("/platform", response_model=PlatformSettingsOut)
def update_platform_settings(
    payload: PlatformSettingsUpdate,
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
    db: Session = Depends(get_db),
) -> PlatformSettingsOut:
    require_ops_access(auth_user)
    row = get_or_create_platform_settings(db)
    row.chat_agent_ui_enabled = payload.chat_agent_ui_enabled
    row.updated_by_user_id = auth_user.user_id
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return PlatformSettingsOut(
        chat_agent_ui_enabled=row.chat_agent_ui_enabled,
        updated_at=row.updated_at,
    )
