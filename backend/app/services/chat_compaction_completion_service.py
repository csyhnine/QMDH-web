"""Compaction receipts retain numeric usage; summary content stays in its chat."""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.models import AuditLog, Conversation, User
from app.services.billing import calculate_chat_billing, normalize_chat_usage
from app.services.usage_ledger import record_chat_compaction_usage_ledger

EVENT = "chat.context.compaction"
SOURCE = "chat_compaction_calls"
CONTEXT_FIELDS = ("context_summary", "context_summary_until_message_id", "context_summary_updated_at",
                  "context_summary_tokens", "context_recent_tokens", "context_uncovered_tokens",
                  "context_packed_tokens", "context_stats_updated_at")
STAT_FIELDS = CONTEXT_FIELDS[3:]


class ChatContextUnavailable(HTTPException):
    def __init__(self):
        super().__init__(status_code=409, detail={"code": "chat_context_unavailable"})


def _session(db: Session) -> Session:
    bind = db.get_bind()
    return Session(bind=bind.engine if isinstance(bind, Connection) else bind, expire_on_commit=False)


def _receipt(tx: Session, receipt_id: int, *, lock: bool = False) -> AuditLog:
    if lock and tx.get_bind().dialect.name == "sqlite":
        tx.connection().exec_driver_sql("UPDATE audit_logs SET id = id WHERE id = ?", (receipt_id,))
    query = select(AuditLog).where(AuditLog.id == receipt_id, AuditLog.event_type == EVENT)
    row = tx.scalar(query.with_for_update() if lock else query)
    if row is None:
        raise ValueError("Compaction receipt unavailable")
    return row


def _conversation(tx: Session, conversation_id: int, user_id: int | None, *, lock: bool = False):
    query = select(Conversation).where(Conversation.id == conversation_id)
    if user_id is not None:
        query = query.where(Conversation.user_id == user_id)
    return tx.scalar(query.with_for_update() if lock else query)


def _context(conversation: Conversation | None) -> dict | None:
    return None if conversation is None else {f: getattr(conversation, f) for f in CONTEXT_FIELDS}


def begin_compaction(db: Session, *, conversation_id: int, user_id: int | None, provider_id: int | None,
                     provider_name: str, model_name: str, until_message_id: int) -> int:
    with _session(db) as tx:
        if _conversation(tx, conversation_id, user_id) is None:
            raise ChatContextUnavailable()
        owner = tx.get(User, user_id) if user_id is not None else None
        row = AuditLog(event_type=EVENT, actor_id=user_id,
                       actor_name=(owner.display_name or owner.name or "") if owner is not None else "",
                       target_type="chat_compaction", target_id=conversation_id,
                       details={"call_id": uuid4().hex, "conversation_id": conversation_id,
                                "provider_id": provider_id, "provider_name": provider_name, "model_name": model_name,
                                "until_message_id": until_message_id, "state": "admitted", "usage_known": False,
                                "pricing": calculate_chat_billing(tx, provider_profile_id=provider_id,
                                                                  usage=normalize_chat_usage({}))})
        tx.add(row)
        tx.flush()
        receipt_id = row.id
        tx.commit()
        return receipt_id


def fail_compaction(db: Session, receipt_id: int) -> None:
    try:
        with _session(db) as tx:
            row = _receipt(tx, receipt_id, lock=True)
            if row.details.get("state") == "admitted":
                row.details = {**row.details, "state": "failed", "usage_known": False}
                tx.commit()
    except Exception:
        pass


def _write_completed(db: Session, receipt_id: int, summary: str, usage_payload: dict, *,
                     base_summary: str, base_until: int | None, with_summary: bool) -> dict:
    with _session(db) as tx:
        row = _receipt(tx, receipt_id, lock=True)
        conversation = _conversation(tx, row.details["conversation_id"], row.actor_id, lock=True)
        if row.details.get("state") == "completed":
            return {"details": dict(row.details), "context": _context(conversation)}
        if row.details.get("state") != "admitted":
            raise ValueError("Compaction receipt already failed")
        status = "revoked" if conversation is None else "unverified"
        if conversation is not None and with_summary:
            status = "unchanged"
            if summary.strip():
                if ((conversation.context_summary or "") == base_summary
                        and conversation.context_summary_until_message_id == base_until):
                    conversation.context_summary = summary.strip()
                    conversation.context_summary_until_message_id = row.details["until_message_id"]
                    conversation.context_summary_updated_at = datetime.now(timezone.utc)
                    status = "stored"
                else:
                    status = "superseded"
        raw = usage_payload if isinstance(usage_payload, dict) else {}
        reported = {}
        for key in ("prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens", "cached_input_tokens"):
            value = raw.get(key)
            if value is None or isinstance(value, bool):
                continue
            try:
                parsed = int(value)
                if parsed >= 0:
                    reported[key] = parsed
            except (TypeError, ValueError, OverflowError):
                pass
        usage = normalize_chat_usage(reported)
        numeric = {key: getattr(usage, key) for key in ("prompt_tokens", "completion_tokens", "total_tokens",
                   "input_tokens", "output_tokens", "cached_input_tokens", "uncached_input_tokens")}
        known = bool(reported)
        details = {**row.details, "state": "completed", "usage_known": known, "usage": numeric,
                   "summary_status": status, "ledger_status": "pending" if known else "unknown",
                   "completed_at": datetime.now(timezone.utc).isoformat()}
        row.details = details
        tx.commit()
        return {"details": details, "context": _context(conversation)}


def _read_completed(db: Session, receipt_id: int) -> dict | None:
    with _session(db) as tx:
        row = _receipt(tx, receipt_id)
        if row.details.get("state") != "completed":
            return None
        return {"details": dict(row.details), "context": _context(_conversation(tx, row.details["conversation_id"], row.actor_id))}



def settle_compaction_usage(db: Session, receipt_id: int) -> bool:
    from app.services.chat_usage_recovery_service import settle_chat_usage_receipt
    return settle_chat_usage_receipt(db, receipt_id, expected_event=EVENT, writer=record_chat_compaction_usage_ledger)

def finish_compaction(db: Session, receipt_id: int, summary: str, usage_payload: dict, *,
                      base_summary: str, base_until: int | None) -> dict:
    result = None
    for attempt in range(2):
        try:
            result = _write_completed(db, receipt_id, summary, usage_payload,
                                      base_summary=base_summary, base_until=base_until, with_summary=True)
            break
        except Exception:
            try:
                result = _read_completed(db, receipt_id)
                if result is not None:
                    break
            except Exception:
                pass
    if result is None:
        try:
            result = _write_completed(db, receipt_id, summary, usage_payload,
                                      base_summary=base_summary, base_until=base_until, with_summary=False)
        except Exception:
            raise ChatContextUnavailable() from None
    try:
        settle_compaction_usage(db, receipt_id)
    except Exception:
        pass  # Completed numeric usage remains independently durable/pending.
    if result["context"] is None or result["details"]["summary_status"] in {"revoked", "unverified"}:
        raise ChatContextUnavailable()
    return result


def persist_context_stats(db: Session, *, conversation_id: int, user_id: int | None,
                          expected_summary: str, expected_until: int | None, stats: dict) -> dict:
    def checked(tx, lock=False):
        conversation = _conversation(tx, conversation_id, user_id, lock=lock)
        if (conversation is None or (conversation.context_summary or "") != expected_summary
                or conversation.context_summary_until_message_id != expected_until):
            raise ChatContextUnavailable()
        return conversation
    try:
        with _session(db) as tx:
            conversation = checked(tx, lock=True)
            for key in STAT_FIELDS:
                setattr(conversation, key, stats[key])
            tx.commit()
            return _context(conversation)
    except ChatContextUnavailable:
        raise
    except Exception:
        try:
            with _session(db) as check:
                return _context(checked(check))
        except Exception:
            raise ChatContextUnavailable() from None
