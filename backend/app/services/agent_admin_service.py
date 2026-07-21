"""Admin read-only helpers for Chat conversations and agent assist traces (gov-001c)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import AuditEventType
from app.models import AuditLog, ChatMessage, Conversation, User
from app.schemas import ChatAttachmentOut, ChatAgentTaskProposalOut, ChatAgentThinkingStepOut, ChatAgentToolCallOut, ChatMessageOut
from app.services.chat_agent_service import parse_agent_message_meta
from app.services.chat_message_content import chat_attachment_out


def list_admin_chat_conversations(
    db: Session,
    *,
    user_id: int | None = None,
    limit: int = 50,
) -> list[dict[str, object]]:
    stmt = (
        select(Conversation, User)
        .join(User, User.id == Conversation.user_id)
        .order_by(Conversation.updated_at.desc(), Conversation.id.desc())
        .limit(max(1, min(limit, 200)))
    )
    if user_id is not None:
        stmt = stmt.where(Conversation.user_id == user_id)

    rows: list[dict[str, object]] = []
    for conversation, user in db.execute(stmt).all():
        message_count = (
            db.scalar(
                select(func.count(ChatMessage.id)).where(ChatMessage.conversation_id == conversation.id)
            )
            or 0
        )
        rows.append(
            {
                "id": conversation.id,
                "title": conversation.title,
                "user_id": user.id,
                "user_name": user.name,
                "user_display_name": user.display_name or user.name,
                "model_provider_id": conversation.model_provider_id,
                "agent_thread_id": getattr(conversation, "agent_thread_id", None) or "",
                "message_count": message_count,
                "created_at": conversation.created_at,
                "updated_at": conversation.updated_at,
            }
        )
    return rows


def serialize_admin_chat_message(message: ChatMessage) -> ChatMessageOut:
    parsed = parse_agent_message_meta(message.content or "")
    return ChatMessageOut(
        id=message.id,
        role=message.role,
        content=parsed.visible_content,
        attachments=[
            ChatAttachmentOut(**chat_attachment_out(item))
            for item in (message.attachments_json or [])
            if isinstance(item, dict)
        ],
        created_at=message.created_at,
        agent_tool_calls=[
            ChatAgentToolCallOut(name=call.name, summary=call.summary) for call in parsed.tool_calls
        ],
        agent_task_proposals=[
            ChatAgentTaskProposalOut(**proposal)
            for proposal in parsed.task_proposals
            if isinstance(proposal, dict)
        ],
        agent_thinking_steps=[
            ChatAgentThinkingStepOut(**step) for step in parsed.thinking_steps if isinstance(step, dict)
        ],
        policy_version=parsed.policy_version,
    )


def list_admin_chat_messages(db: Session, *, conversation_id: int) -> list[ChatMessageOut]:
    messages = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
    ).all()
    return [serialize_admin_chat_message(message) for message in messages]


def list_admin_agent_traces(
    db: Session,
    *,
    conversation_id: int | None = None,
    actor_id: int | None = None,
    limit: int = 50,
) -> list[dict[str, object]]:
    stmt = (
        select(AuditLog)
        .where(
            AuditLog.event_type == AuditEventType.STUDIO_AGENT_ASSIST,
            AuditLog.target_type == "chat_agent",
        )
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(max(1, min(limit, 200)))
    )
    if actor_id is not None:
        stmt = stmt.where(AuditLog.actor_id == actor_id)

    traces: list[dict[str, object]] = []
    for row in db.scalars(stmt).all():
        details = row.details if isinstance(row.details, dict) else {}
        conv_id = details.get("conversation_id")
        if conversation_id is not None and conv_id != conversation_id:
            continue
        traces.append(
            {
                "id": row.id,
                "created_at": row.created_at,
                "actor_id": row.actor_id,
                "actor_name": row.actor_name,
                "conversation_id": conv_id,
                "provider_name": row.provider_name,
                "details": details,
            }
        )
    return traces
