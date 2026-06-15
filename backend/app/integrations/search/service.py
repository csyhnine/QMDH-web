from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import InspirationPost, PromptTemplate


@dataclass(frozen=True)
class SearchHit:
    id: int
    domain: str
    title: str
    snippet: str
    category: str = ""
    tags: tuple[str, ...] = ()
    score: float = 0.0


def _sql_inspiration_hits(db: Session, query: str, *, limit: int) -> list[SearchHit]:
    pattern = f"%{query}%"
    posts = db.scalars(
        select(InspirationPost)
        .where(
            or_(
                InspirationPost.title.ilike(pattern),
                InspirationPost.description.ilike(pattern),
                InspirationPost.category.ilike(pattern),
                InspirationPost.source_name.ilike(pattern),
                InspirationPost.prompt_text.ilike(pattern),
            )
        )
        .order_by(InspirationPost.created_at.desc())
        .limit(limit)
    ).all()
    hits: list[SearchHit] = []
    for post in posts:
        snippet = (post.description or post.prompt_text or post.source_name or "").strip()
        hits.append(
            SearchHit(
                id=post.id,
                domain="inspiration",
                title=post.title,
                snippet=snippet[:240],
                category=post.category or "",
                tags=tuple(post.tags or []),
                score=1.0,
            )
        )
    return hits


def _sql_template_hits(db: Session, query: str, *, limit: int) -> list[SearchHit]:
    pattern = f"%{query}%"
    templates = db.scalars(
        select(PromptTemplate)
        .where(
            PromptTemplate.scope == "shared",
            or_(
                PromptTemplate.title.ilike(pattern),
                PromptTemplate.prompt.ilike(pattern),
                PromptTemplate.category.ilike(pattern),
                PromptTemplate.subcategory.ilike(pattern),
            ),
        )
        .order_by(PromptTemplate.updated_at.desc())
        .limit(limit)
    ).all()
    hits: list[SearchHit] = []
    for template in templates:
        hits.append(
            SearchHit(
                id=template.id,
                domain="templates",
                title=template.title,
                snippet=(template.prompt or "")[:240],
                category=template.category or "",
                tags=(template.subcategory,) if template.subcategory else (),
                score=1.0,
            )
        )
    return hits


def _meili_client():
    if not settings.meilisearch_enabled:
        return None
    try:
        import meilisearch
    except ImportError:
        return None
    return meilisearch.Client(settings.meilisearch_url, settings.meilisearch_api_key or None)


def _meili_hits(index_name: str, domain: str, query: str, *, limit: int) -> list[SearchHit] | None:
    client = _meili_client()
    if client is None:
        return None
    try:
        index = client.index(index_name)
        result = index.search(query, {"limit": limit})
    except Exception:
        return None

    hits: list[SearchHit] = []
    for item in result.get("hits") or []:
        hits.append(
            SearchHit(
                id=int(item.get("id") or 0),
                domain=domain,
                title=str(item.get("title") or ""),
                snippet=str(item.get("snippet") or item.get("description") or item.get("prompt") or "")[:240],
                category=str(item.get("category") or ""),
                tags=tuple(item.get("tags") or ()),
                score=float(item.get("_rankingScore") or 0.0),
            )
        )
    return hits


def search_domain(db: Session, *, domain: str, query: str, limit: int = 20) -> list[SearchHit]:
    cleaned = query.strip()
    if not cleaned:
        return []

    limit = max(1, min(limit, 50))
    if domain == "inspiration":
        meili = _meili_hits(settings.meilisearch_inspiration_index, "inspiration", cleaned, limit=limit)
        return meili if meili is not None else _sql_inspiration_hits(db, cleaned, limit=limit)
    if domain == "templates":
        meili = _meili_hits(settings.meilisearch_templates_index, "templates", cleaned, limit=limit)
        return meili if meili is not None else _sql_template_hits(db, cleaned, limit=limit)
    return []


def get_search_engine_name() -> str:
    return "meilisearch" if settings.meilisearch_enabled else "postgres"


def check_meilisearch_health() -> tuple[bool, str]:
    if not settings.meilisearch_enabled:
        return False, "disabled"
    client = _meili_client()
    if client is None:
        return False, "client_unavailable"
    try:
        health = client.health()
        status = str(health.get("status") or "")
        return status == "available", status or "unknown"
    except Exception as exc:
        return False, str(exc)[:120]
