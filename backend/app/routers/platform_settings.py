from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, get_optional_auth_user, has_admin_access, require_ops_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import ProviderProfile
from app.services.platform_settings_service import get_or_create_platform_settings
from app.services.prompt_polish_service import prompt_polish_builtin_prompts

router = APIRouter(prefix="/settings", tags=["settings"])


class PromptPolishModePromptsOut(BaseModel):
    generate: str | None = None
    edit: str | None = None
    video: str | None = None


class PromptPolishBuiltinPromptsOut(BaseModel):
    generate: str
    edit: str
    video: str


class PlatformSettingsOut(BaseModel):
    chat_agent_ui_enabled: bool
    prompt_polish_enabled: bool
    prompt_polish_provider_id: int | None = None
    prompt_polish_system_prompt: str | None = None
    prompt_polish_system_prompts: PromptPolishModePromptsOut | None = None
    prompt_polish_builtin_prompts: PromptPolishBuiltinPromptsOut | None = None
    updated_at: datetime | None = None


class PromptPolishModePromptsUpdate(BaseModel):
    generate: str | None = Field(default=None, max_length=12000)
    edit: str | None = Field(default=None, max_length=12000)
    video: str | None = Field(default=None, max_length=12000)


class PlatformSettingsUpdate(BaseModel):
    chat_agent_ui_enabled: bool | None = None
    prompt_polish_enabled: bool | None = None
    prompt_polish_provider_id: int | None = None
    prompt_polish_system_prompt: str | None = Field(default=None, max_length=12000)
    prompt_polish_system_prompts: PromptPolishModePromptsUpdate | None = None


def _clean_optional_prompt(value: str | None) -> str | None:
    cleaned = str(value or "").strip()
    return cleaned or None


def _serialize_platform_settings(row, *, include_admin_fields: bool) -> PlatformSettingsOut:
    mode_prompts = None
    builtin_prompts = None
    legacy_prompt = None
    if include_admin_fields:
        mode_prompts = PromptPolishModePromptsOut(
            generate=_clean_optional_prompt(row.prompt_polish_system_prompt_generate),
            edit=_clean_optional_prompt(row.prompt_polish_system_prompt_edit),
            video=_clean_optional_prompt(row.prompt_polish_system_prompt_video),
        )
        defaults = prompt_polish_builtin_prompts()
        builtin_prompts = PromptPolishBuiltinPromptsOut(
            generate=defaults["generate"],
            edit=defaults["edit"],
            video=defaults["video"],
        )
        legacy_prompt = _clean_optional_prompt(row.prompt_polish_system_prompt)
    return PlatformSettingsOut(
        chat_agent_ui_enabled=row.chat_agent_ui_enabled,
        prompt_polish_enabled=row.prompt_polish_enabled,
        prompt_polish_provider_id=row.prompt_polish_provider_id if include_admin_fields else None,
        prompt_polish_system_prompt=legacy_prompt,
        prompt_polish_system_prompts=mode_prompts,
        prompt_polish_builtin_prompts=builtin_prompts,
        updated_at=row.updated_at,
    )


def _validate_prompt_polish_provider(db: Session, provider_id: int | None) -> None:
    if provider_id is None:
        return
    provider = db.get(ProviderProfile, provider_id)
    if provider is None or not provider.enabled:
        raise HTTPException(status_code=400, detail="Prompt polish provider is missing or disabled.")
    if "chat.completions" not in (provider.capabilities or []):
        raise HTTPException(status_code=400, detail="Prompt polish provider must support chat.completions.")


@router.get("/platform", response_model=PlatformSettingsOut)
def get_platform_settings_public(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile | None = Depends(get_optional_auth_user),
) -> PlatformSettingsOut:
    row = get_or_create_platform_settings(db)
    include_admin_fields = auth_user is not None and has_admin_access(auth_user.role)
    return _serialize_platform_settings(row, include_admin_fields=include_admin_fields)


@router.patch("/platform", response_model=PlatformSettingsOut)
def update_platform_settings(
    payload: PlatformSettingsUpdate,
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
    db: Session = Depends(get_db),
) -> PlatformSettingsOut:
    require_ops_access(auth_user)
    row = get_or_create_platform_settings(db)
    update_data = payload.model_dump(exclude_unset=True)

    if "chat_agent_ui_enabled" in update_data:
        row.chat_agent_ui_enabled = bool(update_data["chat_agent_ui_enabled"])
    if "prompt_polish_enabled" in update_data:
        row.prompt_polish_enabled = bool(update_data["prompt_polish_enabled"])
    if "prompt_polish_provider_id" in update_data:
        provider_id = update_data["prompt_polish_provider_id"]
        _validate_prompt_polish_provider(db, provider_id)
        row.prompt_polish_provider_id = provider_id
    if "prompt_polish_system_prompt" in update_data:
        row.prompt_polish_system_prompt = _clean_optional_prompt(update_data["prompt_polish_system_prompt"])
    if "prompt_polish_system_prompts" in update_data and update_data["prompt_polish_system_prompts"] is not None:
        mode_prompts = update_data["prompt_polish_system_prompts"]
        if "generate" in mode_prompts:
            row.prompt_polish_system_prompt_generate = _clean_optional_prompt(mode_prompts["generate"])
        if "edit" in mode_prompts:
            row.prompt_polish_system_prompt_edit = _clean_optional_prompt(mode_prompts["edit"])
        if "video" in mode_prompts:
            row.prompt_polish_system_prompt_video = _clean_optional_prompt(mode_prompts["video"])
        row.prompt_polish_system_prompt = None

    row.updated_by_user_id = auth_user.user_id
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _serialize_platform_settings(row, include_admin_fields=True)
