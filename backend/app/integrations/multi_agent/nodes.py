"""LangGraph node implementations for multi-agent chat."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.integrations.multi_agent.state import MultiAgentState, ThinkingCallback
from app.integrations.studio_agent.agent import ChatAgentThinkingStep, StudioAgentReply, run_studio_agent
from app.services.agent_memory_service import (
    build_compacted_memory_context,
    extract_preference_memory,
    upsert_conversation_session_summary,
    write_hitl_confirmation_memory,
    write_tool_evidence_memory,
    write_turn_memory,
)
from app.services.agent_persona_service import (
    AssignedAgentPersona,
    get_persona_from_roster,
    load_user_agent_roster,
    resolve_persona_allowlist,
)
from app.services.agent_policy_service import resolve_effective_chat_policy
from app.services.agent_routing_service import resolve_route
from app.services.agent_tool_registry_service import format_tool_hints, rank_tools_for_query


def _append_route_step(
    callback: ThinkingCallback,
    *,
    route: str,
    detail: str,
    agent_key: str,
    agent_label: str,
) -> dict[str, str]:
    step = ChatAgentThinkingStep(
        key=f"route_{route}",
        label="路由决策",
        detail=detail,
        status="done",
        agent_key=agent_key,
        agent_label=agent_label,
    )
    if callback is not None:
        callback(step)
    return step.to_dict()


def make_load_memory_node(db: Session):
    def load_memory(state: MultiAgentState) -> MultiAgentState:
        if state.get("memory_context"):
            return {}
        user_id = state.get("user_id")
        conversation_id = state.get("conversation_id")
        if user_id is None or conversation_id is None:
            return {"memory_context": "", "memory_hit_count": 0, "session_summary_used": False}
        bundle = build_compacted_memory_context(
            db,
            user_id=user_id,
            conversation_id=conversation_id,
            query=state.get("user_message_raw") or "",
        )
        return {
            "memory_context": bundle.context,
            "memory_hit_count": bundle.hit_count,
            "session_summary_used": bundle.session_summary_used,
        }

    return load_memory


def make_route_node(db: Session):
    def route(state: MultiAgentState) -> MultiAgentState:
        user_id = state.get("user_id")
        roster = load_user_agent_roster(db, user_id)
        decision = resolve_route(state.get("user_message_raw") or state.get("message") or "", roster=roster)
        coordinator = get_persona_from_roster(roster, "coordinator") or (roster[0] if roster else None)
        agent_key = coordinator.key if coordinator else "qmdh-coordinator"
        agent_label = coordinator.display_name if coordinator else "协调助手"
        detail = {
            "research": "已交由检索助手",
            "studio": "已交由生图助手",
            "direct": "协调助手直接回复",
            "research_then_studio": "先检索再交由生图助手",
        }.get(decision.route, decision.reason)
        step = _append_route_step(None, route=decision.route, detail=detail, agent_key=agent_key, agent_label=agent_label)
        primary_route = "research" if decision.route == "research_then_studio" else decision.route
        return {
            "route": primary_route,
            "original_route": decision.route,
            "route_reason": decision.reason,
            "route_confidence": decision.confidence,
            "route_method": decision.method,
            "chain_to_studio": decision.route == "research_then_studio",
            "next_after_research": "studio" if decision.route == "research_then_studio" else "synthesize",
            "roster_keys": [item.key for item in roster],
            "active_persona_key": agent_key,
            "active_persona_label": agent_label,
            "thinking_steps": [step],
        }

    return route


def _run_persona_agent(
    db: Session,
    state: MultiAgentState,
    persona: AssignedAgentPersona | None,
    *,
    thinking_callback: ThinkingCallback,
) -> StudioAgentReply:
    message = state.get("message") or ""
    memory_context = state.get("memory_context") or ""
    if memory_context.strip():
        message = f"{memory_context.strip()}\n\n当前请求：\n{message.strip()}"

    if persona is not None and state.get("user_id") is not None:
        effective_policy = resolve_effective_chat_policy(
            db,
            environment="prod",
            policy_version=state.get("policy_version"),
            user_id=state.get("user_id"),
        )
        allowlist = resolve_persona_allowlist(effective_policy, persona)
        ranked = rank_tools_for_query(allowlist=allowlist, query=state.get("user_message_raw") or "")
        tool_hints = format_tool_hints(ranked)
        if tool_hints:
            message = f"{message}\n\n{tool_hints}"

    reply = run_studio_agent(
        db,
        message=message,
        user_name=state.get("user_name") or "",
        user_id=state.get("user_id"),
        provider_id=state.get("provider_id"),
        policy_version=state.get("policy_version"),
        thinking_callback=thinking_callback,
        persona=persona,
        memory_context="",
    )

    user_id = state.get("user_id")
    conversation_id = state.get("conversation_id")
    if user_id is not None and conversation_id is not None and persona is not None:
        for call in reply.tool_calls:
            write_tool_evidence_memory(
                db,
                user_id=user_id,
                conversation_id=conversation_id,
                persona_id=persona.id,
                tool_name=call.name,
                summary=call.summary,
            )
    return reply


def make_specialist_node(db: Session, *, role: str, thinking_callback: ThinkingCallback):
    def specialist(state: MultiAgentState) -> MultiAgentState:
        roster = load_user_agent_roster(db, state.get("user_id"))
        persona = get_persona_from_roster(roster, role)
        if persona is None:
            return {
                "specialist_text": "",
                "final_text": "当前账号未分配对应 Agent，请联系管理员。",
                "route": "direct",
                "next_after_research": "synthesize",
            }
        reply = _run_persona_agent(db, state, persona, thinking_callback=thinking_callback)
        payload: MultiAgentState = {
            "specialist_text": reply.text,
            "final_text": reply.text,
            "tool_calls": list(reply.tool_calls),
            "task_proposals": list(reply.task_proposals),
            "policy_version_out": reply.policy_version,
            "provider_name": reply.provider_name,
            "model_name": reply.model_name,
            "active_persona_key": persona.key,
            "active_persona_label": persona.display_name,
        }
        if role == "research" and state.get("chain_to_studio"):
            enriched = f"{state.get('message') or ''}\n\n【检索阶段结果】\n{reply.text.strip()}".strip()
            payload["message"] = enriched
            payload["next_after_research"] = "studio"
        elif role == "research":
            payload["next_after_research"] = "synthesize"
        return payload

    return specialist


def make_direct_node(db: Session, thinking_callback: ThinkingCallback):
    def direct(state: MultiAgentState) -> MultiAgentState:
        roster = load_user_agent_roster(db, state.get("user_id"))
        persona = get_persona_from_roster(roster, "coordinator") or (roster[0] if roster else None)
        reply = _run_persona_agent(db, state, persona, thinking_callback=thinking_callback)
        return {
            "specialist_text": reply.text,
            "final_text": reply.text,
            "tool_calls": list(reply.tool_calls),
            "task_proposals": list(reply.task_proposals),
            "policy_version_out": reply.policy_version,
            "provider_name": reply.provider_name,
            "model_name": reply.model_name,
            "active_persona_key": persona.key if persona else "",
            "active_persona_label": persona.display_name if persona else "",
            "next_after_research": "synthesize",
        }

    return direct


def make_synthesize_node():
    def synthesize(state: MultiAgentState) -> MultiAgentState:
        final_text = (state.get("final_text") or state.get("specialist_text") or "").strip()
        if final_text:
            return {"final_text": final_text}
        return {"final_text": "助手未返回内容，请重试。"}

    return synthesize


def make_write_memory_node(db: Session):
    def write_memory(state: MultiAgentState) -> MultiAgentState:
        user_id = state.get("user_id")
        conversation_id = state.get("conversation_id")
        if user_id is None or conversation_id is None:
            return {}

        user_message = state.get("user_message_raw") or ""
        final_text = state.get("final_text") or ""
        route = str(state.get("original_route") or state.get("route") or "direct")
        roster = load_user_agent_roster(db, user_id)
        persona = None
        if route in {"research", "research_then_studio"}:
            persona = get_persona_from_roster(roster, "research")
        elif route == "studio":
            persona = get_persona_from_roster(roster, "studio")
        else:
            persona = get_persona_from_roster(roster, "coordinator")

        extract_preference_memory(
            db,
            user_id=user_id,
            user_message=user_message,
            conversation_id=conversation_id,
        )
        write_turn_memory(
            db,
            user_id=user_id,
            conversation_id=conversation_id,
            user_message=user_message,
            assistant_reply=final_text,
            route=route,
            persona_id=persona.id if persona else None,
        )
        upsert_conversation_session_summary(
            db,
            user_id=user_id,
            conversation_id=conversation_id,
            user_message=user_message,
            assistant_reply=final_text,
            route=route,
        )
        db.commit()
        return {}

    return write_memory


def make_await_hitl_node():
    from langgraph.types import interrupt

    def await_hitl(state: MultiAgentState) -> MultiAgentState:
        proposals = list(state.get("task_proposals") or [])
        if not proposals:
            return {"hitl_status": "none"}

        resume_payload = interrupt(
            {
                "reason": "task_confirmation",
                "proposal_ids": [item.get("proposal_id") for item in proposals if isinstance(item, dict)],
                "workflow_keys": [item.get("workflow_key") for item in proposals if isinstance(item, dict)],
            }
        )
        if not isinstance(resume_payload, dict):
            resume_payload = {"status": "confirmed", "raw": resume_payload}
        return {"hitl_status": "confirmed", "hitl_resume": resume_payload}

    return await_hitl


def make_post_hitl_node(db: Session):
    def post_hitl(state: MultiAgentState) -> MultiAgentState:
        if state.get("hitl_status") != "confirmed":
            return {}

        resume = state.get("hitl_resume") or {}
        if not isinstance(resume, dict):
            return {}

        user_id = state.get("user_id")
        conversation_id = state.get("conversation_id")
        if user_id is None or conversation_id is None:
            return {}

        proposal_id = str(resume.get("proposal_id") or "").strip()
        task_id_raw = resume.get("task_id")
        workflow_key = str(resume.get("workflow_key") or "image-generate").strip()
        try:
            task_id = int(task_id_raw)
        except (TypeError, ValueError):
            return {}

        if not proposal_id:
            return {}

        write_hitl_confirmation_memory(
            db,
            user_id=user_id,
            conversation_id=conversation_id,
            proposal_id=proposal_id,
            task_id=task_id,
            workflow_key=workflow_key,
        )
        db.commit()
        return {}

    return post_hitl
