"""LangGraph multi-agent orchestration graph."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from langgraph.graph import END, StateGraph
from langgraph.types import Command
from sqlalchemy.orm import Session

from app.integrations.multi_agent.checkpoint import get_multi_agent_checkpointer
from app.integrations.multi_agent.nodes import (
    make_await_hitl_node,
    make_direct_node,
    make_load_memory_node,
    make_post_hitl_node,
    make_route_node,
    make_specialist_node,
    make_synthesize_node,
    make_write_memory_node,
)
from app.integrations.multi_agent.state import MultiAgentState, ThinkingCallback
from app.integrations.studio_agent.agent import ChatAgentThinkingStep


@dataclass(frozen=True)
class GraphRunResult:
    state: MultiAgentState
    interrupted: bool
    interrupt_payload: dict[str, object] | None = None


def _route_selector(state: MultiAgentState) -> Literal["research", "studio", "direct"]:
    route = (state.get("route") or "direct").strip()
    if route in {"research", "studio", "direct"}:
        return route  # type: ignore[return-value]
    return "direct"


def _after_research_selector(state: MultiAgentState) -> Literal["studio", "synthesize"]:
    if state.get("next_after_research") == "studio":
        return "studio"
    return "synthesize"


def build_multi_agent_graph(db: Session, thinking_callback: ThinkingCallback):
    graph: StateGraph = StateGraph(MultiAgentState)
    graph.add_node("load_memory", make_load_memory_node(db))
    graph.add_node("dispatch_route", make_route_node(db))
    graph.add_node("research", make_specialist_node(db, role="research", thinking_callback=thinking_callback))
    graph.add_node("studio", make_specialist_node(db, role="studio", thinking_callback=thinking_callback))
    graph.add_node("direct", make_direct_node(db, thinking_callback))
    graph.add_node("synthesize", make_synthesize_node())
    graph.add_node("write_memory", make_write_memory_node(db))
    graph.add_node("await_hitl", make_await_hitl_node())
    graph.add_node("post_hitl", make_post_hitl_node(db))

    graph.set_entry_point("load_memory")
    graph.add_edge("load_memory", "dispatch_route")
    graph.add_conditional_edges(
        "dispatch_route",
        _route_selector,
        {
            "research": "research",
            "studio": "studio",
            "direct": "direct",
        },
    )
    graph.add_conditional_edges(
        "research",
        _after_research_selector,
        {
            "studio": "studio",
            "synthesize": "synthesize",
        },
    )
    graph.add_edge("studio", "synthesize")
    graph.add_edge("direct", "synthesize")
    graph.add_edge("synthesize", "write_memory")
    graph.add_edge("write_memory", "await_hitl")
    graph.add_edge("await_hitl", "post_hitl")
    graph.add_edge("post_hitl", END)
    return graph.compile(checkpointer=get_multi_agent_checkpointer())


def _extract_interrupt_payload(result: MultiAgentState) -> dict[str, object] | None:
    raw = result.get("__interrupt__")
    if not raw:
        return None
    if isinstance(raw, list) and raw:
        first = raw[0]
        value = getattr(first, "value", None)
        if isinstance(value, dict):
            return value
    return None


def _emit_route_thinking(result: MultiAgentState, thinking_callback: ThinkingCallback) -> None:
    if thinking_callback is None:
        return
    route = str(result.get("original_route") or result.get("route") or "direct")
    coordinator_key = result.get("active_persona_key") or "qmdh-coordinator"
    coordinator_label = result.get("active_persona_label") or "协调助手"
    thinking_callback(
        ChatAgentThinkingStep(
            key=f"route_{route}",
            label="路由决策",
            detail={
                "research": "已交由检索助手",
                "studio": "已交由生图助手",
                "direct": "协调助手直接回复",
                "research_then_studio": "先检索再交由生图助手",
            }.get(route, str(result.get("route_reason") or route)),
            status="done",
            agent_key=coordinator_key,
            agent_label=coordinator_label,
        )
    )


def run_multi_agent_graph(
    db: Session,
    *,
    state: MultiAgentState,
    thinking_callback: ThinkingCallback,
    thread_id: str,
) -> GraphRunResult:
    graph = build_multi_agent_graph(db, thinking_callback)
    config = {"configurable": {"thread_id": thread_id}}
    result = graph.invoke(state, config=config)
    interrupted = "__interrupt__" in result
    interrupt_payload = _extract_interrupt_payload(result) if interrupted else None
    _emit_route_thinking(result, thinking_callback)
    return GraphRunResult(state=result, interrupted=interrupted, interrupt_payload=interrupt_payload)


def graph_has_pending_interrupt(db: Session, *, thread_id: str) -> bool:
    graph = build_multi_agent_graph(db, thinking_callback=None)
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = graph.get_state(config)
    return bool(snapshot.next)


def resume_multi_agent_graph(
    db: Session,
    *,
    thread_id: str,
    resume_payload: dict[str, object],
    thinking_callback: ThinkingCallback = None,
) -> GraphRunResult:
    graph = build_multi_agent_graph(db, thinking_callback)
    config = {"configurable": {"thread_id": thread_id}}
    result = graph.invoke(Command(resume=resume_payload), config=config)
    interrupted = "__interrupt__" in result
    interrupt_payload = _extract_interrupt_payload(result) if interrupted else None
    return GraphRunResult(state=result, interrupted=interrupted, interrupt_payload=interrupt_payload)
