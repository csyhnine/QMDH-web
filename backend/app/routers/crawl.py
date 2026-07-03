"""Crawl ingest API (crawl-001 C2)."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, require_content_ops_access
from app.core.config import AuthUserProfile
from app.database import SessionLocal, get_db
from app.services.crawl_ingest_service import (
    CrawlDomainNotAllowedError,
    CrawlImportResult,
    import_reference_page_to_inspiration,
    import_reference_pages_batch,
)

router = APIRouter(prefix="/crawl", tags=["crawl"])


class CrawlImportIn(BaseModel):
    url: str = Field(min_length=10, max_length=2000)
    cover_image_url: str = ""
    category: str = "建筑"
    source_name: str = ""


class CrawlImportBatchIn(BaseModel):
    urls: list[str] = Field(min_length=1, max_length=20)


class CrawlImportOut(BaseModel):
    status: str
    source_url: str
    inspiration_post_id: int | None = None
    title: str = ""
    image_path: str = ""
    message: str = ""


class CrawlImportBatchOut(BaseModel):
    accepted: int
    results: list[CrawlImportOut]


def _to_out(result: CrawlImportResult) -> CrawlImportOut:
    return CrawlImportOut(
        status=result.status,
        source_url=result.source_url,
        inspiration_post_id=result.inspiration_post_id,
        title=result.title,
        image_path=result.image_path,
        message=result.message,
    )


@router.post("/import", response_model=CrawlImportOut)
def import_crawl_reference_page(
    payload: CrawlImportIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> CrawlImportOut:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        result = import_reference_page_to_inspiration(
            db,
            url=payload.url,
            user_id=auth_user.user_id,
            cover_image_url=payload.cover_image_url,
            category=payload.category,
            source_name=payload.source_name,
        )
    except CrawlDomainNotAllowedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    if result.status == "failed":
        raise HTTPException(status_code=422, detail=result.message or "Import failed")
    return _to_out(result)


def _run_batch_import(urls: list[str], user_id: int) -> None:
    with SessionLocal() as db:
        import_reference_pages_batch(db, urls=urls, user_id=user_id)


@router.post("/import-batch", response_model=CrawlImportBatchOut, status_code=202)
def import_crawl_reference_pages_batch(
    payload: CrawlImportBatchIn,
    background_tasks: BackgroundTasks,
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> CrawlImportBatchOut:
    require_content_ops_access(auth_user)
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    cleaned_urls = [item.strip() for item in payload.urls if item.strip()]
    if not cleaned_urls:
        raise HTTPException(status_code=400, detail="At least one URL is required")

    background_tasks.add_task(_run_batch_import, cleaned_urls, auth_user.user_id)
    return CrawlImportBatchOut(
        accepted=len(cleaned_urls),
        results=[
            CrawlImportOut(
                status="queued",
                source_url=url,
                message="已加入后台批量入库队列",
            )
            for url in cleaned_urls
        ],
    )
