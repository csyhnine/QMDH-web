"""Sliding window rate limiter using Redis sorted sets."""
from __future__ import annotations

import asyncio
import logging
import math
import re
import time
import uuid
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import settings
from app.core.security import hash_session_token
from app.database import SessionLocal
from app.models import AuthSession, User

logger = logging.getLogger("qmdh.ratelimit")

_REDIS_OP_TIMEOUT = 0.1
_WINDOW_SECONDS = 60
_GENERATION_MESSAGE_PATH = re.compile(r"^/api/v1/chat/conversations/[^/]+/messages$")


@dataclass(frozen=True)
class RateLimitRule:
    group: str
    limit: int


class SlidingWindowLimiter:
    """Redis-backed sliding window rate limiter."""

    def __init__(self, redis_url: str) -> None:
        self._redis_url = redis_url
        self._client = None

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

        Returns: (allowed, remaining, reset_at_unix).
        """
        now = time.time()
        default_reset_at = int(math.ceil(now + window_seconds))
        client = await self._get_client()
        if client is None:
            return True, limit, default_reset_at

        cutoff = now - window_seconds
        request_id = f"{now}:{uuid.uuid4().hex[:8]}"

        try:
            async def _run() -> tuple[int, Optional[float]]:
                pipeline = client.pipeline()
                pipeline.zremrangebyscore(key, 0, cutoff)
                pipeline.zcard(key)
                pipeline.zrange(key, 0, 0, withscores=True)
                results = await pipeline.execute()
                current_count = int(results[1])
                oldest = results[2]
                oldest_score = oldest[0][1] if oldest else None
                return current_count, oldest_score

            current_count, oldest_score = await asyncio.wait_for(_run(), timeout=_REDIS_OP_TIMEOUT)

            if current_count >= limit:
                reset_at = (
                    int(math.ceil(oldest_score + window_seconds))
                    if oldest_score is not None
                    else default_reset_at
                )
                return False, 0, reset_at

            async def _record() -> None:
                pipeline = client.pipeline()
                pipeline.zadd(key, {request_id: now})
                pipeline.expire(key, window_seconds)
                await pipeline.execute()

            await asyncio.wait_for(_record(), timeout=_REDIS_OP_TIMEOUT)
            remaining = max(0, limit - current_count - 1)
            reset_at = (
                int(math.ceil(oldest_score + window_seconds))
                if oldest_score is not None
                else default_reset_at
            )
            return True, remaining, reset_at
        except asyncio.TimeoutError:
            logger.warning("Rate limit check timed out for key=%s; fail-open", key)
            return True, limit, default_reset_at
        except Exception as exc:
            logger.warning("Rate limit check failed for key=%s: %s; fail-open", key, exc)
            return True, limit, default_reset_at


def _resolve_rules(request: Request) -> list[RateLimitRule]:
    path = request.url.path
    method = request.method.upper()

    if not path.startswith("/api/v1/") or path.startswith("/api/v1/health"):
        return []

    if method == "POST" and path == "/api/v1/auth/login":
        return [RateLimitRule("login", getattr(settings, "rate_limit_login_per_minute", 10))]

    rules = [RateLimitRule("general", getattr(settings, "rate_limit_general_per_minute", 60))]
    if method == "POST" and (path == "/api/v1/tasks" or _GENERATION_MESSAGE_PATH.match(path)):
        rules.append(
            RateLimitRule("generation", getattr(settings, "rate_limit_generation_per_minute", 10))
        )
    return rules


async def _resolve_authenticated_subject(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if token:
            def _lookup_user_id() -> str | None:
                with SessionLocal() as db:
                    user_id = db.scalar(
                        select(AuthSession.user_id)
                        .join(AuthSession.user)
                        .where(
                            AuthSession.token_hash == hash_session_token(token),
                            AuthSession.revoked_at.is_(None),
                            User.is_active.is_(True),
                        )
                    )
                    return str(user_id) if user_id is not None else None

            try:
                user_id = await asyncio.to_thread(_lookup_user_id)
                if user_id:
                    return user_id
            except Exception as exc:
                logger.warning("Rate limit auth lookup failed: %s", exc)

    dev_token = request.headers.get("x-qmdh-auth", "").strip()
    if dev_token:
        profile = settings.get_auth_user_profiles().get(dev_token)
        if profile:
            if profile.user_id is not None:
                return str(profile.user_id)
            return f"name:{profile.name}"

    return "anonymous"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Apply per-user/IP sliding window rate limits to API requests."""

    def __init__(self, app, limiter: SlidingWindowLimiter | None = None) -> None:
        super().__init__(app)
        self._limiter = limiter or SlidingWindowLimiter(settings.redis_url)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not getattr(settings, "rate_limit_enabled", False):
            return await call_next(request)

        rules = _resolve_rules(request)
        if not rules:
            return await call_next(request)

        if any(rule.group == "login" for rule in rules):
            client_ip = request.client.host if request.client else "unknown"
            subject = f"ip:{client_ip}"
        else:
            subject = await _resolve_authenticated_subject(request)

        header_rule = min(rules, key=lambda rule: rule.limit)
        header_remaining = header_rule.limit
        header_reset_at = int(math.ceil(time.time() + _WINDOW_SECONDS))

        for rule in rules:
            key = f"ratelimit:{subject}:{rule.group}"
            allowed, remaining, reset_at = await self._limiter.check_and_record(key, rule.limit)

            if rule.group == header_rule.group:
                header_remaining = remaining
                header_reset_at = reset_at

            if not allowed:
                retry_after = max(1, min(60, reset_at - int(time.time())))
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded", "retry_after": retry_after},
                    headers={
                        "Retry-After": str(retry_after),
                        "X-RateLimit-Limit": str(rule.limit),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": str(reset_at),
                    },
                )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(header_rule.limit)
        response.headers["X-RateLimit-Remaining"] = str(header_remaining)
        response.headers["X-RateLimit-Reset"] = str(header_reset_at)
        return response
