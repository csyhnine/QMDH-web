import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import settings, validate_required_for_production
from app.core.middleware import StrictCORSMiddleware
from app.core.rate_limit import SlidingWindowLimiter


class CorsOriginTests(unittest.TestCase):
    def _build_client(self, allow_origins: list[str]) -> TestClient:
        app = FastAPI()
        app.add_middleware(
            StrictCORSMiddleware,
            allow_origins=allow_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        @app.get("/api/v1/ping")
        def ping() -> dict[str, str]:
            return {"status": "ok"}

        return TestClient(app)

    def test_cors_origin_matching_is_exact_and_case_sensitive(self) -> None:
        client = self._build_client(["https://app.example.com", "http://localhost:5180"])
        cases = [
            ("https://app.example.com", True),
            ("https://APP.example.com", False),
            ("https://app.example.com/", False),
            ("http://app.example.com", False),
            ("https://app.example.com:443", False),
            ("http://localhost:5180", True),
            ("http://localhost:3000", False),
        ]

        for origin, should_match in cases:
            with self.subTest(origin=origin):
                response = client.get("/api/v1/ping", headers={"Origin": origin})
                self.assertEqual(response.status_code, 200)
                if should_match:
                    self.assertEqual(response.headers.get("access-control-allow-origin"), origin)
                    self.assertEqual(response.headers.get("access-control-allow-credentials"), "true")
                else:
                    self.assertNotIn("access-control-allow-origin", response.headers)
                    self.assertNotIn("access-control-allow-credentials", response.headers)

    def test_cors_origin_parsing_falls_back_to_frontend_origin(self) -> None:
        with patch.object(settings, "cors_origins", "   "):
            with patch.object(settings, "frontend_origin", "https://fallback.example.com"):
                self.assertEqual(settings.get_cors_origins(), ["https://fallback.example.com"])


class ProductionConfigTests(unittest.TestCase):
    def test_production_rejects_default_bootstrap_admin_password(self) -> None:
        with (
            patch.object(settings, "database_url", "postgresql://qmdh.example/prod"),
            patch.object(settings, "redis_url", "redis://redis.example/0"),
            patch.object(settings, "encryption_key", "prod-encryption-key"),
            patch.object(settings, "bootstrap_admin_name", "admin"),
            patch.object(settings, "bootstrap_admin_password", "dev-admin-password"),
        ):
            with self.assertRaises(SystemExit) as raised:
                validate_required_for_production()

        self.assertEqual(raised.exception.code, 1)

    def test_sqlite_allows_default_bootstrap_admin_password_for_local_dev(self) -> None:
        with (
            patch.object(settings, "database_url", "sqlite:///./app.db"),
            patch.object(settings, "bootstrap_admin_name", "admin"),
            patch.object(settings, "bootstrap_admin_password", "dev-admin-password"),
        ):
            validate_required_for_production()


class _FakePipeline:
    def __init__(self, store: dict[str, dict[str, float]]) -> None:
        self._store = store
        self._ops: list[tuple] = []

    def zremrangebyscore(self, key: str, minimum: float, maximum: float):
        self._ops.append(("zremrangebyscore", key, minimum, maximum))
        return self

    def zcard(self, key: str):
        self._ops.append(("zcard", key))
        return self

    def zrange(self, key: str, start: int, stop: int, withscores: bool = False):
        self._ops.append(("zrange", key, start, stop, withscores))
        return self

    def zadd(self, key: str, mapping: dict[str, float]):
        self._ops.append(("zadd", key, mapping))
        return self

    def expire(self, key: str, seconds: int):
        self._ops.append(("expire", key, seconds))
        return self

    async def execute(self):
        results = []
        for op in self._ops:
            name = op[0]
            key = op[1]
            bucket = self._store.setdefault(key, {})
            if name == "zremrangebyscore":
                _, _, minimum, maximum = op
                before = len(bucket)
                stale = [member for member, score in bucket.items() if minimum <= score <= maximum]
                for member in stale:
                    bucket.pop(member, None)
                results.append(before - len(bucket))
            elif name == "zcard":
                results.append(len(bucket))
            elif name == "zrange":
                _, _, start, stop, withscores = op
                ordered = sorted(bucket.items(), key=lambda item: item[1])
                if stop == 0:
                    ordered = ordered[start:1]
                else:
                    ordered = ordered[start : stop + 1]
                results.append(ordered if withscores else [member for member, _ in ordered])
            elif name == "zadd":
                _, _, mapping = op
                bucket.update(mapping)
                results.append(len(mapping))
            elif name == "expire":
                results.append(True)
        self._ops.clear()
        return results


class _FakeRedisClient:
    def __init__(self) -> None:
        self.store: dict[str, dict[str, float]] = {}

    def pipeline(self) -> _FakePipeline:
        return _FakePipeline(self.store)


class RateLimitSlidingWindowTests(unittest.IsolatedAsyncioTestCase):
    async def test_sliding_window_counts_exact_requests_within_sixty_seconds(self) -> None:
        limiter = SlidingWindowLimiter("redis://example.test/0")
        fake_client = _FakeRedisClient()
        limiter._client = fake_client
        key = "ratelimit:user-7:general"

        timeline = [
            (1000.0, True, 1),
            (1010.0, True, 2),
            (1020.0, True, 3),
            (1050.0, False, 3),
            (1061.0, True, 3),
        ]

        for timestamp, should_allow, expected_count in timeline:
            with self.subTest(timestamp=timestamp):
                with patch("app.core.rate_limit.time.time", return_value=timestamp):
                    allowed, _, _ = await limiter.check_and_record(key, limit=3)
                self.assertEqual(allowed, should_allow)
                self.assertEqual(len(fake_client.store[key]), expected_count)

        remaining_scores = sorted(fake_client.store[key].values())
        self.assertEqual(remaining_scores, [1010.0, 1020.0, 1061.0])


if __name__ == "__main__":
    unittest.main()
