from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, require_backoffice_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.integrations.search.service import check_meilisearch_health, get_search_engine_name, search_domain
from app.integrations.search.sync import sync_inspiration_index, sync_templates_index

router = APIRouter(prefix="/search", tags=["search"])


class SearchHitOut(BaseModel):
    id: int
    domain: str
    title: str
    snippet: str
    category: str = ""
    tags: list[str] = Field(default_factory=list)
    score: float = 0.0


class SearchResponseOut(BaseModel):
    domain: str
    query: str
    hits: list[SearchHitOut]
    engine: str


class SearchSyncOut(BaseModel):
    inspiration_documents: int
    template_documents: int
    engine: str


class SearchStatusOut(BaseModel):
    meilisearch_enabled: bool
    meilisearch_reachable: bool
    meilisearch_status: str
    engine: str
    inspiration_index: str
    templates_index: str


@router.get("/status", response_model=SearchStatusOut)
def search_status(
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> SearchStatusOut:
    del auth_user
    from app.core.config import settings

    reachable, status = check_meilisearch_health()
    return SearchStatusOut(
        meilisearch_enabled=settings.meilisearch_enabled,
        meilisearch_reachable=reachable,
        meilisearch_status=status,
        engine=get_search_engine_name(),
        inspiration_index=settings.meilisearch_inspiration_index,
        templates_index=settings.meilisearch_templates_index,
    )


@router.get("", response_model=SearchResponseOut)
def search(
    q: str = Query(min_length=1, max_length=200),
    domain: str = Query(default="inspiration", pattern="^(inspiration|templates)$"),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> SearchResponseOut:
    del auth_user
    hits = search_domain(db, domain=domain, query=q, limit=limit)

    return SearchResponseOut(
        domain=domain,
        query=q.strip(),
        engine=get_search_engine_name(),
        hits=[
            SearchHitOut(
                id=hit.id,
                domain=hit.domain,
                title=hit.title,
                snippet=hit.snippet,
                category=hit.category,
                tags=list(hit.tags),
                score=hit.score,
            )
            for hit in hits
        ],
    )


@router.post("/sync", response_model=SearchSyncOut)
def sync_search_indexes(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> SearchSyncOut:
    require_backoffice_access(auth_user)
    from app.core.config import settings

    if not settings.meilisearch_enabled:
        raise HTTPException(status_code=400, detail="Meilisearch is disabled. Set QMDH_MEILISEARCH_ENABLED=true first.")
    return SearchSyncOut(
        inspiration_documents=sync_inspiration_index(db),
        template_documents=sync_templates_index(db),
        engine="meilisearch",
    )
