"""Codex-style Chat agent harness: policy + memory inject + single-agent loop entry.

Harness stays model-agnostic (ProviderProfile). Multi-agent / LangGraph is intentionally out of scope.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from sqlalchemy.orm import Session

from app.integrations.studio_agent.agent import ChatAgentThinkingStep, StudioAgentReply, run_studio_agent
from app.models import ChatMessage
from app.services.agent_memory_service import (
    build_compacted_memory_context,
    record_chat_turn_memory,
)
from app.services.agent_policy_service import resolve_effective_chat_policy
from app.services.agent_tool_registry_service import format_tool_hints, rank_tools_for_query
from app.services.chat_agent_service import build_chat_agent_message


@dataclass(frozen=True)
class HarnessTrace:
    harness_mode: str
    memory_hit_count: int
    session_summary_used: bool
    policy_version: str
    tool_hint_count: int = 0


@dataclass(frozen=True)
class HarnessAgentResult:
    reply: StudioAgentReply
    trace: HarnessTrace
    audit_details: dict[str, object] = field(default_factory=dict)


def run_chat_agent_harness(
    db: Session,
    *,
    recent_messages: list[ChatMessage],
    new_content: str,
    user_name: str,
    user_id: int | None,
    conversation_id: int,
    provider_id: int | None,
    policy_version: str | None,
    attachment_names: list[str] | None = None,
    thinking_callback: Callable[[ChatAgentThinkingStep], None] | None = None,
) -> HarnessAgentResult:
    policy = resolve_effective_chat_policy(
        db,
        environment="prod",
        policy_version=policy_version,
        user_id=user_id,
    )

    memory_context = ""
    memory_hit_count = 0
    session_summary_used = False
    if user_id is not None:
        memory_bundle = build_compacted_memory_context(
            db,
            user_id=user_id,
            conversation_id=conversation_id,
            query=new_content,
        )
        memory_context = memory_bundle.context
        memory_hit_count = memory_bundle.hit_count
        session_summary_used = memory_bundle.session_summary_used

    ranked = rank_tools_for_query(allowlist=policy.chat_tool_allowlist, query=new_content)
    tool_hints = format_tool_hints(ranked)

    from app.integrations.studio_agent.tools import StudioToolContext, format_enabled_generation_models_note

    models_note = format_enabled_generation_models_note(
        StudioToolContext(db=db, user_name=user_name, user_id=user_id)
    )

    agent_message = build_chat_agent_message(
        recent_messages[-12:],
        new_content,
        attachment_names=attachment_names,
    )
    prefix_parts = [part for part in (tool_hints, models_note) if part]
    if prefix_parts:
        prefix = "\n\n".join(prefix_parts)
        agent_message = f"{prefix}\n\n{agent_message}"

    reply = run_studio_agent(
        db,
        message=agent_message,
        user_name=user_name,
        user_id=user_id,
        provider_id=provider_id,
        policy_version=policy.policy_version,
        thinking_callback=thinking_callback,
        memory_context=memory_context,
        # Freeze allowlist for this turn (gov changes only affect new sessions via resolve).
        allowlist_override=policy.chat_tool_allowlist,
    )

    record_chat_turn_memory(
        db,
        user_id=user_id,
        conversation_id=conversation_id,
        user_message=new_content,
        assistant_reply=reply.text,
        route="studio",
    )
    if user_id is not None:
        db.commit()

    trace = HarnessTrace(
        harness_mode="single_agent",
        memory_hit_count=memory_hit_count,
        session_summary_used=session_summary_used,
        policy_version=reply.policy_version,
        tool_hint_count=len(ranked),
    )
    audit = {
        "harness_mode": trace.harness_mode,
        "memory_hit_count": trace.memory_hit_count,
        "session_summary_used": trace.session_summary_used,
        "policy_version": trace.policy_version,
        "tool_hint_count": trace.tool_hint_count,
        "tool_calls": [call.name for call in reply.tool_calls],
        "task_proposals": [item.get("proposal_id") for item in reply.task_proposals],
    }
    return HarnessAgentResult(reply=reply, trace=trace, audit_details=audit)


def run_chat_agent_harness_isolated(
    *,
    recent_messages: list[ChatMessage],
    new_content: str,
    user_name: str,
    user_id: int | None,
    conversation_id: int,
    provider_id: int | None,
    policy_version: str | None,
    attachment_names: list[str] | None = None,
    thinking_callback: Callable[[ChatAgentThinkingStep], None] | None = None,
) -> HarnessAgentResult:
    """Fresh DB session for asyncio.to_thread."""
    from app.database import SessionLocal

    with SessionLocal() as db:
        # Re-load messages on this session so ORM objects are bound.
        from sqlalchemy import select

        from app.models import ChatMessage as ChatMessageModel

        message_ids = [item.id for item in recent_messages if item.id is not None]
        loaded: list[ChatMessage] = []
        if message_ids:
            rows = db.scalars(
                select(ChatMessageModel)
                .where(ChatMessageModel.id.in_(message_ids))
                .order_by(ChatMessageModel.created_at.asc())
            ).all()
            by_id = {row.id: row for row in rows}
            loaded = [by_id[item_id] for item_id in message_ids if item_id in by_id]

        return run_chat_agent_harness(
            db,
            recent_messages=loaded,
            new_content=new_content,
            user_name=user_name,
            user_id=user_id,
            conversation_id=conversation_id,
            provider_id=provider_id,
            policy_version=policy_version,
            attachment_names=attachment_names,
            thinking_callback=thinking_callback,
        )
