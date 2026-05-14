"""Sliding window rate limiter using Redis sorted sets.

Provides:
- SlidingWindowLimiter: core rate limiting logic with fail-open behavior
- RateLimitMiddleware: FastAPI middleware that checks limits and adds headers
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings

logger = logging.getLogger("qmdh.ratelimit")

# Per-Redis-operation timeout (fail-open if exceeded)
_REDIS_OP_TIMEOUT = 0.1  # 100ms

# Window size in seconds
_WINDOW_SECONDS = 60


class SlidingWindowLimiter:
    """Redis-backed sliding window rate limiter.

    Uses sorted sets where each request is a member with a timestamp score.
    On each check: ZREMRANGEBYSCORE to drop expired entries, ZCARD to count,
    ZADD to record current request. Fails open on Redis errors or timeouts.
    """

    def __init__(self, redis_url: str) -> None:
        self._redis_url = redis_url
        self._client = None  # Lazy-initialized

    async def _get_client(self):
        if self._client is None:
            try:
                import redis.asyncio as redis_asyncio

                self._client = redis_asyncio.from_url(self._redis_url)
            except Exception as exc:
                logger.warning("Redis client init failed: %s", exc)
                return None
        return self._client

    async def check_and_record(
        self, key: str, limit: int, window_seconds: int = _WINDOW_SECONDS
    ) -> tuple[bool, int, int]:
        """Check limit and record this request.

        Returns: (allowed, remaining, reset_seconds)
        - allowed: True if under limit; False if at/over limit
        - remaining: requests left in current window (after this one)
        - reset_seconds: seconds until oldest request expires from window
        """
        client = await self._get_client()
        if client is None:
            return True, limit, window_seconds  # Fail open

        now = time.time()
        cutoff = now - window_seconds
        request_id = f"{now}:{uuid.uuid4().hex[:8]}"

        try:
            async def _run() -> tuple[int, Optional[float]]:
                pipeline = client.pipeline()
                pipeline.zremrangebyscore(key, 0, cutoff)
                pipeline.zcard(key)
                pipeline.zrange(key, 0, 0, withscores=True)
                results = await pipeline.execute()
                current_count = results[1]
                oldest = results[2]
                oldest_score = oldest[0][1] if oldest else None
                return current_count, oldest_score

            current_count, oldest_score = await asyncio.wait_for(_run(), timeout=_REDIS_OP_TIMEOUT)

            if current_count >= limit:
                # Over limit - calculate when oldest expires
                reset_in = window_seconds
                if oldest_score is not None:
                    reset_in = max(1, int(oldest_score + window_seconds - now))
                return False, 0, reset_in

            # Under limit - record this request
            async def _record() -> None:
                pipeline = client.pipeline()
                pipeline.zadd(key, {request_id: now})
                pipeline.expire(key, window_seconds)
                await pipeline.execute()

            await asyncio.wait_for(_record(), timeout=_REDIS_OP_TIMEOUT)
            remaining = max(0, limit - current_count - 1)
            return True, remaining, window_seconds
        except asyncio.TimeoutError:
            logger.warning("Rate limit check timed out for key=%s; fail-open", key)
            return True, limit, window_seconds
        except Exception as exc:
            logger.warning("Rate limit check failed for key=%s: %s; fail-open", key, exc)
            return True, limit, window_seconds


def _resolve_limit_for_path(path: str) -> tuple[str, int]:
    """Determine endpoint group and per-minute limit for a request path."""
    if path.startswith("/api/v1/auth/login"):
        return "login", getattr(settings, "rate_limit_login_per_minute", 10)
    if path.startswith("/api/v1/tasks") or "/generate" in path or "/chat" in path:
        return "generation", getattr(settings, "rate_limit_generation_per_minute", 10)
    return "general", getattr(settings, "rate_limit_general_per_minute", 60)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Apply per-user/IP sliding window rate limits to API requests.

    Skipped entirely when QMDH_RATE_LIMIT_ENABLED is false.
    """

    def __init__(self, app, limiter: SlidingWindowLimiter | None = None) -> None:
        super().__init__(app)
        self._limiter = limiter or SlidingWindowLimiter(settings.redis_url)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not getattr(settings, "rate_limit_enabled", False):
            return await call_next(request)

        # Skip health endpoints
        if request.url.path.startswith("/api/v1/health"):
            return await call_next(request)

        group, limit = _resolve_limit_for_path(request.url.path)

        # Identifier: user_id from auth (TBD) or client IP
        user_id = "anonymous"
        # Best-effort attempt to read user_id from request state if set by auth middleware
        if hasattr(request.state, "user_id"):
            user_id = str(request.state.user_id)
        elif group == "login":
            # For login attempts, use client IP
            client_ip = request.client.host if request.client else "unknown"
            user_id = f"ip:{client_ip}"

        key = f"ratelimit:{user_id}:{group}"
        allowed, remaining, reset_seconds = await self._limiter.check_and_record(key, limit)

        if not allowed:
            retry_after = max(1, min(60, reset_seconds))
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded", "retry_after": retry_after},
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(retry_after),
                },
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(reset_seconds)
        return response
