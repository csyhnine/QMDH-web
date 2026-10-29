"""Ordinary stream completion: numeric receipts survive deletion, content does not."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.models import AuditLog, ChatMessage, Conversation
from app.services.billing import calculate_chat_billing, normalize_chat_usage
from app.services.chat_context import apply_message_input_tokens
from app.services.usage_ledger import record_chat_usage_ledger

EVENT = "chat.reply.call"
SOURCE = "chat_reply_calls"


def _session(db: Session) -> Session:
    bind = db.get_bind()
    return Session(bind=bind.engine if isinstance(bind, Connection) else bind, expire_on_commit=False)


def _live(tx: Session, conversation_id: int, user_id: int | None):
    query = select(Conversation).where(Conversation.id == conversation_id)
    if user_id is not None:
        query = query.where(Conversation.user_id == user_id)
    return tx.scalar(query)


def reply_conversation_live(db: Session, *, conversation_id: int, user_id: int | None) -> bool | None:
    try:
        with _session(db) as tx:
            return _live(tx, conversation_id, user_id) is not None
    except Exception:
        return None


def _receipt(tx: Session, receipt_id: int, lock: bool = False) -> AuditLog:
    if lock and tx.get_bind().dialect.name == "sqlite":
        # SQLite ignores FOR UPDATE. Acquire its writer lock before reading the
        # receipt, so ledger/memory status writers cannot restore stale JSON.
        tx.execute(update(AuditLog).where(AuditLog.id == receipt_id, AuditLog.event_type == EVENT).values(id=AuditLog.id))
    query = select(AuditLog).where(AuditLog.id == receipt_id, AuditLog.event_type == EVENT)
    row = tx.scalar(query.with_for_update() if lock else query)
    if row is None:
        raise ValueError("Reply receipt unavailable")
    return row


def begin_reply(db: Session, *, conversation_id: int, user_id: int | None, user_name: str,
                provider_id: int, provider_name: str, model_name: str) -> int:
    with _session(db) as tx:
        conversation = _live(tx, conversation_id, user_id)
        if conversation is None:
            raise ValueError("Reply conversation unavailable")
        row = AuditLog(event_type=EVENT, actor_id=user_id, actor_name=user_name,
                       target_type="chat_reply_call", target_id=conversation_id,
                       details={"call_id": uuid4().hex, "conversation_id": conversation_id,
                                "conversation_user_id": conversation.user_id, "provider_id": provider_id,
                                "provider_name": provider_name, "model_name": model_name,
                                "state": "admitted", "usage_known": False,
                                "pricing": calculate_chat_billing(tx, provider_profile_id=provider_id,
                                                                  usage=normalize_chat_usage({}))})
        tx.add(row)
        tx.flush()
        receipt_id = row.id
        tx.commit()
        return receipt_id


def reported_reply_usage(raw: object) -> dict[str, int]:
    reported = {}
    if isinstance(raw, dict):
        for key in ("prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens", "cached_input_tokens"):
            value = raw.get(key)
            if value is None or isinstance(value, bool):
                continue
            try:
                parsed = int(value)
                if parsed >= 0:
                    reported[key] = parsed
            except (ValueError, TypeError, OverflowError):
                pass
    return reported


def _stamp(value: datetime) -> str:
    return (value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)).isoformat()


def _message(tx: Session, details: dict) -> ChatMessage | None:
    message = tx.scalar(select(ChatMessage).where(ChatMessage.id == details.get("message_id"),
                        ChatMessage.conversation_id == details["conversation_id"]))
    if message is None or _stamp(message.created_at) != details.get("message_created_at"):
        return None
    return message


def _write(db: Session, receipt_id: int, *, content: str, payload: dict, known: bool,
           allow_delivery: bool, with_message: bool, outcome: str) -> dict:
    with _session(db) as tx:
        row = _receipt(tx, receipt_id, True)
        if row.details.get("state") == "completed":
            return dict(row.details)
        conversation = _live(tx, row.details["conversation_id"], row.actor_id)
        status = "revoked" if conversation is None else "unverified"
        message_id, created_at = None, None
        reported = reported_reply_usage(payload) if known else {}
        usage = normalize_chat_usage(reported)
        numeric = {key: getattr(usage, key) for key in ("prompt_tokens", "completion_tokens", "total_tokens",
                   "input_tokens", "output_tokens", "cached_input_tokens", "uncached_input_tokens")}
        if conversation is not None and allow_delivery and with_message and content:
            message = ChatMessage(conversation_id=conversation.id, role="assistant", content=content,
                                  token_count=usage.total_tokens, created_at=datetime.now(timezone.utc))
            apply_message_input_tokens(message)
            tx.add(message)
            conversation.updated_at = datetime.now(timezone.utc)
            tx.flush()
            message_id, created_at, status = message.id, _stamp(message.created_at), "ready"
        details = {**row.details, "state": "completed", "outcome": outcome, "usage_known": bool(reported), "usage": numeric,
                   "message_id": message_id, "message_created_at": created_at, "delivery_status": status,
                   "ledger_status": "pending" if reported else "unknown", "memory_status": "not_attempted",
                   "completed_at": datetime.now(timezone.utc).isoformat()}
        row.details = details
        tx.commit()
        return details


def _read_completed(db: Session, receipt_id: int) -> dict | None:
    with _session(db) as tx:
        row = _receipt(tx, receipt_id)
        return dict(row.details) if row.details.get("state") == "completed" else None



def settle_reply_usage(db: Session, receipt_id: int) -> bool:
    from app.services.chat_usage_recovery_service import settle_chat_usage_receipt
    return settle_chat_usage_receipt(db, receipt_id, expected_event=EVENT, writer=record_chat_usage_ledger)

def _finish_memory(db: Session, details: dict, *, user_id: int | None, user_message: str,
                   content: str, record_memory: bool, writer) -> str:
    if not record_memory or user_id is None or content.startswith("对话失败"):
        return "skipped"
    try:
        with _session(db) as tx:
            if _live(tx, details["conversation_id"], user_id) is None:
                return "revoked"
            writer(tx, user_id=user_id, conversation_id=details["conversation_id"], user_message=user_message,
                   assistant_reply=content, route="chat")
            tx.commit()
            return "completed"
    except Exception:
        return "failed"


def _claim_memory(db: Session, receipt_id: int) -> bool:
    try:
        with _session(db) as tx:
            row = _receipt(tx, receipt_id, True)
            if row.details.get("memory_status") != "not_attempted":
                return False
            row.details = {**row.details, "memory_status": "started"}
            tx.commit()
            return True
    except Exception:
        return False  # An unknown claim commit is never blindly retried.


def finish_reply(db: Session, receipt_id: int, *, content: str, usage_payload: dict, usage_known: bool,
                 allow_delivery: bool, user_id: int | None, user_message: str, record_memory: bool, memory_writer,
                 outcome: str) -> ChatMessage | None:
    details = None
    for attempt in range(2):
        try:
            details = _write(db, receipt_id, content=content, payload=usage_payload, known=usage_known,
                             allow_delivery=allow_delivery, with_message=True, outcome=outcome)
            break
        except Exception:
            try:
                details = _read_completed(db, receipt_id)
                if details is not None:
                    break
            except Exception:
                pass
    if details is None:
        try:
            details = _write(db, receipt_id, content="", payload=usage_payload, known=usage_known,
                             allow_delivery=False, with_message=False, outcome=outcome)
        except Exception:
            return None
    try:
        settle_reply_usage(db, receipt_id)
    except Exception:
        pass  # Independently committed numeric usage is pending, not zero.
    memory = "not_attempted"
    if allow_delivery and details.get("delivery_status") == "ready" and _claim_memory(db, receipt_id):
        memory = _finish_memory(db, details, user_id=user_id, user_message=user_message,
                                content=content, record_memory=record_memory, writer=memory_writer)
    try:
        with _session(db) as tx:
            row = _receipt(tx, receipt_id, True)
            if memory != "not_attempted":
                row.details = {**row.details, "memory_status": memory}
                tx.commit()
            if not allow_delivery or _live(tx, details["conversation_id"], row.actor_id) is None:
                return None
            return _message(tx, details)
    except Exception:
        return None
