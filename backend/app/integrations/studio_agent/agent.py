"""PydanticAI-powered Studio / Chat assistant (readonly + HITL propose tools)."""

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
    memory_forget as _memory_forget,
    memory_recall as _memory_recall,
    memory_store as _memory_store,
    read_skill_resource as _read_skill_resource,
    search_inspiration_posts as _search_inspiration_posts,
    search_shared_templates as _search_shared_templates,
    summarize_generation_stack as _summarize_generation_stack,
)
from app.models import ProviderProfile
from app.services.agent_policy_service import (
    CHAT_AGENT_BASELINE_PROMPT,
    EffectiveChatPolicy,
    chat_tool_catalog_map,
    resolve_effective_chat_policy,
)

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

    def to_dict(self) -> dict[str, str]:
        return {
            "key": self.key,
            "label": self.label,
            "detail": self.detail,
            "status": self.status,
        }


@dataclass(frozen=True)
class StudioAgentReply:
    text: str
    provider_name: str
    model_name: str
    tool_calls: tuple[ChatAgentToolCall, ...] = ()
    task_proposals: tuple[dict[str, object], ...] = ()
    policy_version: str = "code-default"


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
        if name == "create_image_generate_task":
            return str(result.get("summary") or "已创建生图任务卡片")
        if name == "create_image_edit_task":
            return str(result.get("summary") or "已创建改图任务卡片")
        if name == "create_video_generate_task":
            return str(result.get("summary") or "已创建视频任务卡片")
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
) -> None:
    if callback is not None:
        callback(
            ChatAgentThinkingStep(
                key=key,
                label=label,
                detail=detail,
                status=status,
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
                proposal_recorder,
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
                proposal_recorder,
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
                proposal_recorder,
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
                proposal_recorder,
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
                proposal_recorder,
                thinking_callback=thinking_callback,
            )
            return wrapped(ctx.deps)

    if "create_image_generate_task" in allowed:

        @agent.tool
        def create_image_generate_task(
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
                from app.services.chat_agent_task_service import (
                    auto_submit_chat_agent_proposal,
                    build_image_generate_proposal,
                )

                cleaned_prompt = str(prompt or "").strip()
                cleaned_provider = str(requested_provider or "").strip()
                if not cleaned_prompt:
                    return {"ok": False, "error": "prompt is required", "tool": "create_image_generate_task"}
                if not cleaned_provider:
                    return {
                        "ok": False,
                        "error": "requested_provider is required",
                        "tool": "create_image_generate_task",
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
                return auto_submit_chat_agent_proposal(ctx.deps, proposal)

            wrapped = _wrap_tool(_run, "create_image_generate_task", recorder, proposal_recorder, thinking_callback)
            return wrapped()

    if "create_image_edit_task" in allowed:

        @agent.tool
        def create_image_edit_task(
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
                from app.services.chat_agent_task_service import (
                    auto_submit_chat_agent_proposal,
                    build_image_edit_proposal,
                )

                cleaned_prompt = str(edit_prompt or "").strip()
                cleaned_provider = str(requested_provider or "").strip()
                cleaned_reference = str(reference_image or "").strip()
                if not cleaned_prompt:
                    return {"ok": False, "error": "edit_prompt is required", "tool": "create_image_edit_task"}
                if not cleaned_provider:
                    return {
                        "ok": False,
                        "error": "requested_provider is required",
                        "tool": "create_image_edit_task",
                    }
                if not cleaned_reference:
                    return {"ok": False, "error": "reference_image is required", "tool": "create_image_edit_task"}
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
                return auto_submit_chat_agent_proposal(ctx.deps, proposal)

            wrapped = _wrap_tool(_run, "create_image_edit_task", recorder, proposal_recorder, thinking_callback)
            return wrapped()

    if "create_video_generate_task" in allowed:

        @agent.tool
        def create_video_generate_task(
            ctx: RunContext[StudioToolContext],
            motion_prompt: str = "",
            requested_provider: str = "",
            source_image: str = "",
            aspect_ratio: str = "16:9",
            title: str = "",
            project_code: str = "",
        ) -> dict[str, object]:
            def _run() -> dict[str, object]:
                from app.services.chat_agent_task_service import (
                    auto_submit_chat_agent_proposal,
                    build_video_generate_proposal,
                )

                cleaned_prompt = str(motion_prompt or "").strip()
                cleaned_provider = str(requested_provider or "").strip()
                if not cleaned_prompt:
                    return {"ok": False, "error": "motion_prompt is required", "tool": "create_video_generate_task"}
                if not cleaned_provider:
                    return {
                        "ok": False,
                        "error": "requested_provider is required",
                        "tool": "create_video_generate_task",
                    }
                proposal = build_video_generate_proposal(
                    ctx.deps,
                    motion_prompt=motion_prompt,
                    requested_provider=requested_provider,
                    source_image=source_image,
                    aspect_ratio=aspect_ratio,
                    title=title,
                    project_code=project_code,
                )
                return auto_submit_chat_agent_proposal(ctx.deps, proposal)

            wrapped = _wrap_tool(_run, "create_video_generate_task", recorder, proposal_recorder, thinking_callback)
            return wrapped()

    if "read_skill_resource" in allowed:

        @agent.tool
        def read_skill_resource(
            ctx: RunContext[StudioToolContext],
            skill_key: str = "",
            relative_path: str = "",
        ) -> dict[str, object]:
            wrapped = _wrap_tool(
                _read_skill_resource,
                "read_skill_resource",
                recorder,
                proposal_recorder,
                thinking_callback=thinking_callback,
            )
            return wrapped(ctx.deps, str(skill_key or "").strip(), str(relative_path or "").strip())

    if "memory_recall" in allowed:

        @agent.tool
        def memory_recall(
            ctx: RunContext[StudioToolContext],
            query: str = "",
            limit: int = 5,
        ) -> dict[str, object]:
            wrapped = _wrap_tool(
                _memory_recall,
                "memory_recall",
                recorder,
                proposal_recorder,
                thinking_callback=thinking_callback,
            )
            return wrapped(ctx.deps, str(query or "").strip(), int(limit or 5))

    if "memory_store" in allowed:

        @agent.tool
        def memory_store(
            ctx: RunContext[StudioToolContext],
            content: str = "",
            memory_type: str = "fact",
        ) -> dict[str, object]:
            wrapped = _wrap_tool(
                _memory_store,
                "memory_store",
                recorder,
                proposal_recorder,
                thinking_callback=thinking_callback,
            )
            return wrapped(ctx.deps, str(content or "").strip(), str(memory_type or "fact").strip() or "fact")

    if "memory_forget" in allowed:

        @agent.tool
        def memory_forget(
            ctx: RunContext[StudioToolContext],
            memory_id: int = 0,
        ) -> dict[str, object]:
            wrapped = _wrap_tool(
                _memory_forget,
                "memory_forget",
                recorder,
                proposal_recorder,
                thinking_callback=thinking_callback,
            )
            return wrapped(ctx.deps, int(memory_id or 0))


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
    allowlist = allowlist_override if allowlist_override is not None else policy.chat_tool_allowlist

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
        system_prompt=policy.system_prompt,
        retries=4,
    )
    _register_chat_tools(
        agent,
        allowlist=allowlist,
        recorder=tool_call_recorder,
        proposal_recorder=task_proposal_recorder,
        thinking_callback=thinking_callback,
    )

    tool_ctx = StudioToolContext(db=db, user_name=user_name, user_id=user_id, policy=policy)
    composed_message = message.strip()
    if memory_context.strip():
        composed_message = f"{memory_context.strip()}\n\n当前请求：\n{composed_message}"

    _emit_thinking_step(
        thinking_callback,
        key="agent_plan",
        label="分析需求",
        detail="正在理解您的问题…",
        status="running",
    )
    try:
        result = agent.run_sync(composed_message, deps=tool_ctx)
    except Exception as exc:
        detail = str(exc).strip()
        if "max retries" in detail.lower():
            raise StudioAgentUnavailableError(
                "助手工具调用多次失败，可能是模型误调工具或参数不完整。"
                "寒暄请直接回复；生图请直接创建并入队任务。"
            ) from exc
        raise
    _emit_thinking_step(
        thinking_callback,
        key="agent_plan",
        label="分析需求",
        detail="已完成规划",
        status="done",
    )
    # run_sync already produced the full reply; mark compose done (router may upsert again).
    _emit_thinking_step(
        thinking_callback,
        key="agent_compose",
        label="整理回复",
        detail="回复已生成",
        status="done",
    )
    return StudioAgentReply(
        text=str(result.output).strip(),
        provider_name=provider.provider_name,
        model_name=provider.model_name,
        tool_calls=tuple(tool_call_recorder),
        task_proposals=tuple(task_proposal_recorder),
        policy_version=policy.policy_version,
    )


def run_studio_agent_isolated(
    *,
    message: str,
    user_name: str,
    user_id: int | None,
    provider_id: int | None = None,
    policy_version: str | None = None,
    policy_environment: str = "prod",
    thinking_callback: Callable[[ChatAgentThinkingStep], None] | None = None,
    memory_context: str = "",
    allowlist_override: tuple[str, ...] | None = None,
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
            memory_context=memory_context,
            allowlist_override=allowlist_override,
        )
