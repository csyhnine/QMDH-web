"""Structured logging configuration for QMDH backend.

Provides:
- JSON-formatted log output (default) for production log ingestion (ELK/Loki)
- Human-readable console output for local development
- Correlation ID propagation via contextvars
- Configurable log level via QMDH_LOG_LEVEL
- Configurable format via QMDH_LOG_FORMAT (json | console)
"""
from __future__ import annotations

import logging
import os
import sys
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone

from pythonjsonlogger import jsonlogger

JsonFormatter = jsonlogger.JsonFormatter

# --- Correlation ID ---

correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="")


def get_correlation_id() -> str:
    """Get the current correlation ID, or empty string if not set."""
    return correlation_id_var.get()


def set_correlation_id(value: str) -> None:
    """Set the correlation ID for the current context."""
    correlation_id_var.set(value)


def generate_correlation_id() -> str:
    """Generate a new UUID4 correlation ID."""
    return str(uuid.uuid4())


# --- Correlation ID Filter ---

class CorrelationIdFilter(logging.Filter):
    """Injects correlation_id from contextvar into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = get_correlation_id()  # type: ignore[attr-defined]
        return True


# --- JSON Formatter ---

class QMDHJsonFormatter(JsonFormatter):
    """Custom JSON formatter with QMDH-specific defaults."""

    def __init__(self) -> None:
        super().__init__(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            rename_fields={"asctime": "timestamp", "levelname": "level", "name": "logger"},
        )

    def formatTime(self, record: logging.LogRecord, datefmt: str | None = None) -> str:
        timestamp = datetime.fromtimestamp(record.created, tz=timezone.utc)
        return timestamp.isoformat(timespec="milliseconds").replace("+00:00", "Z")

    def add_fields(self, log_record: dict, record: logging.LogRecord, message_dict: dict) -> None:
        super().add_fields(log_record, record, message_dict)
        if not log_record.get("correlation_id"):
            log_record["correlation_id"] = getattr(record, "correlation_id", "") or ""
        for field in ("user_id", "project_code", "task_id"):
            value = getattr(record, field, None)
            if value is not None:
                log_record[field] = value


# --- Console Formatter ---

class QMDHConsoleFormatter(logging.Formatter):
    """Human-readable formatter for local development."""

    def __init__(self) -> None:
        super().__init__(
            fmt="%(asctime)s [%(levelname)-5s] %(name)s | %(message)s [%(correlation_id)s]",
            datefmt="%H:%M:%S",
        )

    def format(self, record: logging.LogRecord) -> str:
        if not hasattr(record, "correlation_id"):
            record.correlation_id = ""  # type: ignore[attr-defined]
        return super().format(record)


# --- Setup ---

_VALID_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}


def setup_logging() -> None:
    """Configure the root logger based on environment variables."""
    level_str = os.environ.get("QMDH_LOG_LEVEL", "INFO").upper()
    if level_str not in _VALID_LEVELS:
        level_str = "INFO"

    log_format = os.environ.get("QMDH_LOG_FORMAT", "json").lower()
    formatter: logging.Formatter = QMDHConsoleFormatter() if log_format == "console" else QMDHJsonFormatter()

    root = logging.getLogger()
    root.setLevel(level_str)
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    handler.addFilter(CorrelationIdFilter())
    root.addHandler(handler)

    access_logger = logging.getLogger("uvicorn.access")
    access_logger.handlers.clear()
    access_logger.propagate = False
    access_logger.disabled = True

    raw_level = os.environ.get("QMDH_LOG_LEVEL", "")
    if raw_level and raw_level.upper() not in _VALID_LEVELS:
        logging.getLogger(__name__).warning(
            "Invalid QMDH_LOG_LEVEL value '%s', falling back to INFO",
            raw_level,
        )
