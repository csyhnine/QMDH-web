"""Unified Chat agent harness (Codex-style thread + policy + orchestration entry)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from sqlalchemy.orm import Session

from app.integrations.multi_agent.graph import run_multi_agent_graph
from app.integrations.multi_agent.state import MultiAgentState
from app.integrations.studio_agent.agent import ChatAgentThinkingStep, StudioAgentReply, run_studio_agent
from app.models import ChatMessage, Conversation
from app.services.agent_memory_service import build_compacted_memory_context
from app.services.agent_persona_service import load_user_agent_roster
from app.services.agent_policy_service import resolve_effective_chat_policy
from app.services.chat_agent_service import build_chat_agent_message


@dataclass(frozen=True)
class HarnessTrace:
    graph_thread_id: str
    route: str
    route_reason: str
    route_confidence: float
    route_method: str
    memory_hit_count: int
    session_summary_used: bool
    active_persona_key: str
    active_persona_label: str
    harness_mode: str  # single_agent | multi_agent
    chain_to_studio: bool = False
    graph_interrupted: bool = False
    hitl_pending: bool = False


@dataclass(frozen=True)
class HarnessAgentResult:
    reply: StudioAgentReply
    trace: HarnessTrace
    audit_details: dict[str, object] = field(default_factory=dict)


def ensure_conversation_thread_id(db: Session, conversation_id: int) -> str:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        return f"chat-{conversation_id}"
    thread_id = (conversation.agent_thread_id or "").strip()
    if not thread_id:
        thread_id = f"chat-{conversation_id}"
        conversation.agent_thread_id = thread_id
        db.flush()
    return thread_id


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
    roster = load_user_agent_roster(db, user_id)
    thread_id = ensure_conversation_thread_id(db, conversation_id)

    compact_turns = recent_messages[-3:]
    agent_message = build_chat_agent_message(
        compact_turns,
        new_content,
        attachment_names=attachment_names,
    )

    if user_id is None or len(roster) < 2:
        reply = run_studio_agent(
            db,
            message=agent_message,
            user_name=user_name,
            user_id=user_id,
            provider_id=provider_id,
            policy_version=policy_version,
            thinking_callback=thinking_callback,
        )
        trace = HarnessTrace(
            graph_thread_id=thread_id,
            route="direct",
            route_reason="single_agent_fallback",
            route_confidence=1.0,
            route_method="rule",
            memory_hit_count=0,
            session_summary_used=False,
            active_persona_key="",
            active_persona_label="",
            harness_mode="single_agent",
        )
        return HarnessAgentResult(reply=reply, trace=trace, audit_details=_build_audit(trace, reply))

    memory_bundle = build_compacted_memory_context(
        db,
        user_id=user_id,
        conversation_id=conversation_id,
        query=new_content,
    )

    state: MultiAgentState = {
        "message": agent_message,
        "user_message_raw": new_content,
        "user_id": user_id,
        "user_name": user_name,
        "conversation_id": conversation_id,
        "provider_id": provider_id,
        "policy_version": policy.policy_version,
        "memory_context": memory_bundle.context,
        "memory_hit_count": memory_bundle.hit_count,
        "session_summary_used": memory_bundle.session_summary_used,
        "tool_calls": [],
        "task_proposals": [],
        "thinking_steps": [],
    }

    graph_run = run_multi_agent_graph(
        db,
        state=state,
        thinking_callback=thinking_callback,
        thread_id=thread_id,
    )
    result = graph_run.state

    final_text = (result.get("final_text") or "").strip() or "助手未返回内容，请重试。"
    reply = StudioAgentReply(
        text=final_text,
        provider_name=str(result.get("provider_name") or ""),
        model_name=str(result.get("model_name") or ""),
        tool_calls=tuple(result.get("tool_calls") or []),
        task_proposals=tuple(result.get("task_proposals") or []),
        policy_version=str(result.get("policy_version_out") or policy.policy_version),
    )
    trace = HarnessTrace(
        graph_thread_id=thread_id,
        route=str(result.get("original_route") or result.get("route") or "direct"),
        route_reason=str(result.get("route_reason") or ""),
        route_confidence=float(result.get("route_confidence") or 0.0),
        route_method=str(result.get("route_method") or "rule"),
        memory_hit_count=int(result.get("memory_hit_count") or memory_bundle.hit_count),
        session_summary_used=bool(result.get("session_summary_used") or memory_bundle.session_summary_used),
        active_persona_key=str(result.get("active_persona_key") or ""),
        active_persona_label=str(result.get("active_persona_label") or ""),
        harness_mode="multi_agent",
        chain_to_studio=bool(result.get("chain_to_studio")),
        graph_interrupted=graph_run.interrupted,
        hitl_pending=graph_run.interrupted and bool(reply.task_proposals),
    )
    audit = _build_audit(trace, reply)
    if graph_run.interrupt_payload:
        audit["interrupt_payload"] = graph_run.interrupt_payload
    if graph_run.interrupted and reply.task_proposals and thinking_callback is not None:
        thinking_callback(
            ChatAgentThinkingStep(
                key="await_hitl",
                label="等待确认",
                detail="生图提案已生成，请在卡片中确认后才会入队",
                status="waiting",
                agent_key=str(result.get("active_persona_key") or "qmdh-studio"),
                agent_label=str(result.get("active_persona_label") or "生图助手"),
            )
        )
    return HarnessAgentResult(reply=reply, trace=trace, audit_details=audit)


def _build_audit(trace: HarnessTrace, reply: StudioAgentReply) -> dict[str, object]:
    return {
        "harness_mode": trace.harness_mode,
        "graph_thread_id": trace.graph_thread_id,
        "route": trace.route,
        "route_reason": trace.route_reason,
        "route_confidence": trace.route_confidence,
        "route_method": trace.route_method,
        "memory_hit_count": trace.memory_hit_count,
        "session_summary_used": trace.session_summary_used,
        "persona_key": trace.active_persona_key,
        "persona_label": trace.active_persona_label,
        "chain_to_studio": trace.chain_to_studio,
        "graph_interrupted": trace.graph_interrupted,
        "hitl_pending": trace.hitl_pending,
        "policy_version": reply.policy_version,
        "tool_calls": [call.name for call in reply.tool_calls],
        "task_proposals": [item.get("proposal_id") for item in reply.task_proposals],
    }
