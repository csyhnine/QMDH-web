from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, require_ops_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.services.chat_telemetry_alert_service import (
    evaluate_chat_telemetry_alerts,
    list_chat_telemetry_alerts,
)
from app.services.chat_telemetry_dashboard_service import (
    get_chat_experience_overview,
    list_chat_turns,
)

router = APIRouter(prefix="/admin/chat-experience", tags=["chat-experience"])


class ChatExperienceOverviewOut(BaseModel):
    window_days: int
    window_started_at: datetime
    turn_count: int
    success_rate: float
    upstream_call_rate: float
    attachment_turn_count: int
    attachment_turn_share: float
    agent_mode_share: float
    avg_pack_duration_ms: int
    p95_pack_duration_ms: int
    avg_ttft_ms: int
    p95_ttft_ms: int
    avg_total_duration_ms: int
    outcome_totals: dict[str, int]
    client_event_totals: dict[str, int]


class ChatExperienceTurnRowOut(BaseModel):
    id: int
    correlation_id: str
    conversation_id: int
    user_name: str
    user_display_name: str
    provider_name: str
    model_name: str
    agent_mode: bool
    outcome: str
    error_code: str
    error_summary: str
    attachment_count: int
    attachment_total_bytes: int
    pack_duration_ms: int
    upstream_called: bool
    ttft_ms: int
    total_duration_ms: int
    client_event_count: int
    started_at: datetime


class ChatExperienceTurnListOut(BaseModel):
    total: int
    items: list[ChatExperienceTurnRowOut]


class ChatTelemetryAlertOut(BaseModel):
    id: int
    alert_key: str
    severity: str
    title: str
    message: str
    status: str
    window_hours: int
    metrics: dict[str, object] = Field(default_factory=dict)
    occurrence_count: int
    first_seen_at: datetime
    last_seen_at: datetime
    resolved_at: datetime | None = None


class ChatTelemetryAlertListOut(BaseModel):
    items: list[ChatTelemetryAlertOut]


class ChatTelemetryAlertEvaluateOut(BaseModel):
    window_hours: int
    metrics: dict[str, object]
    triggered_keys: list[str]
    created: int
    updated: int
    resolved: int


@router.get("/overview", response_model=ChatExperienceOverviewOut)
def chat_experience_overview(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ChatExperienceOverviewOut:
    require_ops_access(auth_user)
    return ChatExperienceOverviewOut(**get_chat_experience_overview(db, days=days))


@router.get("/turns", response_model=ChatExperienceTurnListOut)
def chat_experience_turns(
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ChatExperienceTurnListOut:
    require_ops_access(auth_user)
    payload = list_chat_turns(db, days=days, limit=limit, offset=offset)
    return ChatExperienceTurnListOut(
        total=payload["total"],
        items=[ChatExperienceTurnRowOut(**item) for item in payload["items"]],
    )


@router.get("/alerts", response_model=ChatTelemetryAlertListOut)
def chat_experience_alerts(
    status: str = Query(default="open"),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ChatTelemetryAlertListOut:
    require_ops_access(auth_user)
    items = list_chat_telemetry_alerts(db, status=status, limit=limit)
    return ChatTelemetryAlertListOut(items=[ChatTelemetryAlertOut(**item) for item in items])


@router.post("/alerts/evaluate", response_model=ChatTelemetryAlertEvaluateOut)
def chat_experience_evaluate_alerts(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ChatTelemetryAlertEvaluateOut:
    require_ops_access(auth_user)
    payload = evaluate_chat_telemetry_alerts(db)
    return ChatTelemetryAlertEvaluateOut(**payload)
