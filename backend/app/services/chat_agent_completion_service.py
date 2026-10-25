"""Agent completion receipts: metadata survives chat deletion; content never does.

The receipt is an AuditLog row, so no new schema or content archive is needed.
Only a completed receipt can settle usage; settlement never invokes a provider.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.models import AuditLog, ChatMessage, Conversation
from app.services.billing import calculate_chat_billing, normalize_chat_usage
from app.services.chat_agent_service import embed_agent_message_meta
from app.services.chat_context import apply_message_input_tokens
from app.services.usage_ledger import record_chat_usage_ledger

EVENT = "chat.agent.call"
SOURCE = "chat_agent_calls"


def _session(db: Session) -> Session:
    bind = db.get_bind()
    return Session(bind=bind.engine if isinstance(bind, Connection) else bind, expire_on_commit=False)


def _receipt(db: Session, receipt_id: int, *, lock: bool = False) -> AuditLog:
    if lock and db.get_bind().dialect.name == "sqlite":
        db.connection().exec_driver_sql("UPDATE audit_logs SET id = id WHERE id = ?", (receipt_id,))
    query = select(AuditLog).where(AuditLog.id == receipt_id, AuditLog.event_type == EVENT)
    row = db.scalar((query.with_for_update() if lock else query).execution_options(populate_existing=True))
    if row is None:
        raise ValueError("Agent call receipt unavailable")
    return row


def start_agent_call(db: Session, *, call_id: str, conversation_id: int, user_id: int | None,
                     user_name: str, provider_id: int | None) -> int:
    """Admission must commit before any model/tool call. Never settle caller DB."""
    with _session(db) as tx:
        row = AuditLog(event_type=EVENT, actor_name=user_name, actor_id=user_id,
                       target_type="chat_agent_call", target_id=conversation_id,
                       details={"call_id": call_id, "conversation_id": conversation_id,
                                "conversation_user_id": tx.scalar(select(Conversation.user_id).where(Conversation.id == conversation_id)),
                                "provider_id": provider_id, "state": "admitted", "usage_known": False,
                                "pricing": calculate_chat_billing(tx, provider_profile_id=provider_id,
                                                                  usage=normalize_chat_usage({}))})
        tx.add(row)
        tx.flush()
        receipt_id = row.id
        tx.commit()
        return receipt_id


def fail_agent_call(db: Session, receipt_id: int) -> None:
    """An exception supplies no trustworthy usage; do not invent a zero ledger."""
    try:
        with _session(db) as tx:
            row = _receipt(tx, receipt_id, lock=True)
            if row.details.get("state") == "admitted":
                row.details = {**row.details, "state": "failed", "usage_known": False,
                               "error_code": "agent_completion_unavailable"}
                tx.commit()
    except Exception:
        pass  # Preserve the original exception, without logging content or SQL.


def _known_usage(reply: Any) -> dict[str, int]:
    raw = dict(reply.usage_payload or {})
    for key, value in (("prompt_tokens", reply.prompt_tokens), ("completion_tokens", reply.completion_tokens),
                       ("total_tokens", reply.total_tokens), ("input_tokens", reply.prompt_tokens),
                       ("output_tokens", reply.completion_tokens), ("cached_input_tokens", reply.cached_input_tokens)):
        # Preserve typed, positive counters from the completed result even if
        # the auxiliary payload omits, zeroes or corrupts the same counter.
        if key not in {"input_tokens", "output_tokens"} and value:
            raw[key] = value
        else:
            raw.setdefault(key, value)
    usage = normalize_chat_usage(raw)
    return {key: getattr(usage, key) for key in ("prompt_tokens", "completion_tokens", "total_tokens",
            "input_tokens", "output_tokens", "cached_input_tokens", "uncached_input_tokens")}


def _usage_is_known(reply: Any) -> bool:
    keys = {"prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens", "cached_input_tokens"}
    return bool(keys.intersection(reply.usage_payload or {})) or any(
        getattr(reply, key, 0) for key in ("prompt_tokens", "completion_tokens", "total_tokens", "cached_input_tokens"))


def _store_completed(db: Session, receipt_id: int, reply: Any, thinking_steps: list[dict],
                     *, with_message: bool) -> dict:
    with _session(db) as tx:
        row = _receipt(tx, receipt_id, lock=True)
        if row.details.get("state") == "completed":
            return dict(row.details)
        if row.details.get("state") != "admitted":
            raise ValueError("Agent call receipt already failed")
        details = dict(row.details)
        query = select(Conversation).where(Conversation.id == details["conversation_id"])
        if row.actor_id is not None:
            query = query.where(Conversation.user_id == row.actor_id)
        conversation = tx.scalar(query.with_for_update())
        message_id = None
        delivery = "revoked" if conversation is None else "unverified"
        if conversation is not None and with_message:
            content = embed_agent_message_meta(
                reply.text.strip() or "助手未返回内容，请重试。", tool_calls=reply.tool_calls,
                task_proposals=reply.task_proposals, thinking_steps=thinking_steps,
                policy_version=reply.policy_version)
            body, meta = content.rsplit("<!-- qmdh-agent-meta:", 1)
            metadata = json.loads(meta.removesuffix(" -->"))
            metadata["call_id"] = details["call_id"]
            content = body + "<!-- qmdh-agent-meta:" + json.dumps(metadata, ensure_ascii=False) + " -->"
            message = ChatMessage(conversation_id=conversation.id, role="assistant", content=content,
                                  token_count=max(int(reply.total_tokens or 0), 0))
            apply_message_input_tokens(message)
            tx.add(message)
            conversation.updated_at = datetime.now(timezone.utc)
            tx.flush()
            message_id, delivery = message.id, "ready"
        known = _usage_is_known(reply)
        details.update(state="completed", usage_known=known, usage=_known_usage(reply),
                       provider_name=reply.provider_name, model_name=reply.model_name,
                       message_id=message_id, delivery_status=delivery, ledger_status="pending" if known else "unknown",
                       completed_at=datetime.now(timezone.utc).isoformat())
        row.details = details
        tx.commit()
        return details


def _read_completed(db: Session, receipt_id: int) -> dict | None:
    with _session(db) as tx:
        row = _receipt(tx, receipt_id)
        return dict(row.details) if row.details.get("state") == "completed" else None


def load_agent_completion_message(db: Session, *, receipt_id: int, call_id: str,
                                  conversation_id: int) -> ChatMessage | None:
    row = _receipt(db, receipt_id)
    details = row.details
    if (details.get("state") != "completed" or details.get("call_id") != call_id
            or details.get("conversation_id") != conversation_id):
        return None
    message = db.scalar(select(ChatMessage).where(ChatMessage.id == details.get("message_id"),
                        ChatMessage.conversation_id == conversation_id).execution_options(populate_existing=True))
    if message is None:
        return None
    try:
        metadata = json.loads(message.content.rsplit("<!-- qmdh-agent-meta:", 1)[1].removesuffix(" -->"))
        return message if metadata.get("call_id") == call_id else None
    except (ValueError, IndexError, TypeError):
        return None



def settle_agent_call_usage(db: Session, receipt_id: int) -> bool:
    from app.services.chat_usage_recovery_service import settle_chat_usage_receipt
    return settle_chat_usage_receipt(db, receipt_id, expected_event=EVENT, writer=record_chat_usage_ledger)

def complete_agent_call(db: Session, receipt_id: int, reply: Any, *, thinking_steps: list[dict]) -> dict:
    try:
        details = _store_completed(db, receipt_id, reply, thinking_steps, with_message=True)
    except Exception:
        try:
            details = _read_completed(db, receipt_id)
            if details is None:
                # FK/content failure must not erase known model usage. No reply
                # text is copied to this metadata-only fallback transaction.
                details = _store_completed(db, receipt_id, reply, thinking_steps, with_message=False)
        except Exception:
            return {"call_receipt_id": receipt_id, "call_completion_status": "unverified",
                    "delivery_status": "unverified", "usage_ledger_status": "pending"}
    try:
        recorded = settle_agent_call_usage(db, receipt_id)
    except Exception:
        recorded = False
    return {"call_receipt_id": receipt_id, "call_completion_status": "completed",
            "completed_message_id": details.get("message_id"), "delivery_status": details["delivery_status"],
            "usage_ledger_status": "recorded" if recorded else ("pending" if details.get("usage_known") else "unknown")}
