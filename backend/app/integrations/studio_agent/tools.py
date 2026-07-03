"""Shared Studio agent tools used by PydanticAI and MCP."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.search.service import search_domain
from app.models import ProviderProfile, Workflow
from app.services.reference_page_service import ReferencePageError, extract_reference_page
from app.services.crawl_ingest_service import CrawlDomainNotAllowedError, import_reference_page_to_inspiration
from app.services.ref_intent_service import match_reference_intent as _match_reference_intent


@dataclass(frozen=True)
class StudioToolContext:
    db: Session
    user_name: str
    user_id: int | None = None


def search_inspiration_posts(ctx: StudioToolContext, query: str, limit: int = 8) -> list[dict[str, object]]:
    hits = search_domain(ctx.db, domain="inspiration", query=query, limit=limit)
    return [
        {
            "id": hit.id,
            "title": hit.title,
            "category": hit.category,
            "tags": list(hit.tags),
            "snippet": hit.snippet,
        }
        for hit in hits
    ]


def search_shared_templates(ctx: StudioToolContext, query: str, limit: int = 8) -> list[dict[str, object]]:
    hits = search_domain(ctx.db, domain="templates", query=query, limit=limit)
    return [
        {
            "id": hit.id,
            "title": hit.title,
            "category": hit.category,
            "subcategory": hit.tags[0] if hit.tags else "",
            "snippet": hit.snippet,
        }
        for hit in hits
    ]


def list_enabled_image_providers(ctx: StudioToolContext) -> list[dict[str, object]]:
    profiles = ctx.db.scalars(
        select(ProviderProfile).where(ProviderProfile.enabled == True).order_by(ProviderProfile.provider_name.asc())  # noqa: E712
    ).all()
    rows: list[dict[str, object]] = []
    for profile in profiles:
        capabilities = list(profile.capabilities or [])
        if not any(capability.startswith("image.") or capability == "video.generate" for capability in capabilities):
            continue
        rows.append(
            {
                "provider_name": profile.provider_name,
                "display_name": (profile.display_name or profile.model_name or profile.provider_name).strip(),
                "model_name": profile.model_name,
                "capabilities": capabilities,
            }
        )
    return rows


def list_active_workflows(ctx: StudioToolContext) -> list[dict[str, object]]:
    workflows = ctx.db.scalars(select(Workflow).order_by(Workflow.key.asc())).all()
    return [
        {
            "key": workflow.key,
            "name": workflow.name,
            "category": workflow.category,
            "provider_capability": workflow.provider_capability,
        }
        for workflow in workflows
    ]


def summarize_generation_stack(ctx: StudioToolContext) -> dict[str, object]:
    return {
        "user": ctx.user_name,
        "providers": list_enabled_image_providers(ctx),
        "workflows": list_active_workflows(ctx),
        "notes": [
            "Long-running image/video jobs are created as persisted tasks and executed by the worker queue.",
            "Use workflow_key + provider_name when describing generation actions to humans or downstream tools.",
        ],
    }


def fetch_reference_page(ctx: StudioToolContext, url: str, limit: int = 8) -> dict[str, object]:
    try:
        extracted = extract_reference_page(url, image_limit=max(1, min(limit, 20)))
    except ReferencePageError as exc:
        return {"ok": False, "error": str(exc), "tool": "fetch_reference_page"}
    images = list(extracted.images[: max(1, min(limit, 20))])
    return {
        "ok": True,
        "tool": "fetch_reference_page",
        "source_url": extracted.source_url,
        "title": extracted.title,
        "images": images,
        "image_count": len(images),
    }


def match_reference_intent(
    ctx: StudioToolContext,
    description: str = "",
    reference_image: str = "",
    limit: int = 12,
) -> dict[str, object]:
    result = _match_reference_intent(
        ctx.db,
        description=description,
        reference_image=reference_image,
        limit=limit,
    )
    if not result.hits:
        return {
            "ok": False,
            "tool": "match_reference_intent",
            "query_used": result.query_used,
            "reference_image": result.reference_image,
            "error": result.empty_reason or "未找到匹配结果",
            "hits": [],
        }
    return {
        "ok": True,
        "tool": "match_reference_intent",
        "query_used": result.query_used,
        "reference_image": result.reference_image,
        "hits": [
            {
                "domain": hit.domain,
                "id": hit.id,
                "title": hit.title,
                "snippet": hit.snippet,
                "category": hit.category,
                "tags": list(hit.tags),
                "score": hit.score,
                "match_reason": hit.match_reason,
            }
            for hit in result.hits
        ],
    }


def import_reference_page(
    ctx: StudioToolContext,
    url: str,
    cover_image_url: str = "",
    category: str = "建筑",
) -> dict[str, object]:
    try:
        result = import_reference_page_to_inspiration(
            ctx.db,
            url=url,
            user_id=ctx.user_id,
            cover_image_url=cover_image_url,
            category=category,
        )
    except CrawlDomainNotAllowedError as exc:
        return {"ok": False, "tool": "import_reference_page", "error": str(exc)}
    payload = {
        "ok": result.status in {"created", "duplicate"},
        "tool": "import_reference_page",
        "status": result.status,
        "source_url": result.source_url,
        "inspiration_post_id": result.inspiration_post_id,
        "title": result.title,
        "message": result.message,
    }
    if result.status == "failed":
        payload["error"] = result.message
        payload["ok"] = False
    return payload
