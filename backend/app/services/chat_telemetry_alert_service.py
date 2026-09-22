"""Evaluate Chat UX telemetry thresholds and persist alert records."""

from __future__ import annotations

import logging
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ChatTelemetryAlert, ChatTurnTelemetry
from app.services.chat_telemetry_dashboard_service import SUCCESS_OUTCOMES, _merge_client_event_totals, _percentile

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AlertRule:
    key: str
    severity: str
    title: str

    def message(self, metrics: dict[str, object]) -> str:
        raise NotImplementedError

    def is_triggered(self, metrics: dict[str, object]) -> bool:
        raise NotImplementedError


def _window_since(hours: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=max(1, hours))


def compute_chat_window_metrics(db: Session, *, window_hours: int) -> dict[str, object]:
    since = _window_since(window_hours)
    turns = db.scalars(
        select(ChatTurnTelemetry).where(
            ChatTurnTelemetry.started_at >= since,
            ChatTurnTelemetry.outcome != "in_progress",
        )
    ).all()

    turn_count = len(turns)
    success_count = 0
    upstream_called_count = 0
    interrupted_count = 0
    stream_error_count = 0
    attachment_turn_count = 0
    pack_ms: list[int] = []
    client_event_totals: Counter[str] = Counter()

    for turn in turns:
        if turn.outcome in SUCCESS_OUTCOMES:
            success_count += 1
        if turn.upstream_called:
            upstream_called_count += 1
        if turn.outcome == "interrupted":
            interrupted_count += 1
        if turn.outcome == "stream_error":
            stream_error_count += 1
        if turn.attachment_count > 0:
            attachment_turn_count += 1
        if turn.pack_duration_ms > 0:
            pack_ms.append(turn.pack_duration_ms)
        _merge_client_event_totals(client_event_totals, turn.client_events_json)

    def rate(numerator: int) -> float:
        if turn_count <= 0:
            return 0.0
        return round(numerator / turn_count, 4)

    return {
        "window_hours": window_hours,
        "turn_count": turn_count,
        "success_rate": rate(success_count),
        "upstream_call_rate": rate(upstream_called_count),
        "interrupted_rate": rate(interrupted_count),
        "stream_error_rate": rate(stream_error_count),
        "attachment_turn_count": attachment_turn_count,
        "p95_pack_duration_ms": _percentile(pack_ms, 95),
        "client_event_totals": dict(client_event_totals),
        "client_error_count": int(client_event_totals.get("chat.stream.client_error", 0)),
        "blocked_busy_count": int(client_event_totals.get("chat.send.blocked_busy", 0)),
    }


class _UpstreamCallRateLowRule(AlertRule):
    def is_triggered(self, metrics: dict[str, object]) -> bool:
        turn_count = int(metrics.get("turn_count") or 0)
        if turn_count < settings.get_chat_telemetry_alert_min_turns():
            return False
        upstream_call_rate = float(metrics.get("upstream_call_rate") or 0)
        return upstream_call_rate < settings.get_chat_telemetry_alert_upstream_call_rate_min()

    def message(self, metrics: dict[str, object]) -> str:
        return (
            f"近 {metrics['window_hours']} 小时 upstream 调用率 "
            f"{float(metrics['upstream_call_rate']) * 100:.1f}% "
            f"（阈值 {settings.get_chat_telemetry_alert_upstream_call_rate_min() * 100:.0f}%），"
            f"共 {metrics['turn_count']} 轮次。"
        )


class _SuccessRateLowRule(AlertRule):
    def is_triggered(self, metrics: dict[str, object]) -> bool:
        turn_count = int(metrics.get("turn_count") or 0)
        if turn_count < settings.get_chat_telemetry_alert_min_turns():
            return False
        success_rate = float(metrics.get("success_rate") or 0)
        return success_rate < settings.get_chat_telemetry_alert_success_rate_min()

    def message(self, metrics: dict[str, object]) -> str:
        return (
            f"近 {metrics['window_hours']} 小时 Chat 成功率 "
            f"{float(metrics['success_rate']) * 100:.1f}% "
            f"（阈值 {settings.get_chat_telemetry_alert_success_rate_min() * 100:.0f}%），"
            f"共 {metrics['turn_count']} 轮次。"
        )


class _InterruptedRateHighRule(AlertRule):
    def is_triggered(self, metrics: dict[str, object]) -> bool:
        turn_count = int(metrics.get("turn_count") or 0)
        if turn_count < settings.get_chat_telemetry_alert_min_turns():
            return False
        interrupted_rate = float(metrics.get("interrupted_rate") or 0)
        return interrupted_rate > settings.get_chat_telemetry_alert_interrupted_rate_max()

    def message(self, metrics: dict[str, object]) -> str:
        return (
            f"近 {metrics['window_hours']} 小时连接中断占比 "
            f"{float(metrics['interrupted_rate']) * 100:.1f}% "
            f"（阈值 {settings.get_chat_telemetry_alert_interrupted_rate_max() * 100:.0f}%），"
            f"共 {metrics['turn_count']} 轮次。"
        )


class _PackP95HighRule(AlertRule):
    def is_triggered(self, metrics: dict[str, object]) -> bool:
        attachment_turn_count = int(metrics.get("attachment_turn_count") or 0)
        if attachment_turn_count < settings.get_chat_telemetry_alert_min_attachment_turns():
            return False
        p95 = int(metrics.get("p95_pack_duration_ms") or 0)
        return p95 > settings.get_chat_telemetry_alert_pack_p95_ms_max()

    def message(self, metrics: dict[str, object]) -> str:
        p95 = int(metrics.get("p95_pack_duration_ms") or 0)
        return (
            f"近 {metrics['window_hours']} 小时带附件轮次 Pack P95 "
            f"{p95 / 1000:.1f}s（阈值 {settings.get_chat_telemetry_alert_pack_p95_ms_max() / 1000:.0f}s），"
            f"带附件轮次 {metrics['attachment_turn_count']}。"
        )


ALERT_RULES: tuple[AlertRule, ...] = (
    _UpstreamCallRateLowRule("upstream_call_rate_low", "critical", "上游调用率偏低"),
    _SuccessRateLowRule("success_rate_low", "warning", "Chat 成功率偏低"),
    _InterruptedRateHighRule("interrupted_rate_high", "warning", "连接中断占比偏高"),
    _PackP95HighRule("pack_p95_high", "warning", "附件 Pack 耗时偏高"),
)


def _serialize_alert(alert: ChatTelemetryAlert) -> dict[str, object]:
    return {
        "id": alert.id,
        "alert_key": alert.alert_key,
        "severity": alert.severity,
        "title": alert.title,
        "message": alert.message,
        "status": alert.status,
        "window_hours": alert.window_hours,
        "metrics": alert.metrics_json or {},
        "occurrence_count": alert.occurrence_count,
        "first_seen_at": alert.first_seen_at,
        "last_seen_at": alert.last_seen_at,
        "resolved_at": alert.resolved_at,
    }


def list_chat_telemetry_alerts(
    db: Session,
    *,
    status: str = "open",
    limit: int = 20,
) -> list[dict[str, object]]:
    stmt = select(ChatTelemetryAlert).order_by(ChatTelemetryAlert.last_seen_at.desc()).limit(max(1, min(limit, 100)))
    normalized_status = (status or "open").strip().lower()
    if normalized_status != "all":
        stmt = stmt.where(ChatTelemetryAlert.status == normalized_status)
    rows = db.scalars(stmt).all()
    return [_serialize_alert(row) for row in rows]


def evaluate_chat_telemetry_alerts(db: Session) -> dict[str, object]:
    window_hours = settings.get_chat_telemetry_alert_window_hours()
    metrics = compute_chat_window_metrics(db, window_hours=window_hours)
    now = datetime.now(timezone.utc)
    triggered_keys: set[str] = set()
    created = 0
    updated = 0
    resolved = 0

    for rule in ALERT_RULES:
        triggered = rule.is_triggered(metrics)
        existing = db.scalar(
            select(ChatTelemetryAlert)
            .where(ChatTelemetryAlert.alert_key == rule.key, ChatTelemetryAlert.status == "open")
            .order_by(ChatTelemetryAlert.id.desc())
        )

        if triggered:
            triggered_keys.add(rule.key)
            message = rule.message(metrics)
            if existing is None:
                db.add(
                    ChatTelemetryAlert(
                        alert_key=rule.key,
                        severity=rule.severity,
                        title=rule.title,
                        message=message,
                        status="open",
                        window_hours=window_hours,
                        metrics_json=metrics,
                        occurrence_count=1,
                        first_seen_at=now,
                        last_seen_at=now,
                    )
                )
                created += 1
                logger.warning(
                    "chat telemetry alert opened",
                    extra={"alert_key": rule.key, "severity": rule.severity, "alert_message": message},
                )
            else:
                existing.message = message
                existing.metrics_json = metrics
                existing.window_hours = window_hours
                existing.last_seen_at = now
                existing.occurrence_count = int(existing.occurrence_count or 0) + 1
                db.add(existing)
                updated += 1
        elif existing is not None:
            existing.status = "resolved"
            existing.resolved_at = now
            existing.last_seen_at = now
            db.add(existing)
            resolved += 1
            logger.info(
                "chat telemetry alert resolved",
                extra={"alert_key": rule.key},
            )

    db.commit()
    return {
        "window_hours": window_hours,
        "metrics": metrics,
        "triggered_keys": sorted(triggered_keys),
        "created": created,
        "updated": updated,
        "resolved": resolved,
    }


def run_chat_telemetry_alerts_once(session_factory) -> dict[str, object]:
    if not settings.get_chat_telemetry_alerts_enabled():
        return {"skipped": True}
    with session_factory() as db:
        return evaluate_chat_telemetry_alerts(db)
