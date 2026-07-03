"""PydanticAI-powered Studio / Chat assistant."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

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
    fetch_reference_page as _fetch_reference_page,
    import_reference_page as _import_reference_page,
    match_reference_intent as _match_reference_intent,
)
from app.models import ProviderProfile
from app.services.agent_persona_service import (
    AssignedAgentPersona,
    build_persona_system_prompt,
    resolve_persona_allowlist,
)
from app.services.agent_policy_service import (
    CHAT_AGENT_BASELINE_PROMPT,
    EffectiveChatPolicy,
    chat_tool_catalog_map,
    resolve_effective_chat_policy,
)
from app.services.chat_agent_task_service import build_image_edit_proposal, build_image_generate_proposal

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
    Agent = None  # type: ignore[misc, assignment]
    RunContext = None  # type: ignore[misc, assignment]
    OpenAIProvider = None  # type: ignore[misc, assignment]
    OpenAICompatibleModel = None  # type: ignore[misc, assignment]


class StudioAgentUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class ChatAgentToolCall:
    name: str
    summary: str


@dataclass(frozen=True)
class ChatAgentThinkingStep:
    key: str
    label: str
    detail: str = ""
    status: str = "running"
    agent_key: str = ""
    agent_label: str = ""

    def to_dict(self) -> dict[str, str]:
        payload = {
            "key": self.key,
            "label": self.label,
            "detail": self.detail,
            "status": self.status,
        }
        if self.agent_key:
            payload["agent_key"] = self.agent_key
        if self.agent_label:
            payload["agent_label"] = self.agent_label
        return payload


@dataclass(frozen=True)
class StudioAgentReply:
    text: str
    provider_name: str
    model_name: str
    tool_calls: tuple[ChatAgentToolCall, ...] = ()
    task_proposals: tuple[dict[str, object], ...] = ()
    policy_version: str = "code-default"


# Backwards-compatible alias for tests and imports.
CHAT_AGENT_SYSTEM_PROMPT = CHAT_AGENT_BASELINE_PROMPT


def _summarize_tool_result(name: str, result: object) -> str:
    if isinstance(result, list):
        count = len(result)
        if name == "search_inspiration_posts":
            return f"找到 {count} 条灵感"
        if name == "search_shared_templates":
            return f"找到 {count} 个共享模板"
        if name == "list_enabled_image_providers":
            return f"列出 {count} 个可用模型"
        if name == "list_active_workflows":
            return f"列出 {count} 个工作流"
        return f"返回 {count} 条结果"
    if isinstance(result, dict):
        if result.get("error"):
            return str(result.get("error") or "工具调用失败")
        if name == "summarize_generation_stack":
            providers = result.get("providers") or result.get("enabled_image_providers")
            workflows = result.get("workflows")
            provider_count = len(providers) if isinstance(providers, list) else 0
            workflow_count = len(workflows) if isinstance(workflows, list) else 0
            return f"汇总 {provider_count} 个模型与 {workflow_count} 个工作流"
        if name == "fetch_reference_page":
            count = int(result.get("image_count") or 0)
            title = str(result.get("title") or "").strip()
            return f"提取 {count} 张候选图" + (f"（{title[:24]}）" if title else "")
        if name == "match_reference_intent":
            hits = result.get("hits")
            count = len(hits) if isinstance(hits, list) else 0
            return f"匹配 {count} 条意向图/模板"
        if name == "import_reference_page":
            status = str(result.get("status") or "")
            if status == "duplicate":
                return "该链接已入库，跳过重复导入"
            if status == "created":
                return str(result.get("message") or "外网参考已入库")
            return str(result.get("error") or result.get("message") or "入库失败")
        if name == "propose_image_generate_task":
            return str(result.get("summary") or "已生成待确认生图任务")
        if name == "propose_image_edit_task":
            return str(result.get("summary") or "已生成待确认改图任务")
        return "返回结构化摘要"
    return "已完成"


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


def _tool_label(name: str) -> str:
    item = chat_tool_catalog_map().get(name)
    if item:
        return str(item.get("label") or name)
    return name


def _emit_thinking_step(
    callback: Callable[[ChatAgentThinkingStep], None] | None,
    *,
    key: str,
    label: str,
    detail: str,
    status: str,
    agent_key: str = "",
    agent_label: str = "",
) -> None:
    if callback is not None:
        callback(
            ChatAgentThinkingStep(
                key=key,
                label=label,
                detail=detail,
                status=status,
                agent_key=agent_key,
                agent_label=agent_label,
            )
        )


def _wrap_tool(
    fn: Callable[..., Any],
    name: str,
    recorder: list[ChatAgentToolCall],
    proposal_recorder: list[dict[str, object]] | None = None,
    thinking_callback: Callable[[ChatAgentThinkingStep], None] | None = None,
) -> Callable[..., Any]:
    tool_label = _tool_label(name)

    def wrapped(*args: Any, **kwargs: Any) -> Any:
        _emit_thinking_step(
            thinking_callback,
            key=name,
            label=tool_label,
            detail="正在调用…",
            status="running",
        )
        try:
            result = fn(*args, **kwargs)
        except Exception as exc:
            summary = f"失败：{exc}"
            recorder.append(ChatAgentToolCall(name=name, summary=summary))
            _emit_thinking_step(
                thinking_callback,
                key=name,
                label=tool_label,
                detail=summary,
                status="error",
            )
            return {"ok": False, "error": str(exc), "tool": name}

        summary = _summarize_tool_result(name, result)
        if isinstance(result, dict) and result.get("proposal_id") and proposal_recorder is not None:
            proposal_recorder.append(dict(result))
        recorder.append(ChatAgentToolCall(name=name, summary=summary))
        _emit_thinking_step(
            thinking_callback,
            key=name,
            label=tool_label,
            detail=summary,
            status="done",
        )
        return result

    return wrapped


def _register_chat_tools(
    agent: Agent,
    *,
    allowlist: tuple[str, ...],
    recorder: list[ChatAgentToolCall],
    proposal_recorder: list[dict[str, object]],
    thinking_callback: Callable[[ChatAgentThinkingStep], None] | None = None,
) -> None:
    allowed = set(allowlist)

    if "search_inspiration_posts" in allowed:

        @agent.tool
        def search_inspiration_posts(
            ctx: RunContext[StudioToolContext],
            query: str = "",
            limit: int = 8,
        ) -> list[dict[str, object]]:
            wrapped = _wrap_tool(
                _search_inspiration_posts,
                "search_inspiration_posts",
                recorder,
                thinking_callback=thinking_callback,
            )
            cleaned_query = str(query or "").strip()
            if not cleaned_query:
                return []
            return wrapped(ctx.deps, cleaned_query, limit=limit)

    if "search_shared_templates" in allowed:

        @agent.tool
        def search_shared_templates(
            ctx: RunContext[StudioToolContext],
            query: str = "",
            limit: int = 8,
        ) -> list[dict[str, object]]:
            wrapped = _wrap_tool(
                _search_shared_templates,
                "search_shared_templates",
                recorder,
                thinking_callback=thinking_callback,
            )
            cleaned_query = str(query or "").strip()
            if not cleaned_query:
                return []
            return wrapped(ctx.deps, cleaned_query, limit=limit)

    if "list_enabled_image_providers" in allowed:

        @agent.tool
        def list_enabled_image_providers(ctx: RunContext[StudioToolContext]) -> list[dict[str, object]]:
            wrapped = _wrap_tool(
                _list_enabled_image_providers,
                "list_enabled_image_providers",
                recorder,
                thinking_callback=thinking_callback,
            )
            return wrapped(ctx.deps)

    if "list_active_workflows" in allowed:

        @agent.tool
        def list_active_workflows(ctx: RunContext[StudioToolContext]) -> list[dict[str, object]]:
            wrapped = _wrap_tool(
                _list_active_workflows,
                "list_active_workflows",
                recorder,
                thinking_callback=thinking_callback,
            )
            return wrapped(ctx.deps)

    if "summarize_generation_stack" in allowed:

        @agent.tool
        def summarize_generation_stack(ctx: RunContext[StudioToolContext]) -> dict[str, object]:
            wrapped = _wrap_tool(
                _summarize_generation_stack,
                "summarize_generation_stack",
                recorder,
                thinking_callback=thinking_callback,
            )
            return wrapped(ctx.deps)

    if "fetch_reference_page" in allowed:

        @agent.tool
        def fetch_reference_page(ctx: RunContext[StudioToolContext], url: str, limit: int = 8) -> dict[str, object]:
            wrapped = _wrap_tool(
                _fetch_reference_page,
                "fetch_reference_page",
                recorder,
                thinking_callback=thinking_callback,
            )
            cleaned_url = str(url or "").strip()
            if not cleaned_url:
                return {"ok": False, "error": "url is required", "tool": "fetch_reference_page"}
            return wrapped(ctx.deps, cleaned_url, limit=limit)

    if "match_reference_intent" in allowed:

        @agent.tool
        def match_reference_intent(
            ctx: RunContext[StudioToolContext],
            description: str = "",
            reference_image: str = "",
            limit: int = 12,
        ) -> dict[str, object]:
            wrapped = _wrap_tool(
                _match_reference_intent,
                "match_reference_intent",
                recorder,
                thinking_callback=thinking_callback,
            )
            return wrapped(
                ctx.deps,
                description=description,
                reference_image=reference_image,
                limit=limit,
            )

    if "import_reference_page" in allowed:

        @agent.tool
        def import_reference_page(
            ctx: RunContext[StudioToolContext],
            url: str,
            cover_image_url: str = "",
            category: str = "建筑",
        ) -> dict[str, object]:
            wrapped = _wrap_tool(
                _import_reference_page,
                "import_reference_page",
                recorder,
                thinking_callback=thinking_callback,
            )
            cleaned_url = str(url or "").strip()
            if not cleaned_url:
                return {"ok": False, "error": "url is required", "tool": "import_reference_page"}
            return wrapped(ctx.deps, cleaned_url, cover_image_url=cover_image_url, category=category)

    if "propose_image_generate_task" in allowed:

        @agent.tool
        def propose_image_generate_task(
            ctx: RunContext[StudioToolContext],
            prompt: str = "",
            requested_provider: str = "",
            aspect_ratio: str = "16:9",
            resolution: str = "1k",
            image_count: int = 1,
            title: str = "",
            project_code: str = "",
        ) -> dict[str, object]:
            def _run() -> dict[str, object]:
                cleaned_prompt = str(prompt or "").strip()
                cleaned_provider = str(requested_provider or "").strip()
                if not cleaned_prompt:
                    return {"ok": False, "error": "prompt is required", "tool": "propose_image_generate_task"}
                if not cleaned_provider:
                    return {
                        "ok": False,
                        "error": "requested_provider is required; call list_enabled_image_providers first",
                        "tool": "propose_image_generate_task",
                    }
                proposal = build_image_generate_proposal(
                    ctx.deps,
                    prompt=prompt,
                    requested_provider=requested_provider,
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    image_count=image_count,
                    title=title,
                    project_code=project_code,
                )
                return proposal.to_dict()

            wrapped = _wrap_tool(_run, "propose_image_generate_task", recorder, proposal_recorder, thinking_callback)
            return wrapped()

    if "propose_image_edit_task" in allowed:

        @agent.tool
        def propose_image_edit_task(
            ctx: RunContext[StudioToolContext],
            edit_prompt: str = "",
            requested_provider: str = "",
            reference_image: str = "",
            aspect_ratio: str = "16:9",
            resolution: str = "1k",
            title: str = "",
            project_code: str = "",
        ) -> dict[str, object]:
            def _run() -> dict[str, object]:
                cleaned_prompt = str(edit_prompt or "").strip()
                cleaned_provider = str(requested_provider or "").strip()
                cleaned_reference = str(reference_image or "").strip()
                if not cleaned_prompt:
                    return {"ok": False, "error": "edit_prompt is required", "tool": "propose_image_edit_task"}
                if not cleaned_provider:
                    return {
                        "ok": False,
                        "error": "requested_provider is required; call list_enabled_image_providers first",
                        "tool": "propose_image_edit_task",
                    }
                if not cleaned_reference:
                    return {"ok": False, "error": "reference_image is required", "tool": "propose_image_edit_task"}
                proposal = build_image_edit_proposal(
                    ctx.deps,
                    edit_prompt=edit_prompt,
                    requested_provider=requested_provider,
                    reference_image=reference_image,
                    aspect_ratio=aspect_ratio,
                    resolution=resolution,
                    title=title,
                    project_code=project_code,
                )
                return proposal.to_dict()

            wrapped = _wrap_tool(_run, "propose_image_edit_task", recorder, proposal_recorder, thinking_callback)
            return wrapped()


def run_studio_agent(
    db: Session,
    *,
    message: str,
    user_name: str,
    user_id: int | None,
    provider_id: int | None = None,
    policy_version: str | None = None,
    policy_environment: str = "prod",
    thinking_callback: Callable[[ChatAgentThinkingStep], None] | None = None,
    persona: AssignedAgentPersona | None = None,
    memory_context: str = "",
    allowlist_override: tuple[str, ...] | None = None,
) -> StudioAgentReply:
    if not _PYDANTIC_AI_AVAILABLE:
        raise StudioAgentUnavailableError("pydantic-ai is not installed.")

    policy: EffectiveChatPolicy = resolve_effective_chat_policy(
        db,
        environment=policy_environment,
        policy_version=policy_version,
        user_id=user_id,
    )
    if persona is not None:
        system_prompt = build_persona_system_prompt(policy=policy, persona=persona)
        allowlist = allowlist_override or resolve_persona_allowlist(policy, persona)
    else:
        system_prompt = policy.system_prompt
        allowlist = allowlist_override or policy.chat_tool_allowlist

    agent_key = persona.key if persona else ""
    agent_label = persona.display_name if persona else ""
    wrapped_callback = _wrap_thinking_callback(thinking_callback, agent_key, agent_label)

    provider = _resolve_provider(db, provider_id)
    api_key = _provider_api_key(provider)
    tool_call_recorder: list[ChatAgentToolCall] = []
    task_proposal_recorder: list[dict[str, object]] = []

    model = OpenAICompatibleModel(
        provider.model_name,
        provider=OpenAIProvider(base_url=provider.base_url.rstrip("/"), api_key=api_key),
    )
    agent = Agent(
        model,
        deps_type=StudioToolContext,
        system_prompt=system_prompt,
        retries=4,
    )
    _register_chat_tools(
        agent,
        allowlist=allowlist,
        recorder=tool_call_recorder,
        proposal_recorder=task_proposal_recorder,
        thinking_callback=wrapped_callback,
    )

    tool_ctx = StudioToolContext(db=db, user_name=user_name, user_id=user_id)
    composed_message = message.strip()
    if memory_context.strip():
        composed_message = f"{memory_context.strip()}\n\n当前请求：\n{composed_message}"

    _emit_thinking_step(
        wrapped_callback,
        key="agent_plan",
        label="分析需求",
        detail="正在理解您的问题…",
        status="running",
        agent_key=agent_key,
        agent_label=agent_label,
    )
    try:
        result = agent.run_sync(composed_message, deps=tool_ctx)
    except Exception as exc:
        detail = str(exc).strip()
        if "max retries" in detail.lower():
            raise StudioAgentUnavailableError(
                "助手工具调用多次失败，可能是模型误调工具或参数不完整。"
                "寒暄请直接回复；生图请先列出可用模型。"
            ) from exc
        raise
    _emit_thinking_step(
        wrapped_callback,
        key="agent_plan",
        label="分析需求",
        detail="已完成规划",
        status="done",
        agent_key=agent_key,
        agent_label=agent_label,
    )
    _emit_thinking_step(
        wrapped_callback,
        key="agent_compose",
        label="整理回复",
        detail="正在生成回答…",
        status="running",
        agent_key=agent_key,
        agent_label=agent_label,
    )
    return StudioAgentReply(
        text=str(result.output).strip(),
        provider_name=provider.provider_name,
        model_name=provider.model_name,
        tool_calls=tuple(tool_call_recorder),
        task_proposals=tuple(task_proposal_recorder),
        policy_version=policy.policy_version,
    )


def _wrap_thinking_callback(
    callback: Callable[[ChatAgentThinkingStep], None] | None,
    agent_key: str,
    agent_label: str,
) -> Callable[[ChatAgentThinkingStep], None] | None:
    if callback is None:
        return None

    def wrapped(step: ChatAgentThinkingStep) -> None:
        if agent_key and not step.agent_key:
            step = ChatAgentThinkingStep(
                key=step.key,
                label=step.label,
                detail=step.detail,
                status=step.status,
                agent_key=agent_key,
                agent_label=agent_label,
            )
        callback(step)

    return wrapped


def run_studio_agent_isolated(
    *,
    message: str,
    user_name: str,
    user_id: int | None,
    provider_id: int | None = None,
    policy_version: str | None = None,
    policy_environment: str = "prod",
    thinking_callback: Callable[[ChatAgentThinkingStep], None] | None = None,
) -> StudioAgentReply:
    """Run the studio agent on a fresh DB session (safe for asyncio.to_thread)."""
    from app.database import SessionLocal

    with SessionLocal() as db:
        return run_studio_agent(
            db,
            message=message,
            user_name=user_name,
            user_id=user_id,
            provider_id=provider_id,
            policy_version=policy_version,
            policy_environment=policy_environment,
            thinking_callback=thinking_callback,
        )
