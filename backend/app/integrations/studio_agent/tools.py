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
    policy: object | None = None


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


def format_enabled_generation_models_note(ctx: StudioToolContext) -> str:
    """Inject into Chat agent turns so create_* tools need not call list_enabled_image_providers."""
    providers = list_enabled_image_providers(ctx)
    if not providers:
        return "当前可用生图/视频模型：无（请引导用户检查模型管理或前往 Studio）。"
    lines = [
        "当前可用生图/视频模型（创建任务时 requested_provider 必须用 provider_name）：",
    ]
    for item in providers:
        caps = ", ".join(str(cap) for cap in (item.get("capabilities") or []))
        lines.append(
            f"- provider_name=`{item.get('provider_name')}` "
            f"display=`{item.get('display_name')}` "
            f"model=`{item.get('model_name')}` "
            f"caps=[{caps}]"
        )
    return "\n".join(lines)


def read_skill_resource(ctx: StudioToolContext, skill_key: str, relative_path: str) -> dict[str, object]:
    from app.services.agent_skill_install_service import read_enabled_skill_resource

    return read_enabled_skill_resource(ctx.db, skill_key=skill_key, relative_path=relative_path)


def memory_recall(ctx: StudioToolContext, query: str = "", limit: int = 5) -> dict[str, object]:
    from app.services.agent_memory_service import tool_memory_recall

    return tool_memory_recall(ctx.db, user_id=ctx.user_id, query=query, limit=limit)


def memory_store(ctx: StudioToolContext, content: str = "", memory_type: str = "fact") -> dict[str, object]:
    from app.services.agent_memory_service import tool_memory_store

    return tool_memory_store(ctx.db, user_id=ctx.user_id, content=content, memory_type=memory_type)


def memory_forget(ctx: StudioToolContext, memory_id: int = 0) -> dict[str, object]:
    from app.services.agent_memory_service import tool_memory_forget

    return tool_memory_forget(ctx.db, user_id=ctx.user_id, memory_id=int(memory_id or 0))
