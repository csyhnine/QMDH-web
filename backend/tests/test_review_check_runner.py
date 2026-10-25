"""V00 runner tests; all child inputs and files are synthetic."""
from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import textwrap
import unittest

RUNNER = Path(__file__).resolve().parents[1] / "scripts/check_review_subset.py"


def load_runner():
    spec = importlib.util.spec_from_file_location("review_subset_under_test", RUNNER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def child(body):
    preamble = f"""
import importlib.util, os, pathlib, sys, tempfile
spec = importlib.util.spec_from_file_location("subset", {str(RUNNER)!r})
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
"""
    result = subprocess.run(
        [sys.executable, "-B", "-c", preamble + textwrap.dedent(body)],
        capture_output=True, text=True, timeout=45,
    )
    return result


class ReviewRunnerTests(unittest.TestCase):
    def test_runner_can_load_without_app_or_pytest(self):
        result = child("assert 'pytest' not in sys.modules; assert not any(n == 'app' or n.startswith('app.') for n in sys.modules)")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_rejects_targets_before_import_or_collection(self):
        result = child(r'''
import builtins
original = builtins.__import__
def guarded(name, *args, **kwargs):
    assert not (name == "pytest" or name == "app" or name.startswith("app.")), "late rejection"
    return original(name, *args, **kwargs)
builtins.__import__ = guarded
for args in ([], ["tests"], ["."], ["tests/test_review_check_runner.py"],
             ["--pyargs"], ["tests/test_task_executor_haodeya_grok_video.py::test_unknown"],
             [next(iter(r.ALLOWED_NODEIDS)), "-k", "anything"],
             [next(iter(r.ALLOWED_NODEIDS))] * 2):
    assert r.main(args) == 2
assert not any(n == "app" or n.startswith("app.") for n in sys.modules)
''')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_exact_collection_ignores_project_config_and_conftest(self):
        result = child(r'''
with tempfile.TemporaryDirectory() as directory:
    base = pathlib.Path(directory)
    (base / "test_control.py").write_text("def test_selected(): assert True\ndef test_unselected(): assert False\n")
    (base / "conftest.py").write_text("raise AssertionError('conftest loaded')")
    (base / "pytest.ini").write_text("[pytest]\naddopts = --not-a-real-option\n")
    os.environ.update(PYTEST_ADDOPTS="--not-a-real-option", PYTEST_PLUGINS="missing_private_plugin")
    r.BACKEND = base
    r.ALLOWED_NODEIDS = frozenset({"test_control.py::test_selected"})
    raise SystemExit(r.main(["test_control.py::test_selected"]))
''')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("1 passed", result.stdout)
        self.assertNotIn("test_unselected", result.stdout)

    def test_synthetic_settings_precede_real_app_import(self):
        result = child(r'''
import builtins, io
original_open, original_io_open = builtins.open, io.open
def guard_open(original):
    def checked(path, *args, **kwargs):
        if isinstance(path, (str, bytes, os.PathLike)):
            name = os.fsdecode(path)
            assert pathlib.Path(name).name != ".env", "dotenv touched"
            assert "PRIVATE_SENTINEL" not in name, "private path touched"
        return original(path, *args, **kwargs)
    return checked
builtins.open, io.open = guard_open(original_open), guard_open(original_io_open)
os.environ.update(QMDH_DATABASE_URL="sqlite:///PRIVATE_SENTINEL.db", QMDH_MEDIA_ROOT="PRIVATE_SENTINEL", QMDH_STORAGE_BACKEND="oss", QMDH_IMAGE_PROVIDER_PROFILES_JSON="private-invalid", QMDH_UNKNOWN_PRIVATE="must disappear")
with tempfile.TemporaryDirectory() as directory:
    base = pathlib.Path(directory)
    source = """
def test_config():
    import os, pathlib, sqlite3, sys
    from app.core.config import settings, Settings
    from app.database import engine
    from app.services.media_storage import get_storage_backend
    from sqlalchemy import text
    assert settings.database_url == "sqlite://"
    assert Settings().database_url == "sqlite://"
    assert settings.storage_backend == "local"
    assert not settings.meilisearch_enabled
    assert settings.task_execution_mode == "background"
    assert settings.get_image_provider_profiles() == {}
    assert settings.get_auth_user_profiles() == {}
    assert settings.get_agent_client_profiles() == {}
    assert not settings.bootstrap_admin_name
    assert not settings.chat_telemetry_alerts_enabled
    assert "QMDH_UNKNOWN_PRIVATE" not in os.environ
    assert os.environ["PYTEST_DISABLE_PLUGIN_AUTOLOAD"] == "1"
    assert "app.main" not in sys.modules
    root = pathlib.Path(settings.media_root)
    assert root.is_dir() and root.parent == pathlib.Path.cwd()
    with engine.begin() as conn:
        conn.execute(text("create table v00_probe (value integer)"))
        conn.execute(text("insert into v00_probe values (7)"))
        assert conn.execute(text("select value from v00_probe")).scalar() == 7
    storage = get_storage_backend()
    storage.write("v00/control.bin", b"synthetic")
    assert (root / "v00/control.bin").read_bytes() == b"synthetic"
    engine.dispose()
"""
    (base / "test_config.py").write_text(source)
    r.BACKEND = base
    r.ALLOWED_NODEIDS = frozenset({"test_config.py::test_config"})
    # Only the real backend source is added; the application is never started.
    sys.path.insert(0, str(pathlib.Path(r.__file__).resolve().parents[1]))
    old_cwd, old_path = pathlib.Path.cwd(), sys.path[:]
    old_env = dict(os.environ)
    import tempfile as tf
    directories = []
    original_temporary = tf.TemporaryDirectory
    def track(*args, **kwargs):
        handle = original_temporary(*args, **kwargs)
        directories.append(pathlib.Path(handle.name))
        return handle
    tf.TemporaryDirectory = track
    code = r.main(["test_config.py::test_config"])
    assert code == 0
    assert dict(os.environ) == old_env
    assert pathlib.Path.cwd() == old_cwd and sys.path == old_path
    assert directories and all(not p.exists() for p in directories)
''')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("1 passed", result.stdout)

    def test_network_and_application_startup_are_blocked(self):
        result = child(r'''
with tempfile.TemporaryDirectory() as directory:
    base = pathlib.Path(directory)
    (base / "test_boundary.py").write_text("""
def test_boundary():
    import importlib, socket, pytest
    for call in (lambda: socket.create_connection(("example.invalid", 443)),
                 lambda: socket.getaddrinfo("example.invalid", 443)):
        with pytest.raises(RuntimeError, match="V00 network disabled"):
            call()
    with socket.socket() as sock:
        for call in (lambda: sock.connect(("127.0.0.1", 1)),
                     lambda: sock.connect_ex(("127.0.0.1", 1)),
                     lambda: sock.sendto(b"x", ("127.0.0.1", 1))):
            with pytest.raises(RuntimeError, match="V00 network disabled"):
                call()
    with pytest.raises(RuntimeError, match="V00 application startup disabled"):
        importlib.import_module("app.main")
""")
    sys.path.insert(0, str(pathlib.Path(r.__file__).resolve().parents[1]))
    r.BACKEND = base
    r.ALLOWED_NODEIDS = frozenset({"test_boundary.py::test_boundary"})
    raise SystemExit(r.main(["test_boundary.py::test_boundary"]))
''')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_failure_skip_and_missing_node_exit_codes_are_preserved(self):
        for node, expected, summary in (("test_fail", 1, "1 failed"), ("test_skip", 0, "1 skipped"), ("test_missing", 4, "not found")):
            with self.subTest(node=node):
                body = r'''
with tempfile.TemporaryDirectory() as directory:
    base = pathlib.Path(directory)
    (base / "test_result.py").write_text("import pytest\ndef test_fail(): assert False\ndef test_skip(): pytest.skip('V00 synthetic skip')\n")
    r.BACKEND = base
    node = "test_result.py::" + NODE
    r.ALLOWED_NODEIDS = frozenset({node})
    raise SystemExit(r.main([node]))
'''.replace(" + NODE", " + " + repr(node))
                result = child(body)
                self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
                self.assertIn(summary, result.stdout + result.stderr)

    def test_collection_mismatch_is_rejected(self):
        result = child(r'''
with tempfile.TemporaryDirectory() as directory:
    base = pathlib.Path(directory)
    (base / "test_param.py").write_text("import pytest\n@pytest.mark.parametrize('value', [1, 2])\ndef test_value(value): assert False\n")
    r.BACKEND = base
    r.ALLOWED_NODEIDS = frozenset({"test_param.py::test_value"})
    raise SystemExit(r.main(["test_param.py::test_value"]))
''')
        self.assertEqual(result.returncode, 4, result.stdout + result.stderr)
        self.assertIn("V00 collection differs", result.stdout + result.stderr)
        self.assertNotIn("failed", result.stdout)

    def test_exception_restores_environment_paths_and_guards(self):
        result = child(r'''
import socket, pytest
from unittest.mock import patch
from pydantic_settings.sources import DotEnvSettingsSource
old_env, old_cwd, old_path = dict(os.environ), pathlib.Path.cwd(), sys.path[:]
old_connect = socket.socket.connect
old_read = DotEnvSettingsSource._read_env_files
old_meta = sys.meta_path[:]
def interrupted(*args, **kwargs):
    raise RuntimeError("synthetic interruption")
with patch.object(pytest, "main", interrupted):
    try:
        r.main([next(iter(r.ALLOWED_NODEIDS))])
    except RuntimeError as error:
        assert str(error) == "synthetic interruption"
    else:
        raise AssertionError("exception swallowed")
assert dict(os.environ) == old_env and pathlib.Path.cwd() == old_cwd
assert sys.path == old_path and sys.meta_path == old_meta
assert socket.socket.connect is old_connect
assert DotEnvSettingsSource._read_env_files is old_read
''')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_preimported_application_is_rejected(self):
        result = child(r'''
import types
sys.modules["app"] = types.ModuleType("app")
assert r.main([next(iter(r.ALLOWED_NODEIDS))]) == 2
assert "pytest" not in sys.modules
''')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
