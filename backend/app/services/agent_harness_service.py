"""Codex-style Chat agent harness: policy + memory inject + single-agent loop entry.

Harness stays model-agnostic (ProviderProfile). Multi-agent / LangGraph is intentionally out of scope.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.integrations.studio_agent.agent import ChatAgentThinkingStep, StudioAgentReply, run_studio_agent
from app.models import ChatMessage, Conversation
from app.services.agent_memory_service import (
    build_compacted_memory_context,
    record_chat_turn_memory,
)
from app.services.agent_policy_service import resolve_effective_chat_policy
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
    call_id: str = ""
    memory_status: str = "not_attempted"
    delivery_status: str = "unverified"


def _complete_turn_memory(
    db: Session,
    *,
    user_id: int | None,
    conversation_id: int,
    user_message: str,
    assistant_reply: str,
) -> dict[str, str]:
    """Best-effort memory transaction; never settle the tool/caller Session.

    A completed reply (including known usage) belongs to the caller even when
    memory fails. Liveness reads use scalars from a fresh Session, not a cached
    Conversation. Unknown commit outcomes are not retried here.
    """
    status = {"memory_status": "not_attempted", "delivery_status": "unverified", "memory_error_code": ""}
    try:
        bind = db.get_bind()
        if isinstance(bind, Connection):
            bind = bind.engine
        with Session(bind=bind, autoflush=False) as memory_db:
            live = select(Conversation.id).where(Conversation.id == conversation_id)
            if user_id is not None:
                live = live.where(Conversation.user_id == user_id)
            if memory_db.scalar(live) is None:
                return {**status, "delivery_status": "revoked"}
            if user_id is None:
                status["memory_status"] = "skipped"
            else:
                try:
                    record_chat_turn_memory(
                        memory_db,
                        user_id=user_id,
                        conversation_id=conversation_id,
                        user_message=user_message,
                        assistant_reply=assistant_reply,
                        route="studio",
                    )
                    memory_db.commit()
                    status["memory_status"] = "completed"
                except Exception:
                    status.update(memory_status="failed", memory_error_code="memory_write_failed")
                    memory_db.rollback()
            status["delivery_status"] = "ready" if memory_db.scalar(live) is not None else "revoked"
        return status
    except Exception:
        # Do not expose exception/SQL/message content or guess that the turn is
        # still deliverable when its conversation cannot be checked.
        return {**status, "delivery_status": "unverified", "memory_error_code": "conversation_check_failed"}


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
    model_observation=None,
) -> HarnessAgentResult:
    call_id = uuid4().hex
    if model_observation is not None:
        model_observation.bind_run(call_id)
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

    # Tool hints intentionally omitted (2026-08 slice A): duplicated tool schemas and
    # Chinese query ranking could mis-steer weak models toward memory_* tools.
    from app.integrations.studio_agent.tools import (
        StudioToolContext,
        allowlist_needs_generation_models,
        format_enabled_generation_models_note,
    )

    models_note = ""
    if allowlist_needs_generation_models(policy.chat_tool_allowlist):
        models_note = format_enabled_generation_models_note(
            StudioToolContext(db=db, user_name=user_name, user_id=user_id),
            compact=True,
        )

    agent_message = build_chat_agent_message(
        recent_messages[-12:],
        new_content,
        attachment_names=attachment_names,
    )
    if models_note:
        agent_message = f"{models_note}\n\n{agent_message}"

    from app.services.chat_agent_completion_service import start_agent_call, complete_agent_call, fail_agent_call

    receipt_id = start_agent_call(db, call_id=call_id, conversation_id=conversation_id,
                                 user_id=user_id, user_name=user_name, provider_id=provider_id)
    captured_steps: list[dict[str, object]] = []

    def capture_step(step: ChatAgentThinkingStep) -> None:
        item = step.to_dict()
        for index, previous in enumerate(captured_steps):
            if previous.get("key") == item.get("key"):
                captured_steps[index] = item
                break
        else:
            captured_steps.append(item)
        if thinking_callback is not None:
            thinking_callback(step)

    try:
        reply = run_studio_agent(
            db,
            message=agent_message,
            user_name=user_name,
            user_id=user_id,
            provider_id=provider_id,
            policy_version=policy.policy_version,
            thinking_callback=capture_step,
            model_observation=model_observation,
            memory_context=memory_context,
            # Freeze allowlist for this turn (gov changes only affect new sessions via resolve).
            allowlist_override=policy.chat_tool_allowlist,
        )
    except BaseException:
        fail_agent_call(db, receipt_id)
        raise
    steps = [s for s in captured_steps if s.get("key") != "agent_compose"]
    steps.append(ChatAgentThinkingStep(key="agent_compose", label="整理回复", detail="回复已生成", status="done").to_dict())
    durable = complete_agent_call(db, receipt_id, reply, thinking_steps=steps)

    trace = HarnessTrace(
        harness_mode="single_agent",
        memory_hit_count=memory_hit_count,
        session_summary_used=session_summary_used,
        policy_version=reply.policy_version,
        tool_hint_count=0,
    )
    audit = {
        "harness_mode": trace.harness_mode,
        "memory_hit_count": trace.memory_hit_count,
        "session_summary_used": trace.session_summary_used,
        "policy_version": trace.policy_version,
        "tool_hint_count": trace.tool_hint_count,
        "models_note_injected": bool(models_note),
        "tool_calls": [call.name for call in reply.tool_calls],
        "task_proposals": [item.get("proposal_id") for item in reply.task_proposals],
    }
    if durable.get("delivery_status", "ready") == "ready":
        completion = _complete_turn_memory(
            db, user_id=user_id, conversation_id=conversation_id,
            user_message=new_content, assistant_reply=reply.text,
        )
    else:
        completion = {"memory_status": "not_attempted", "delivery_status": durable["delivery_status"]}
    audit.update(durable)
    audit.update(call_id=call_id, **completion)
    return HarnessAgentResult(
        reply=reply, trace=trace, audit_details=audit, call_id=call_id,
        memory_status=completion["memory_status"], delivery_status=completion["delivery_status"],
    )


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
    model_observation=None,
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
            model_observation=model_observation,
        )
