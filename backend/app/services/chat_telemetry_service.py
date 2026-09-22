"""Chat turn telemetry for UX funnel analysis."""
from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logging import get_correlation_id
from app.models import ChatTurnTelemetry
from app.services.chat_message_content import attachment_kind_for_path
from app.services.media_storage import resolve_storage_path

logger = logging.getLogger(__name__)

CHAT_TURN_OUTCOMES = frozenset(
    {
        "in_progress",
        "success",
        "upstream_error",
        "attachment_error",
        "interrupted",
        "stream_error",
        "agent_success",
        "agent_error",
    }
)


def _now_ms(since: float) -> int:
    return max(int((time.perf_counter() - since) * 1000), 0)


def summarize_chat_attachments(attachments: list[dict[str, str]]) -> tuple[int, list[str], int]:
    attachment_types: list[str] = []
    total_bytes = 0
    for item in attachments:
        storage_path = str(item.get("storage_path") or "").strip()
        if not storage_path:
            continue
        suffix = Path(storage_path).suffix.lower().lstrip(".")
        kind = str(item.get("kind") or "").strip().lower()
        if not kind:
            try:
                kind = attachment_kind_for_path(storage_path, "")
            except Exception:
                kind = "unknown"
        attachment_types.append(suffix or kind or "unknown")
        try:
            total_bytes += os.path.getsize(resolve_storage_path(storage_path))
        except OSError:
            continue
    return len(attachments), attachment_types, total_bytes


def begin_chat_turn(
    db: Session,
    *,
    conversation_id: int,
    user_id: int | None,
    user_message_id: int | None,
    provider_name: str,
    model_name: str,
    content_length: int,
    attachments: list[dict[str, str]],
    agent_mode: bool = False,
    correlation_id: str | None = None,
) -> ChatTurnTelemetry:
    attachment_count, attachment_types, attachment_total_bytes = summarize_chat_attachments(attachments)
    turn = ChatTurnTelemetry(
        correlation_id=(correlation_id or get_correlation_id() or "").strip()[:64],
        conversation_id=conversation_id,
        user_id=user_id,
        user_message_id=user_message_id,
        provider_name=provider_name,
        model_name=model_name,
        agent_mode=agent_mode,
        outcome="in_progress",
        attachment_count=attachment_count,
        attachment_types_json=attachment_types,
        attachment_total_bytes=attachment_total_bytes,
        content_length=max(int(content_length or 0), 0),
    )
    db.add(turn)
    db.commit()
    db.refresh(turn)
    return turn


@dataclass
class ChatTurnTracker:
    turn_id: int
    started_at: float = field(default_factory=time.perf_counter)
    pack_started_at: float | None = None
    upstream_started_at: float | None = None
    ttft_ms: int = 0
    upstream_called: bool = False
    stage_events: list[dict[str, object]] = field(default_factory=list)

    def note_stage(self, label: str) -> None:
        self.stage_events.append({"label": label, "elapsed_ms": _now_ms(self.started_at)})

    def mark_pack_start(self) -> None:
        self.pack_started_at = time.perf_counter()
        self.note_stage("pack.start")

    def mark_pack_end(self, *, context_tokens: int, context_usage_percent: int) -> None:
        self.note_stage("pack.end")
        self._context_tokens = context_tokens
        self._context_usage_percent = context_usage_percent

    def mark_upstream_start(self) -> None:
        self.upstream_called = True
        self.upstream_started_at = time.perf_counter()
        self.note_stage("upstream.start")

    def mark_first_token(self) -> None:
        if self.ttft_ms <= 0:
            self.ttft_ms = _now_ms(self.started_at)
            self.note_stage("upstream.first_token")

    def finalize(
        self,
        db: Session,
        *,
        outcome: str,
        error_code: str = "",
        error_summary: str = "",
        assistant_message_id: int | None = None,
        context_tokens: int = 0,
        context_usage_percent: int = 0,
    ) -> None:
        turn = db.get(ChatTurnTelemetry, self.turn_id)
        if turn is None:
            return

        pack_duration_ms = 0
        if self.pack_started_at is not None:
            end = self.upstream_started_at or time.perf_counter()
            pack_duration_ms = max(int((end - self.pack_started_at) * 1000), 0)

        upstream_duration_ms = 0
        if self.upstream_started_at is not None:
            upstream_duration_ms = max(int((time.perf_counter() - self.upstream_started_at) * 1000), 0)

        resolved_outcome = outcome if outcome in CHAT_TURN_OUTCOMES else "stream_error"
        turn.outcome = resolved_outcome
        turn.error_code = (error_code or "")[:80]
        turn.error_summary = (error_summary or "")[:255]
        turn.assistant_message_id = assistant_message_id
        turn.pack_duration_ms = pack_duration_ms
        turn.upstream_duration_ms = upstream_duration_ms
        turn.ttft_ms = self.ttft_ms
        turn.total_duration_ms = _now_ms(self.started_at)
        turn.upstream_called = self.upstream_called
        turn.context_tokens = context_tokens or getattr(self, "_context_tokens", 0)
        turn.context_usage_percent = context_usage_percent or getattr(self, "_context_usage_percent", 0)
        turn.stage_events_json = list(self.stage_events)
        turn.completed_at = datetime.now(timezone.utc)
        db.add(turn)
        db.commit()

        logger.info(
            "chat turn telemetry",
            extra={
                "chat_turn_id": turn.id,
                "correlation_id": turn.correlation_id,
                "conversation_id": turn.conversation_id,
                "user_id": turn.user_id,
                "outcome": turn.outcome,
                "error_code": turn.error_code,
                "attachment_count": turn.attachment_count,
                "attachment_total_bytes": turn.attachment_total_bytes,
                "pack_duration_ms": turn.pack_duration_ms,
                "upstream_called": turn.upstream_called,
                "upstream_duration_ms": turn.upstream_duration_ms,
                "ttft_ms": turn.ttft_ms,
                "total_duration_ms": turn.total_duration_ms,
            },
        )


def resolve_outcome_from_error_code(error_code: str) -> str:
    code = (error_code or "").strip().lower()
    if not code:
        return "interrupted"
    if code.startswith("chat_upstream"):
        return "upstream_error"
    if code == "chat_attachment_error":
        return "attachment_error"
    if code == "chat_stream_interrupted":
        return "interrupted"
    return "stream_error"


def append_client_telemetry_events(
    db: Session,
    *,
    correlation_id: str,
    user_id: int | None,
    events: list[dict[str, object]],
) -> int:
    cid = correlation_id.strip()[:64]
    if not cid or not events:
        return 0

    turn = db.scalar(
        select(ChatTurnTelemetry)
        .where(ChatTurnTelemetry.correlation_id == cid)
        .order_by(ChatTurnTelemetry.id.desc())
    )
    if turn is None:
        return 0
    if user_id is not None and turn.user_id not in (None, user_id):
        return 0

    merged = list(turn.client_events_json or [])
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    for item in events:
        if not isinstance(item, dict):
            continue
        event_name = str(item.get("event") or item.get("name") or "").strip()
        if not event_name:
            continue
        merged.append(
            {
                "event": event_name[:80],
                "detail": str(item.get("detail") or "")[:500],
                "client_ts_ms": int(item.get("client_ts_ms") or now_ms),
            }
        )
    turn.client_events_json = merged[-50:]
    db.add(turn)
    db.commit()
    return len(events)
