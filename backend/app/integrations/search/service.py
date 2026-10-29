from __future__ import annotations

from dataclasses import dataclass
import math
import re

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import InspirationPost, PromptTemplate, SearchIndexDomain, SearchIndexIntent
from app.services.search_index_outbox_service import _session, build_index_document, lock_domain, target_hash


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
    return meilisearch.Client(settings.meilisearch_url, settings.meilisearch_api_key or None, timeout=3)


def _index_state(db: Session, domain: str, *, state=None):
    state = state if state is not None else db.get(SearchIndexDomain, domain)
    if (state is None or not state.ready or not state.active_index or state.uncertain
            or state.task_uid is not None or state.submission_token is not None
            or state.active_target_hash != target_hash(state.active_index)):
        return None
    pending = db.scalar(select(SearchIndexIntent.entity_id).where(
        SearchIndexIntent.domain == domain, SearchIndexIntent.applied_revision < SearchIndexIntent.revision,
    ).limit(1))
    if pending is not None:
        return None
    return state.revision, state.active_index, state.active_target_hash


def _meili_hits(bind, domain: str, query: str, *, limit: int) -> list[SearchHit] | None:
    if not settings.meilisearch_enabled:
        return None
    try:
        with _session(bind) as db:
            snapshot = _index_state(db, domain)
        if snapshot is None:
            return None
        client = _meili_client()
        if client is None:
            return None
        result = client.index(snapshot[1]).search(query, {"limit": limit})
        items = result.get("hits")
        if not isinstance(items, list) or len(items) > limit:
            return None
        ids = []
        for item in items:
            ident = item.get("id")
            if isinstance(ident, str) and re.fullmatch(r"-?\d+", ident):
                ident = int(ident)
            if type(ident) is not int or ident in ids:
                return None
            ids.append(ident)
        # A short domain lock fences mutations during the source validation.
        with _session(bind) as db:
            state = lock_domain(db, domain)
            if _index_state(db, domain, state=state) != snapshot:
                return None
            model = InspirationPost if domain == "inspiration" else PromptTemplate
            rows = {row.id: row for row in db.scalars(select(model).where(model.id.in_(ids)))}
            hits = []
            for ident, item in zip(ids, items):
                row = rows.get(ident)
                if row is None or (domain == "templates" and row.scope != "shared"):
                    return None
                document = build_index_document(domain, row)
                if item.get("_qmdh_fingerprint") != document["_qmdh_fingerprint"]:
                    return None
                try:
                    score = float(item.get("_rankingScore", 0.0))
                except (ValueError, TypeError, OverflowError):
                    score = 0.0
                if not math.isfinite(score):
                    score = 0.0
                hits.append(SearchHit(id=ident, domain=domain, title=document["title"],
                    snippet=document["snippet"], category=document["category"],
                    tags=tuple(document["tags"]), score=score))
            return hits
    except Exception:
        return None


def search_domain(db: Session, *, domain: str, query: str, limit: int = 20) -> list[SearchHit]:
    cleaned = query.strip()
    if not cleaned or domain not in {"inspiration", "templates"}:
        return []
    limit = max(1, min(limit, 50))
    bind = db.get_bind()
    meili = _meili_hits(bind, domain, cleaned, limit=limit)
    if meili is not None:
        return meili
    # Search reads committed facts without flushing or mutating the caller.
    with _session(bind) as reader:
        sql_hits = _sql_inspiration_hits if domain == "inspiration" else _sql_template_hits
        return sql_hits(reader, cleaned, limit=limit)


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
