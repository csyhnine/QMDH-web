from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.audit import AuditEventType, write_audit_log
from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile
from app.database import get_db
from app.integrations.studio_agent.agent import StudioAgentReply, StudioAgentUnavailableError, run_studio_agent

router = APIRouter(prefix="/studio-agent", tags=["studio-agent"])


class StudioAgentAssistIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    provider_id: int | None = None


class StudioAgentAssistOut(BaseModel):
    reply: str
    provider_name: str
    model_name: str


@router.post(
    "/assist",
    response_model=StudioAgentAssistOut,
    deprecated=True,
    summary="Studio 浮动助手（已废弃）",
    description=(
        "Deprecated since Chat B1: use `POST /api/v1/chat/conversations/{id}/messages` with "
        "`agent_mode: true` instead. Kept for OpenClaw/skills and legacy MCP clients."
    ),
)
def assist(
    payload: StudioAgentAssistIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> StudioAgentAssistOut:
    try:
        result: StudioAgentReply = run_studio_agent(
            db,
            message=payload.message,
            user_name=auth_user.name,
            user_id=auth_user.user_id,
            provider_id=payload.provider_id,
        )
    except StudioAgentUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    write_audit_log(
        db,
        event_type=AuditEventType.STUDIO_AGENT_ASSIST,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="studio_agent",
        provider_name=result.provider_name,
        details={
            "model_name": result.model_name,
            "message_preview": payload.message[:120],
            "reply_preview": result.text[:240],
        },
    )
    db.commit()

    return StudioAgentAssistOut(
        reply=result.text,
        provider_name=result.provider_name,
        model_name=result.model_name,
    )
