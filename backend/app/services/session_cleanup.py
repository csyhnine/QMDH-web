from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.logging import correlation_id_var, generate_correlation_id
from app.models import AuthSession

logger = logging.getLogger(__name__)

REVOKED_SESSION_RETENTION = timedelta(days=30)


@dataclass(frozen=True)
class SessionCleanupResult:
    expired_deleted: int = 0
    revoked_deleted: int = 0
    failed_batches: tuple[str, ...] = ()

    @property
    def total_deleted(self) -> int:
        return self.expired_deleted + self.revoked_deleted


def _run_delete_batch(db: Session, *, label: str, statement) -> tuple[int, bool]:
    try:
        result = db.execute(statement)
        db.commit()
        return int(result.rowcount or 0), False
    except Exception:
        db.rollback()
        logger.exception("Session cleanup batch failed", extra={"batch": label})
        return 0, True


def cleanup_sessions(db: Session, *, now: datetime | None = None) -> SessionCleanupResult:
    current_time = now or datetime.now(timezone.utc)
    revoked_cutoff = current_time - REVOKED_SESSION_RETENTION

    expired_deleted, expired_failed = _run_delete_batch(
        db,
        label="expired_active_sessions",
        statement=delete(AuthSession).where(
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at < current_time,
        ),
    )
    revoked_deleted, revoked_failed = _run_delete_batch(
        db,
        label="stale_revoked_sessions",
        statement=delete(AuthSession).where(
            AuthSession.revoked_at.is_not(None),
            AuthSession.revoked_at < revoked_cutoff,
        ),
    )

    failed_batches = tuple(
        label
        for label, failed in (
            ("expired_active_sessions", expired_failed),
            ("stale_revoked_sessions", revoked_failed),
        )
        if failed
    )

    return SessionCleanupResult(
        expired_deleted=expired_deleted,
        revoked_deleted=revoked_deleted,
        failed_batches=failed_batches,
    )


def run_session_cleanup_once(
    session_factory: Callable[[], Session],
    *,
    now: datetime | None = None,
) -> SessionCleanupResult:
    token = correlation_id_var.set(generate_correlation_id())
    try:
        with session_factory() as db:
            result = cleanup_sessions(db, now=now)
        logger.info(
            "Session cleanup finished",
            extra={
                "expired_deleted": result.expired_deleted,
                "revoked_deleted": result.revoked_deleted,
                "total_deleted": result.total_deleted,
                "failed_batches": list(result.failed_batches),
            },
        )
        return result
    finally:
        correlation_id_var.reset(token)
