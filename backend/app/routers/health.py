"""Health check endpoints for QMDH backend."""
from __future__ import annotations

import asyncio
import time
from importlib.metadata import PackageNotFoundError, version
from typing import Any

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from app.core.config import settings

router = APIRouter(tags=["health"])

_PROCESS_START = time.time()
_CHECK_TIMEOUT = 2.0
_GLOBAL_BUDGET = 5.0


def _resolve_application_version() -> str:
    for dist_name in ("qmdh-web", "qmdh-web-backend", "QMDH-web"):
        try:
            return version(dist_name)
        except PackageNotFoundError:
            continue
    return "unknown"


async def _check_database() -> dict[str, Any]:
    start = time.perf_counter()
    try:
        from sqlalchemy import text

        from app.database import SessionLocal

        async def _run_query() -> None:
            def _sync_check() -> None:
                with SessionLocal() as db:
                    db.execute(text("SELECT 1"))

            await asyncio.to_thread(_sync_check)

        await asyncio.wait_for(_run_query(), timeout=_CHECK_TIMEOUT)
        return {"status": "healthy", "latency_ms": int(round((time.perf_counter() - start) * 1000))}
    except asyncio.TimeoutError:
        return {
            "status": "timeout",
            "latency_ms": int(round((time.perf_counter() - start) * 1000)),
            "reason": f"database check exceeded {_CHECK_TIMEOUT:.0f}s timeout",
        }
    except Exception as exc:
        return {
            "status": "degraded",
            "latency_ms": int(round((time.perf_counter() - start) * 1000)),
            "reason": str(exc) or exc.__class__.__name__,
        }


async def _check_redis() -> dict[str, Any]:
    if settings.task_execution_mode != "redis":
        return {"status": "not_configured", "latency_ms": 0}

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
        return {"status": "healthy", "latency_ms": int(round((time.perf_counter() - start) * 1000))}
    except asyncio.TimeoutError:
        return {
            "status": "timeout",
            "latency_ms": int(round((time.perf_counter() - start) * 1000)),
            "reason": f"redis check exceeded {_CHECK_TIMEOUT:.0f}s timeout",
        }
    except Exception as exc:
        return {
            "status": "degraded",
            "latency_ms": int(round((time.perf_counter() - start) * 1000)),
            "reason": str(exc) or exc.__class__.__name__,
        }


@router.get("/health/live")
def liveness() -> dict[str, str]:
    return {"status": "alive"}


@router.get("/health")
async def healthcheck(detail: str = Query("", description="Use 'full' for detailed component info")) -> Any:
    async def _run_checks() -> tuple[dict[str, Any], dict[str, Any]]:
        return await asyncio.gather(_check_database(), _check_redis())

    try:
        database, redis = await asyncio.wait_for(_run_checks(), timeout=_GLOBAL_BUDGET)
    except asyncio.TimeoutError:
        timeout_reason = f"health checks exceeded {_GLOBAL_BUDGET:.0f}s global budget"
        database = {"status": "timeout", "latency_ms": int(_GLOBAL_BUDGET * 1000), "reason": timeout_reason}
        redis = {"status": "timeout", "latency_ms": int(_GLOBAL_BUDGET * 1000), "reason": timeout_reason}

    is_unhealthy = any(
        component["status"] in {"degraded", "timeout"} for component in (database, redis)
    )

    components: dict[str, dict[str, Any]] = {
        "database": {"status": database["status"]},
        "redis": {"status": redis["status"]},
    }
    for name, component in (("database", database), ("redis", redis)):
        if component.get("reason"):
            components[name]["reason"] = component["reason"]
        if detail == "full":
            components[name]["latency_ms"] = int(component["latency_ms"])

    payload: dict[str, Any] = {
        "status": "healthy" if not is_unhealthy else "degraded",
        "service": "qmdh-api",
        "components": components,
    }
    if detail == "full":
        payload["version"] = _resolve_application_version()
        payload["uptime_seconds"] = int(time.time() - _PROCESS_START)

    if is_unhealthy:
        return JSONResponse(status_code=503, content=payload)
    return payload
