from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.audit import AuditEventType, write_audit_log
from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile
from app.database import get_db
from app.services.prompt_polish_service import PromptPolishUnavailableError, polish_prompt

router = APIRouter(prefix="/studio", tags=["studio"])


class PromptPolishIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    creation_mode: Literal["generate", "edit", "video"] = "generate"
    reference_images: list[str] = Field(default_factory=list, max_length=8)
    source_surface: Literal["studio", "canvas"] = "studio"


class PromptPolishOut(BaseModel):
    polished_prompt: str
    provider_name: str
    model_name: str


@router.post("/prompt-polish", response_model=PromptPolishOut)
def polish_user_prompt(
    payload: PromptPolishIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> PromptPolishOut:
    try:
        result = polish_prompt(
            db,
            prompt=payload.prompt,
            creation_mode=payload.creation_mode,
            reference_images=payload.reference_images,
        )
    except PromptPolishUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=f"参考图无法用于润色：{exc}") from exc

    write_audit_log(
        db,
        event_type=AuditEventType.STUDIO_PROMPT_POLISH,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="studio_prompt",
        provider_name=result.provider_name,
        details={
            "model_name": result.model_name,
            "creation_mode": payload.creation_mode,
            "source_surface": payload.source_surface,
            "reference_image_count": len(payload.reference_images),
            "prompt_preview": payload.prompt[:120],
            "polished_preview": result.polished_prompt[:240],
        },
    )
    db.commit()

    return PromptPolishOut(
        polished_prompt=result.polished_prompt,
        provider_name=result.provider_name,
        model_name=result.model_name,
    )
