"""Run the selected offline regression suite without reading project .env files."""
from __future__ import annotations

import os
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch


BACKEND = Path(__file__).resolve().parents[1]
TESTS = (
    "tests/test_skill_feedback_migration.py",
    "tests/test_skill_feedback_api.py",
    "tests/test_feedback_api.py",
    "tests/test_media_audit.py",
    "tests/test_studio_perf_list_limits.py",
    "tests/test_auth_boundaries.py",
    "tests/test_role_access.py",
    "tests/test_health.py",
    "tests/test_cors_and_rate_limit.py",
    "tests/test_task_stale_recovery.py",
    "tests/test_task_soft_delete.py",
)


def main() -> int:
    os.chdir(BACKEND)
    sys.path.insert(0, str(BACKEND))
    # Explicitly isolate settings for this process. Never write to production .env.
    for name in list(os.environ):
        if name.startswith("QMDH_"):
            del os.environ[name]
    with tempfile.TemporaryDirectory(prefix="qmdh-check-") as media_root:
        os.environ.update({
            "QMDH_DATABASE_URL": "sqlite://",
            "QMDH_MEDIA_ROOT": media_root,
            "QMDH_STORAGE_BACKEND": "local",
            "QMDH_MEILISEARCH_ENABLED": "false",
            "QMDH_TASK_EXECUTION_MODE": "background",
            "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
        })
        import pytest

        # Absolute .env paths in Settings are ignored for this isolated test run.
        with patch("pydantic_settings.sources.DotEnvSettingsSource.__call__", return_value={}):
            return int(pytest.main([*TESTS, "-q", "--tb=short", *sys.argv[1:]]))


if __name__ == "__main__":
    raise SystemExit(main())
