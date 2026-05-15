import io
import json
import logging
import os
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.logging import (
    QMDHJsonFormatter,
    get_correlation_id,
    set_correlation_id,
    setup_logging,
)
from app.core.middleware import CorrelationIdMiddleware


class StructuredLoggingTests(unittest.TestCase):
    def tearDown(self) -> None:
        logging.getLogger().handlers.clear()
        set_correlation_id("")

    def _configure_logging(self, **env: str) -> io.StringIO:
        buffer = io.StringIO()
        env_patch = patch.dict(os.environ, env, clear=False)
        stdout_patch = patch("app.core.logging.sys.stdout", buffer)
        env_patch.start()
        stdout_patch.start()
        self.addCleanup(env_patch.stop)
        self.addCleanup(stdout_patch.stop)
        setup_logging()
        return buffer

    @staticmethod
    def _json_lines(buffer: io.StringIO) -> list[dict]:
        return [json.loads(line) for line in buffer.getvalue().splitlines() if line.strip()]

    def test_json_logging_includes_required_fields_and_context(self) -> None:
        buffer = self._configure_logging(QMDH_LOG_FORMAT="json", QMDH_LOG_LEVEL="INFO")
        logger = logging.getLogger("qmdh.test")

        set_correlation_id("cid-123")
        logger.info(
            "structured hello",
            extra={"user_id": 7, "project_code": "QMDH-001", "task_id": 11},
        )

        entry = self._json_lines(buffer)[-1]
        self.assertEqual(entry["level"], "INFO")
        self.assertEqual(entry["logger"], "qmdh.test")
        self.assertEqual(entry["message"], "structured hello")
        self.assertEqual(entry["correlation_id"], "cid-123")
        self.assertEqual(entry["user_id"], 7)
        self.assertEqual(entry["project_code"], "QMDH-001")
        self.assertEqual(entry["task_id"], 11)
        self.assertTrue(entry["timestamp"].endswith("Z"))

    def test_invalid_log_level_falls_back_to_info_and_emits_warning(self) -> None:
        buffer = self._configure_logging(QMDH_LOG_FORMAT="json", QMDH_LOG_LEVEL="VERBOSE")
        logger = logging.getLogger("qmdh.invalid")

        logger.debug("hidden debug")
        logger.info("visible info")
        entries = self._json_lines(buffer)

        self.assertEqual(logging.getLogger().level, logging.INFO)
        self.assertTrue(
            any(
                entry["level"] == "WARNING"
                and "Invalid QMDH_LOG_LEVEL value 'VERBOSE'" in entry["message"]
                for entry in entries
            )
        )
        self.assertFalse(any(entry["message"] == "hidden debug" for entry in entries))
        self.assertTrue(any(entry["message"] == "visible info" for entry in entries))

    def test_console_format_outputs_human_readable_line(self) -> None:
        buffer = self._configure_logging(QMDH_LOG_FORMAT="console", QMDH_LOG_LEVEL="INFO")
        logger = logging.getLogger("qmdh.console")

        set_correlation_id("cid-console")
        logger.info("console message")

        output = buffer.getvalue().strip()
        self.assertIn("qmdh.console", output)
        self.assertIn("console message", output)
        self.assertIn("[cid-console]", output)
        self.assertFalse(output.startswith("{"))

    def test_correlation_id_propagates_through_request_lifecycle(self) -> None:
        buffer = self._configure_logging(QMDH_LOG_FORMAT="json", QMDH_LOG_LEVEL="INFO")
        app = FastAPI()
        app.add_middleware(CorrelationIdMiddleware)

        @app.get("/demo")
        def demo() -> dict[str, str]:
            logging.getLogger("qmdh.request").info("inside request")
            return {"cid": get_correlation_id()}

        client = TestClient(app)
        response = client.get("/demo", headers={"X-Request-ID": "req-abc-123"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["cid"], "req-abc-123")
        self.assertEqual(response.headers["X-Request-ID"], "req-abc-123")

        request_log = next(
            entry for entry in self._json_lines(buffer) if entry["message"] == "inside request"
        )
        self.assertEqual(request_log["correlation_id"], "req-abc-123")
        self.assertEqual(get_correlation_id(), "")


if __name__ == "__main__":
    unittest.main()
