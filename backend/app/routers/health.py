"""Health check endpoints for QMDH backend.

Provides:
- GET /health - Full readiness check with DB & Redis dependency probes
- GET /health/live - Lightweight liveness probe (no auth, no dependency checks)

Both endpoints are exempt from authentication.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import APIRouter, Query

from app.core.config import settings

router = APIRouter(tags=["health"])

# Process start time for uptime calculation
_PROCESS_START = time.time()
APP_VERSION = "1.0.0"  # TODO: read from package metadata when packaging is set up

# Per-check timeout in seconds
_CHECK_TIMEOUT = 2.0
# Global response budget in seconds
_GLOBAL_BUDGET = 5.0


async def _check_database() -> tuple[str, float]:
    """Run SELECT 1 against the database.

    Returns: (status, latency_ms) where status is one of: healthy, degraded, timeout
    """
    start = time.perf_counter()
    try:
        from sqlalchemy import text
        from app.database import SessionLocal

        async def _run_query() -> None:
            # SQLAlchemy session operations are sync; run in default thread pool
            def _sync_check() -> None:
                with SessionLocal() as db:
                    db.execute(text("SELECT 1"))

            await asyncio.get_event_loop().run_in_executor(None, _sync_check)

        await asyncio.wait_for(_run_query(), timeout=_CHECK_TIMEOUT)
        latency_ms = (time.perf_counter() - start) * 1000
        return "healthy", latency_ms
    except asyncio.TimeoutError:
        latency_ms = (time.perf_counter() - start) * 1000
        return "timeout", latency_ms
    except Exception:
        latency_ms = (time.perf_counter() - start) * 1000
        return "degraded", latency_ms


async def _check_redis() -> tuple[str, float]:
    """Run PING against Redis.

    Returns: (status, latency_ms) where status is one of: healthy, degraded, timeout, not_configured
    """
    # Skip Redis check when not configured for redis task execution
    if settings.task_execution_mode != "redis":
        return "not_configured", 0.0

    start = time.perf_counter()
    try:
        import redis.asyncio as redis_asyncio

        async def _run_ping() -> None:
            client = redis_asyncio.from_url(settings.redis_url)
            try:
                await client.ping()
            finally:
                await client.aclose()

        await asyncio.wait_for(_run_ping(), timeout=_CHECK_TIMEOUT)
        latency_ms = (time.perf_counter() - start) * 1000
        return "healthy", latency_ms
    except asyncio.TimeoutError:
        latency_ms = (time.perf_counter() - start) * 1000
        return "timeout", latency_ms
    except Exception:
        latency_ms = (time.perf_counter() - start) * 1000
        return "degraded", latency_ms


@router.get("/health/live")
def liveness() -> dict[str, str]:
    """Liveness probe - always returns 200 if the process is alive.

    No auth, no dependency checks. Used by Kubernetes liveness probes.
    """
    return {"status": "alive"}


@router.get("/health")
async def healthcheck(detail: str = Query("", description="Use 'full' for detailed component info")) -> Any:
    """Readiness check with DB & Redis dependency probes.

    Returns HTTP 200 when all components are healthy or not_configured.
    Returns HTTP 503 when any required component is degraded or timed out.

    Query params:
    - detail=full: include version, uptime, and per-component latency
    """
    from fastapi.responses import JSONResponse

    # Run checks concurrently with global budget
    async def _run_checks() -> tuple[tuple[str, float], tuple[str, float]]:
        return await asyncio.gather(_check_database(), _check_redis())

    try:
        (db_status, db_latency), (redis_status, redis_latency) = await asyncio.wait_for(
            _run_checks(), timeout=_GLOBAL_BUDGET
        )
    except asyncio.TimeoutError:
        # Global budget exceeded - mark all as timeout
        db_status, db_latency = "timeout", _GLOBAL_BUDGET * 1000
        redis_status, redis_latency = "timeout", _GLOBAL_BUDGET * 1000

    # Determine overall status: degraded/timeout in any required component → 503
    component_statuses = [db_status, redis_status]
    is_unhealthy = any(s in ("degraded", "timeout") for s in component_statuses)

    components = {
        "database": db_status,
        "redis": redis_status,
    }

    payload: dict[str, Any] = {
        "status": "ok" if not is_unhealthy else "degraded",
        "service": "qmdh-api",
        "components": components,
    }

    if detail == "full":
        payload["version"] = APP_VERSION
        payload["uptime_seconds"] = int(time.time() - _PROCESS_START)
        payload["latency_ms"] = {
            "database": round(db_latency, 2),
            "redis": round(redis_latency, 2),
        }

    if is_unhealthy:
        return JSONResponse(status_code=503, content=payload)
    return payload
