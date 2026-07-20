"""QMDH custom middleware: CorrelationId and AccessLog.

Implemented as pure ASGI middleware (not BaseHTTPMiddleware) so
StreamingResponse / SSE bodies are not buffered end-to-end.
"""
from __future__ import annotations

import logging
import time

from starlette.datastructures import Headers, MutableHeaders
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import generate_correlation_id, get_correlation_id, set_correlation_id

logger = logging.getLogger("qmdh.access")


class StrictCORSMiddleware(CORSMiddleware):
    """CORS middleware that omits credentials headers for non-whitelisted origins."""

    def preflight_response(self, request_headers: Headers) -> Response:
        response = super().preflight_response(request_headers)
        if (
            response.status_code >= 400
            and "origin" in request_headers
            and not self.is_allowed_origin(request_headers["origin"])
        ):
            if "Access-Control-Allow-Origin" in response.headers:
                del response.headers["Access-Control-Allow-Origin"]
            if "Access-Control-Allow-Credentials" in response.headers:
                del response.headers["Access-Control-Allow-Credentials"]
        return response

    async def send(self, message, send, request_headers: Headers) -> None:
        if message["type"] != "http.response.start":
            await send(message)
            return

        message.setdefault("headers", [])
        headers = MutableHeaders(scope=message)
        headers.update(self.simple_headers)
        origin = request_headers["Origin"]
        has_cookie = "cookie" in request_headers

        if self.allow_all_origins and has_cookie:
            self.allow_explicit_origin(headers, origin)
        elif not self.allow_all_origins and self.is_allowed_origin(origin=origin):
            self.allow_explicit_origin(headers, origin)
        elif not self.allow_all_origins:
            if "Access-Control-Allow-Origin" in headers:
                del headers["Access-Control-Allow-Origin"]
            if "Access-Control-Allow-Credentials" in headers:
                del headers["Access-Control-Allow-Credentials"]

        await send(message)


class CorrelationIdMiddleware:
    """Extract or generate a correlation ID and store it in contextvar.

    Reads from X-Request-ID header if present, otherwise generates a UUID4 hex (16 chars).
    The correlation_id is automatically injected into all log records via CorrelationIdFilter.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = Headers(scope=scope)
        cid = headers.get("x-request-id") or generate_correlation_id()
        set_correlation_id(cid)

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                message.setdefault("headers", [])
                MutableHeaders(scope=message)["X-Request-ID"] = cid
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            set_correlation_id("")


class AccessLogMiddleware:
    """Log HTTP request/response at INFO level.

    Emits:
    - On request: method, path, client_ip (no body, no auth headers)
    - On response start: status_code, latency_ms (headers time for streams)
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)
        client_ip = request.client.host if request.client else "unknown"
        logger.info(
            "request %s %s",
            request.method,
            request.url.path,
            extra={"method": request.method, "path": request.url.path, "client_ip": client_ip},
        )

        start = time.perf_counter()
        response_logged = False

        async def send_wrapper(message: Message) -> None:
            nonlocal response_logged
            if message["type"] == "http.response.start" and not response_logged:
                response_logged = True
                latency_ms = int((time.perf_counter() - start) * 1000)
                status_code = int(message.get("status", 500))
                logger.info(
                    "response %s %dms",
                    status_code,
                    latency_ms,
                    extra={"status_code": status_code, "latency_ms": latency_ms},
                )
            await send(message)

        await self.app(scope, receive, send_wrapper)


class UnhandledExceptionMiddleware:
    """Catch unhandled exceptions and emit a structured ERROR log entry.

    Emits: exception class, message, full traceback, correlation_id.
    Returns a generic 500 JSON response to the client when headers are not yet sent.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        response_started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            import traceback

            cid = get_correlation_id()
            error_logger = logging.getLogger("qmdh.error")
            error_logger.error(
                "unhandled exception: %s: %s",
                type(exc).__name__,
                str(exc),
                extra={
                    "exception_class": type(exc).__name__,
                    "exception_message": str(exc),
                    "traceback": traceback.format_exc(),
                    "correlation_id": cid,
                    "method": scope.get("method", ""),
                    "path": scope.get("path", ""),
                },
                exc_info=True,
            )
            if response_started:
                raise
            response = JSONResponse(
                status_code=500,
                content={"detail": "Internal server error", "correlation_id": cid},
            )
            await response(scope, receive, send)
