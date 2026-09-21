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
from app.services.prompt_polish_service import (
    CreationMode,
    PromptPolishModeLimits,
    mode_limits_to_dict,
    prompt_polish_builtin_prompts,
    prompt_polish_default_mode_limits,
    resolved_prompt_polish_mode_limits,
    serialize_prompt_polish_mode_limits,
)

router = APIRouter(prefix="/settings", tags=["settings"])


class PromptPolishModePromptsOut(BaseModel):
    generate: str | None = None
    edit: str | None = None
    video: str | None = None


class PromptPolishBuiltinPromptsOut(BaseModel):
    generate: str
    edit: str
    video: str


class PromptPolishModeLimitOut(BaseModel):
    max_tokens: int
    max_output_chars: int
    length_multiplier: float | None = None
    compact_original_chars: int | None = None
    compact_output_chars: int | None = None


class PromptPolishModeLimitsOut(BaseModel):
    generate: PromptPolishModeLimitOut
    edit: PromptPolishModeLimitOut
    video: PromptPolishModeLimitOut


class PlatformSettingsOut(BaseModel):
    chat_agent_ui_enabled: bool
    prompt_polish_enabled: bool
    prompt_polish_provider_id: int | None = None
    prompt_polish_system_prompt: str | None = None
    prompt_polish_system_prompts: PromptPolishModePromptsOut | None = None
    prompt_polish_builtin_prompts: PromptPolishBuiltinPromptsOut | None = None
    prompt_polish_mode_limits: PromptPolishModeLimitsOut | None = None
    prompt_polish_default_mode_limits: PromptPolishModeLimitsOut | None = None
    updated_at: datetime | None = None


class PromptPolishModePromptsUpdate(BaseModel):
    generate: str | None = Field(default=None, max_length=12000)
    edit: str | None = Field(default=None, max_length=12000)
    video: str | None = Field(default=None, max_length=12000)


class PromptPolishModeLimitUpdate(BaseModel):
    max_tokens: int | None = Field(default=None, ge=16, le=4096)
    max_output_chars: int | None = Field(default=None, ge=40, le=4000)
    length_multiplier: float | None = Field(default=None, ge=0, le=5)
    compact_original_chars: int | None = Field(default=None, ge=0, le=2000)
    compact_output_chars: int | None = Field(default=None, ge=40, le=4000)


class PromptPolishModeLimitsUpdate(BaseModel):
    generate: PromptPolishModeLimitUpdate | None = None
    edit: PromptPolishModeLimitUpdate | None = None
    video: PromptPolishModeLimitUpdate | None = None


class PlatformSettingsUpdate(BaseModel):
    chat_agent_ui_enabled: bool | None = None
    prompt_polish_enabled: bool | None = None
    prompt_polish_provider_id: int | None = None
    prompt_polish_system_prompt: str | None = Field(default=None, max_length=12000)
    prompt_polish_system_prompts: PromptPolishModePromptsUpdate | None = None
    prompt_polish_mode_limits: PromptPolishModeLimitsUpdate | None = None
    reset_prompt_polish_mode_limits: bool | None = None


def _clean_optional_prompt(value: str | None) -> str | None:
    cleaned = str(value or "").strip()
    return cleaned or None


def _limits_out(config: PromptPolishModeLimits) -> PromptPolishModeLimitOut:
    return PromptPolishModeLimitOut(**mode_limits_to_dict(config))


def _limits_map_out(limits: dict[CreationMode, PromptPolishModeLimits]) -> PromptPolishModeLimitsOut:
    return PromptPolishModeLimitsOut(
        generate=_limits_out(limits["generate"]),
        edit=_limits_out(limits["edit"]),
        video=_limits_out(limits["video"]),
    )


def _serialize_platform_settings(row, *, include_admin_fields: bool) -> PlatformSettingsOut:
    mode_prompts = None
    builtin_prompts = None
    legacy_prompt = None
    mode_limits = None
    default_mode_limits = None
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
        resolved_limits = resolved_prompt_polish_mode_limits(row)
        mode_limits = _limits_map_out(resolved_limits)
        default_mode_limits = _limits_map_out(prompt_polish_default_mode_limits())
    return PlatformSettingsOut(
        chat_agent_ui_enabled=row.chat_agent_ui_enabled,
        prompt_polish_enabled=row.prompt_polish_enabled,
        prompt_polish_provider_id=row.prompt_polish_provider_id if include_admin_fields else None,
        prompt_polish_system_prompt=legacy_prompt,
        prompt_polish_system_prompts=mode_prompts,
        prompt_polish_builtin_prompts=builtin_prompts,
        prompt_polish_mode_limits=mode_limits,
        prompt_polish_default_mode_limits=default_mode_limits,
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


def _apply_prompt_polish_mode_limits_update(row, update: PromptPolishModeLimitsUpdate) -> None:
    current = resolved_prompt_polish_mode_limits(row)
    payload = {mode: mode_limits_to_dict(current[mode]) for mode in ("generate", "edit", "video")}

    for mode in ("generate", "edit", "video"):
        mode_update = getattr(update, mode)
        if mode_update is None:
            continue
        patch = mode_update.model_dump(exclude_unset=True)
        payload[mode].update(patch)

    row.prompt_polish_mode_limits_json = serialize_prompt_polish_mode_limits(
        {
            "generate": PromptPolishModeLimits(**payload["generate"]),
            "edit": PromptPolishModeLimits(**payload["edit"]),
            "video": PromptPolishModeLimits(**payload["video"]),
        }
    )


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
    if update_data.get("reset_prompt_polish_mode_limits"):
        row.prompt_polish_mode_limits_json = None
    elif "prompt_polish_mode_limits" in update_data and update_data["prompt_polish_mode_limits"] is not None:
        _apply_prompt_polish_mode_limits_update(row, PromptPolishModeLimitsUpdate(**update_data["prompt_polish_mode_limits"]))

    row.updated_by_user_id = auth_user.user_id
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return _serialize_platform_settings(row, include_admin_fields=True)
