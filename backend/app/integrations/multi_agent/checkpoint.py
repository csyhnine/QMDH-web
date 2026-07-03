"""LangGraph checkpointer: Postgres in production, MemorySaver for SQLite/dev."""

from __future__ import annotations

import logging
import re
from typing import Any

from langgraph.checkpoint.memory import MemorySaver

from app.core.config import settings

logger = logging.getLogger(__name__)

_checkpointer: Any | None = None
_checkpointer_cm: Any | None = None
_setup_done = False


def _normalize_postgres_url(database_url: str) -> str:
    normalized = database_url.strip()
    normalized = re.sub(r"^postgresql\+psycopg://", "postgresql://", normalized)
    normalized = re.sub(r"^postgres\+psycopg://", "postgresql://", normalized)
    return normalized


def _is_postgres_url(database_url: str) -> bool:
    lowered = database_url.strip().lower()
    return lowered.startswith("postgresql") or lowered.startswith("postgres:")


def ensure_multi_agent_checkpoint_setup() -> None:
    """Create LangGraph checkpoint tables when using Postgres."""
    get_multi_agent_checkpointer()


def get_multi_agent_checkpointer():
    global _checkpointer, _checkpointer_cm, _setup_done

    if _checkpointer is not None:
        return _checkpointer

    database_url = settings.database_url
    if not _is_postgres_url(database_url):
        _checkpointer = MemorySaver()
        return _checkpointer

    try:
        from langgraph.checkpoint.postgres import PostgresSaver
    except ImportError as exc:
        logger.warning("PostgresSaver unavailable (%s); using MemorySaver", exc)
        _checkpointer = MemorySaver()
        return _checkpointer

    pg_url = _normalize_postgres_url(database_url)
    _checkpointer_cm = PostgresSaver.from_conn_string(pg_url)
    _checkpointer = _checkpointer_cm.__enter__()
    if not _setup_done:
        _checkpointer.setup()
        _setup_done = True
        logger.info("LangGraph Postgres checkpointer initialized")
    return _checkpointer
