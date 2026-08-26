from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import PlatformSettings

_PLATFORM_SETTINGS_ID = 1


def get_or_create_platform_settings(db: Session) -> PlatformSettings:
    row = db.get(PlatformSettings, _PLATFORM_SETTINGS_ID)
    if row is not None:
        return row
    row = PlatformSettings(id=_PLATFORM_SETTINGS_ID, chat_agent_ui_enabled=False)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
