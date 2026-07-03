from __future__ import annotations

import operator
from typing import Annotated, Any, Callable

from typing_extensions import TypedDict

from app.integrations.studio_agent.agent import ChatAgentThinkingStep, ChatAgentToolCall


class MultiAgentState(TypedDict, total=False):
    message: str
    user_id: int
    user_name: str
    conversation_id: int
    provider_id: int | None
    policy_version: str | None
    memory_context: str
    route: str
    specialist_text: str
    final_text: str
    tool_calls: Annotated[list[ChatAgentToolCall], operator.add]
    task_proposals: Annotated[list[dict[str, object]], operator.add]
    thinking_steps: Annotated[list[dict[str, str]], operator.add]
    policy_version_out: str
    provider_name: str
    model_name: str
    roster_keys: list[str]
    active_persona_key: str
    active_persona_label: str
    user_message_raw: str
    original_route: str
    route_reason: str
    route_confidence: float
    route_method: str
    memory_hit_count: int
    session_summary_used: bool
    chain_to_studio: bool
    next_after_research: str
    hitl_status: str
    hitl_resume: dict[str, object]


ThinkingCallback = Callable[[ChatAgentThinkingStep], None] | None
