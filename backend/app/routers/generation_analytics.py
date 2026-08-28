from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, require_ops_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.services.generation_analytics_dashboard_service import (
    get_generation_analytics_overview,
    get_template_quality_scores,
    list_generation_sessions,
)
from app.services.generation_intent_service import backfill_generation_intents
from app.services.generation_session_service import recompute_all_generation_sessions

router = APIRouter(prefix="/admin/generation-analytics", tags=["generation-analytics"])


class BackfillIntentsIn(BaseModel):
    limit: int = Field(default=1000, ge=1, le=10000)


class AnalyticsJobOut(BaseModel):
    ok: bool
    result: dict[str, int]


class GenerationAnalyticsOverviewOut(BaseModel):
    window_days: int
    intent_count: int
    session_count: int
    template_intent_count: int
    settled_intent_count: int
    avg_gacha_score: float
    avg_explore_score: float
    avg_settle_score: float
    high_gacha_sessions: int
    high_explore_sessions: int
    settled_sessions: int
    outcome_totals: dict[str, int]
    download_event_count: int
    downloaded_intent_count: int
    download_rate: float
    download_only_settled_count: int
    download_settle_share: float
    polish_event_count: int
    polish_unique_users: int
    polish_studio_count: int
    polish_canvas_count: int
    polished_intent_count: int
    polish_adoption_rate: float
    polish_settle_rate: float


class GenerationSessionRowOut(BaseModel):
    id: int
    user_name: str
    submit_count: int
    prompt_variant_count: int
    gacha_score: float
    explore_score: float
    settle_score: float
    settle_count: int
    completed_count: int
    failed_count: int
    dominant_template_id: int | None
    dominant_template_label: str
    outcome_totals: dict[str, int]
    session_started_at: datetime | None
    session_ended_at: datetime | None


class GenerationSessionListOut(BaseModel):
    total: int
    items: list[GenerationSessionRowOut]


class TemplateQualityRowOut(BaseModel):
    template_id: int
    label: str
    title: str
    category: str
    intent_count: int
    session_count: int
    settled_intent_count: int
    avg_gacha_score: float
    avg_explore_score: float
    avg_settle_score: float
    completion_rate: float
    quality_score: float
    outcome_totals: dict[str, int]


class TemplateQualityListOut(BaseModel):
    window_days: int
    items: list[TemplateQualityRowOut]


@router.get("/overview", response_model=GenerationAnalyticsOverviewOut)
def analytics_overview(
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> GenerationAnalyticsOverviewOut:
    require_ops_access(auth_user)
    return GenerationAnalyticsOverviewOut(**get_generation_analytics_overview(db, days=days))


@router.get("/sessions", response_model=GenerationSessionListOut)
def analytics_sessions(
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> GenerationSessionListOut:
    require_ops_access(auth_user)
    payload = list_generation_sessions(db, days=days, limit=limit, offset=offset)
    return GenerationSessionListOut(
        total=payload["total"],
        items=[GenerationSessionRowOut(**item) for item in payload["items"]],
    )


@router.get("/template-quality", response_model=TemplateQualityListOut)
def analytics_template_quality(
    days: int = Query(default=30, ge=1, le=365),
    min_intents: int = Query(default=1, ge=1, le=100),
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> TemplateQualityListOut:
    require_ops_access(auth_user)
    payload = get_template_quality_scores(db, days=days, min_intents=min_intents)
    return TemplateQualityListOut(
        window_days=payload["window_days"],
        items=[TemplateQualityRowOut(**item) for item in payload["items"]],
    )


@router.post("/backfill-intents", response_model=AnalyticsJobOut)
def backfill_intents(
    payload: BackfillIntentsIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> AnalyticsJobOut:
    require_ops_access(auth_user)
    result = backfill_generation_intents(db, limit=payload.limit)
    db.commit()
    return AnalyticsJobOut(ok=True, result=result)


@router.post("/recompute-sessions", response_model=AnalyticsJobOut)
def recompute_sessions(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> AnalyticsJobOut:
    require_ops_access(auth_user)
    result = recompute_all_generation_sessions(db)
    db.commit()
    return AnalyticsJobOut(ok=True, result=result)
