"""QMDH custom middleware: CorrelationId and AccessLog."""
from __future__ import annotations

import logging
import time

from starlette.datastructures import Headers, MutableHeaders
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

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


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Extract or generate a correlation ID and store it in contextvar.

    Reads from X-Request-ID header if present, otherwise generates a UUID4 hex (16 chars).
    The correlation_id is automatically injected into all log records via CorrelationIdFilter.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        cid = request.headers.get("x-request-id") or generate_correlation_id()
        set_correlation_id(cid)
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = cid
            return response
        finally:
            set_correlation_id("")


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Log HTTP request/response at INFO level.

    Emits:
    - On request: method, path, client_ip (no body, no auth headers)
    - On response: status_code, latency_ms
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        client_ip = request.client.host if request.client else "unknown"
        logger.info(
            "request %s %s",
            request.method,
            request.url.path,
            extra={"method": request.method, "path": request.url.path, "client_ip": client_ip},
        )

        start = time.perf_counter()
        response = await call_next(request)
        latency_ms = int((time.perf_counter() - start) * 1000)

        logger.info(
            "response %s %dms",
            response.status_code,
            latency_ms,
            extra={"status_code": response.status_code, "latency_ms": latency_ms},
        )
        return response


class UnhandledExceptionMiddleware(BaseHTTPMiddleware):
    """Catch unhandled exceptions and emit a structured ERROR log entry.

    Emits: exception class, message, full traceback, correlation_id.
    Returns a generic 500 JSON response to the client.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        try:
            return await call_next(request)
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
                    "method": request.method,
                    "path": request.url.path,
                },
                exc_info=True,
            )
            from starlette.responses import JSONResponse

            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error", "correlation_id": cid},
            )
