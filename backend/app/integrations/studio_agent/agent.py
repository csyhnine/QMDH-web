"""PydanticAI-powered Studio assistant."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.encryption import EncryptedValueDecodeError, EncryptionKeyUnavailableError, decrypt_value_or_raise
from app.integrations.studio_agent.tools import (
    StudioToolContext,
    list_active_workflows as _list_active_workflows,
    list_enabled_image_providers as _list_enabled_image_providers,
    search_inspiration_posts as _search_inspiration_posts,
    search_shared_templates as _search_shared_templates,
    summarize_generation_stack as _summarize_generation_stack,
)
from app.models import ProviderProfile

try:
    from pydantic_ai import Agent, RunContext
    from pydantic_ai.providers.openai import OpenAIProvider

    try:
        from pydantic_ai.models.openai import OpenAIChatModel as OpenAICompatibleModel
    except ImportError:
        from pydantic_ai.models.openai import OpenAIModel as OpenAICompatibleModel

    _PYDANTIC_AI_AVAILABLE = True
except ImportError:
    _PYDANTIC_AI_AVAILABLE = False


class StudioAgentUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class StudioAgentReply:
    text: str
    provider_name: str
    model_name: str


def _resolve_provider(db: Session, provider_id: int | None) -> ProviderProfile:
    if provider_id is not None:
        provider = db.get(ProviderProfile, provider_id)
        if provider and provider.enabled and "chat.completions" in (provider.capabilities or []):
            return provider

    provider = db.scalars(
        select(ProviderProfile)
        .where(ProviderProfile.enabled == True)  # noqa: E712
        .order_by(ProviderProfile.id.asc())
    ).first()
    if provider is None or "chat.completions" not in (provider.capabilities or []):
        raise StudioAgentUnavailableError("No enabled chat provider is available for Studio agent.")
    return provider


def _provider_api_key(profile: ProviderProfile) -> str:
    try:
        return decrypt_value_or_raise(profile.api_key)
    except (EncryptionKeyUnavailableError, EncryptedValueDecodeError) as exc:
        raise StudioAgentUnavailableError("Chat provider API key is unavailable.") from exc


def run_studio_agent(
    db: Session,
    *,
    message: str,
    user_name: str,
    user_id: int | None,
    provider_id: int | None = None,
) -> StudioAgentReply:
    if not _PYDANTIC_AI_AVAILABLE:
        raise StudioAgentUnavailableError("pydantic-ai is not installed.")

    provider = _resolve_provider(db, provider_id)
    api_key = _provider_api_key(provider)

    model = OpenAICompatibleModel(
        provider.model_name,
        provider=OpenAIProvider(base_url=provider.base_url.rstrip("/"), api_key=api_key),
    )
    agent = Agent(
        model,
        deps_type=StudioToolContext,
        system_prompt=(
            "You are the QMDH Studio assistant. Help designers discover inspiration posts, "
            "shared prompt templates, enabled image/video providers, and workflow keys. "
            "When users ask to generate media, explain which workflow/provider fits and remind them "
            "that actual generation is submitted as a persisted async task in the Studio composer."
        ),
    )

    @agent.tool
    def search_inspiration_posts(ctx: RunContext[StudioToolContext], query: str, limit: int = 8) -> list[dict[str, object]]:
        return _search_inspiration_posts(ctx.deps, query, limit=limit)

    @agent.tool
    def search_shared_templates(ctx: RunContext[StudioToolContext], query: str, limit: int = 8) -> list[dict[str, object]]:
        return _search_shared_templates(ctx.deps, query, limit=limit)

    @agent.tool
    def list_enabled_image_providers(ctx: RunContext[StudioToolContext]) -> list[dict[str, object]]:
        return _list_enabled_image_providers(ctx.deps)

    @agent.tool
    def list_active_workflows(ctx: RunContext[StudioToolContext]) -> list[dict[str, object]]:
        return _list_active_workflows(ctx.deps)

    @agent.tool
    def summarize_generation_stack(ctx: RunContext[StudioToolContext]) -> dict[str, object]:
        return _summarize_generation_stack(ctx.deps)

    tool_ctx = StudioToolContext(db=db, user_name=user_name, user_id=user_id)
    result = agent.run_sync(message.strip(), deps=tool_ctx)
    return StudioAgentReply(
        text=str(result.output).strip(),
        provider_name=provider.provider_name,
        model_name=provider.model_name,
    )
