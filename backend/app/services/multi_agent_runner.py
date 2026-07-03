"""Entry point for Chat multi-agent mode (delegates to unified harness)."""

from __future__ import annotations

from typing import Callable

from sqlalchemy.orm import Session

from app.integrations.multi_agent.graph import graph_has_pending_interrupt, resume_multi_agent_graph
from app.integrations.studio_agent.agent import ChatAgentThinkingStep, StudioAgentReply
from app.models import ChatMessage
from app.services.agent_harness_service import ensure_conversation_thread_id, run_chat_agent_harness


def run_multi_agent_chat_isolated(
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
) -> StudioAgentReply:
    from app.database import SessionLocal

    with SessionLocal() as db:
        result = run_chat_agent_harness(
            db,
            recent_messages=recent_messages,
            new_content=new_content,
            user_name=user_name,
            user_id=user_id,
            conversation_id=conversation_id,
            provider_id=provider_id,
            policy_version=policy_version,
            attachment_names=attachment_names,
            thinking_callback=thinking_callback,
        )
        db.commit()
        result.reply._harness_trace = result.trace  # type: ignore[attr-defined]
        result.reply._harness_audit = result.audit_details  # type: ignore[attr-defined]
        return result.reply


def get_harness_audit(reply: StudioAgentReply) -> dict[str, object]:
    audit = getattr(reply, "_harness_audit", None)
    if isinstance(audit, dict):
        return audit
    return {}


def resume_multi_agent_graph_after_task_confirm(
    db: Session,
    *,
    conversation_id: int,
    proposal_id: str,
    task_id: int,
    workflow_key: str,
) -> bool:
    thread_id = ensure_conversation_thread_id(db, conversation_id)
    if not graph_has_pending_interrupt(db, thread_id=thread_id):
        return False

    resume_multi_agent_graph(
        db,
        thread_id=thread_id,
        resume_payload={
            "status": "confirmed",
            "proposal_id": proposal_id,
            "task_id": task_id,
            "workflow_key": workflow_key,
        },
    )
    return True
