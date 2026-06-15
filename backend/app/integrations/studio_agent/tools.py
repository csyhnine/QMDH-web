"""Shared Studio agent tools used by PydanticAI and MCP."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.search.service import search_domain
from app.models import ProviderProfile, Workflow


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
