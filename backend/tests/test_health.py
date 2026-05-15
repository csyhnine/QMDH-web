import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import health


class HealthEndpointTests(unittest.TestCase):
    def setUp(self) -> None:
        self.app = FastAPI()
        self.app.include_router(health.router, prefix="/api/v1")
        self.client = TestClient(self.app)

    def test_health_returns_healthy_when_dependencies_are_up(self) -> None:
        with patch("app.routers.health._check_database", AsyncMock(return_value={"status": "healthy", "latency_ms": 12})):
            with patch("app.routers.health._check_redis", AsyncMock(return_value={"status": "healthy", "latency_ms": 8})):
                response = self.client.get("/api/v1/health")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "healthy")
        self.assertEqual(payload["components"]["database"]["status"], "healthy")
        self.assertEqual(payload["components"]["redis"]["status"], "healthy")

    def test_health_returns_degraded_when_dependency_fails(self) -> None:
        with patch("app.routers.health._check_database", AsyncMock(return_value={"status": "degraded", "latency_ms": 19, "reason": "db down"})):
            with patch("app.routers.health._check_redis", AsyncMock(return_value={"status": "healthy", "latency_ms": 6})):
                response = self.client.get("/api/v1/health")

        self.assertEqual(response.status_code, 503)
        payload = response.json()
        self.assertEqual(payload["status"], "degraded")
        self.assertEqual(payload["components"]["database"]["status"], "degraded")
        self.assertEqual(payload["components"]["database"]["reason"], "db down")

    def test_health_returns_timeout_status_when_dependency_times_out(self) -> None:
        with patch("app.routers.health._check_database", AsyncMock(return_value={"status": "timeout", "latency_ms": 2001, "reason": "db timed out"})):
            with patch("app.routers.health._check_redis", AsyncMock(return_value={"status": "healthy", "latency_ms": 7})):
                response = self.client.get("/api/v1/health")

        self.assertEqual(response.status_code, 503)
        payload = response.json()
        self.assertEqual(payload["status"], "degraded")
        self.assertEqual(payload["components"]["database"]["status"], "timeout")
        self.assertEqual(payload["components"]["database"]["reason"], "db timed out")

    def test_redis_check_returns_not_configured_outside_redis_mode(self) -> None:
        with patch.object(health.settings, "task_execution_mode", "background"):
            result = asyncio.run(health._check_redis())

        self.assertEqual(result["status"], "not_configured")
        self.assertEqual(result["latency_ms"], 0)

    def test_detail_full_includes_version_uptime_and_component_latencies(self) -> None:
        with patch("app.routers.health._check_database", AsyncMock(return_value={"status": "healthy", "latency_ms": 14})):
            with patch("app.routers.health._check_redis", AsyncMock(return_value={"status": "not_configured", "latency_ms": 0})):
                with patch("app.routers.health._resolve_application_version", return_value="1.2.3"):
                    with patch("app.routers.health.time.time", return_value=health._PROCESS_START + 321):
                        response = self.client.get("/api/v1/health?detail=full")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["version"], "1.2.3")
        self.assertEqual(payload["uptime_seconds"], 321)
        self.assertEqual(payload["components"]["database"]["latency_ms"], 14)
        self.assertEqual(payload["components"]["redis"]["latency_ms"], 0)

    def test_component_status_enum_closure(self) -> None:
        allowed = {"healthy", "degraded", "timeout", "not_configured"}

        async def _timeout_wait_for(awaitable, timeout):
            del timeout
            awaitable.close()
            raise asyncio.TimeoutError

        with patch("app.routers.health.asyncio.to_thread", side_effect=RuntimeError("db offline")):
            degraded = asyncio.run(health._check_database())
        with patch("app.routers.health.asyncio.wait_for", side_effect=_timeout_wait_for):
            timeout = asyncio.run(health._check_database())
        with patch.object(health.settings, "task_execution_mode", "background"):
            not_configured = asyncio.run(health._check_redis())

        samples = [
            {"status": "healthy", "latency_ms": 1},
            degraded,
            timeout,
            not_configured,
        ]

        for sample in samples:
            with self.subTest(status=sample["status"]):
                self.assertIn(sample["status"], allowed)


if __name__ == "__main__":
    unittest.main()
