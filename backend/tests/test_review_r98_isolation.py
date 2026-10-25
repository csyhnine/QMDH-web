"""R98 fixture regression: synthetic configuration, HTTP and video bytes only."""
from tests.review_media_fixtures import MP4_BYTES
from contextlib import ExitStack
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from app.core.config import settings
from app.services import media_storage
from app.services.provider_adapters.video_common import persist_generated_video_bytes


SCENARIOS = (
    "test_execute_submits_i2v_polls_and_persists_video",
    "test_execute_uses_adapter_config_tier_prices",
    "test_ref_mode_builds_input_references",
    "test_resolved_sku_duration_wins_over_payload_duration",
    "test_uses_video_sku_from_payload_for_placeholder_profile",
    "test_admin_sku_override_remaps_selected_tier",
)


def fixture_class():
    path = Path(__file__).with_name("test_task_executor_haodeya_grok_video.py")
    spec = importlib.util.spec_from_file_location("r98_fixture_under_test", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.HaodeyaGrokVideoAdapterTests


class ReviewR98IsolationTests(unittest.TestCase):
    def reject_remote_storage(self, stack):
        # Fail before a background mirror can start, even if the fixture regresses.
        for owner, name in (
            (media_storage, "OSSStorage"),
            (media_storage, "_mirror_to_oss"),
            (media_storage.threading, "Thread"),
        ):
            mocked = stack.enter_context(patch.object(owner, name, side_effect=AssertionError("R98 remote storage attempted")))
            stack.callback(mocked.assert_not_called)

    def test_fixture_selects_temporary_local_storage(self):
        with tempfile.TemporaryDirectory(prefix="qmdh-r98-control-") as directory, ExitStack() as stack:
            outside = Path(directory) / "configured-media"
            stack.enter_context(patch.multiple(settings, media_root=str(outside), storage_backend="oss"))
            self.reject_remote_storage(stack)
            writes = []

            def record_write(storage, relative_path, content, *, overwrite=True):
                writes.append((Path(storage._root), relative_path, content))
                return relative_path

            stack.enter_context(patch.object(media_storage.LocalStorage, "write", record_write))
            case = fixture_class()(SCENARIOS[0])
            try:
                case.setUp()
                self.assertEqual(settings.media_root, case.tempdir)
                self.assertEqual(settings.storage_backend, "local")
                relative = persist_generated_video_bytes(
                    provider_name="r98-control", video_bytes=b"synthetic-control",
                    prompt="fixture selection", output_format="mp4",
                )
                self.assertEqual(writes, [(Path(case.tempdir), relative, b"synthetic-control")])
                self.assertTrue(relative.startswith("generated/r98-control/"))
                self.assertFalse(outside.exists())
            finally:
                case.tearDown()
                case.doCleanups()
            self.assertEqual((settings.media_root, settings.storage_backend), (str(outside), "oss"))
            self.assertFalse(Path(case.tempdir).exists())

    def test_six_scenarios_persist_in_each_fixture_and_restore(self):
        original_write = media_storage.LocalStorage.write
        with tempfile.TemporaryDirectory(prefix="qmdh-r98-sequence-") as directory, ExitStack() as stack:
            outside = Path(directory) / "configured-media"
            outside.mkdir()
            sentinel = outside / "keep.bin"
            sentinel.write_bytes(b"unchanged synthetic sentinel")
            stack.enter_context(patch.multiple(settings, media_root=str(outside), storage_backend="oss"))
            self.reject_remote_storage(stack)
            roots = []
            for name in SCENARIOS:
                case = fixture_class()(name)
                writes = []

                def guarded_write(storage, relative_path, content, *, overwrite=True):
                    root = Path(case.tempdir).resolve()
                    self.assertEqual(Path(storage._root).resolve(), root)
                    self.assertEqual(settings.storage_backend, "local")
                    actual = original_write(storage, relative_path, content, overwrite=overwrite)
                    target = (root / actual).resolve()
                    self.assertTrue(target.is_relative_to(root))
                    self.assertEqual(target.read_bytes(), MP4_BYTES)
                    writes.append(target)
                    return actual

                with patch.object(media_storage.LocalStorage, "write", guarded_write):
                    result = unittest.TestResult()
                    case.run(result)
                self.assertEqual(result.testsRun, 1)
                self.assertEqual(result.errors + result.failures, [], name)
                self.assertEqual(result.skipped, [])
                self.assertEqual(len(writes), 1, name)
                roots.append(case.tempdir)
                self.assertFalse(Path(case.tempdir).exists())
                self.assertEqual((settings.media_root, settings.storage_backend), (str(outside), "oss"))
                self.assertEqual(list(outside.iterdir()), [sentinel])
                self.assertEqual(sentinel.read_bytes(), b"unchanged synthetic sentinel")
            self.assertEqual(len(set(roots)), len(SCENARIOS))

    def test_body_and_setup_errors_restore_settings_and_remove_media(self):
        base = fixture_class()
        for phase in ("body", "setup"):
            with self.subTest(phase=phase), tempfile.TemporaryDirectory(prefix="qmdh-r98-error-") as directory, ExitStack() as stack:
                outside = Path(directory) / "configured-media"
                stack.enter_context(patch.multiple(settings, media_root=str(outside), storage_backend="oss"))
                self.reject_remote_storage(stack)

                class InterruptedFixture(base):
                    def setUp(self):
                        super().setUp()
                        if phase == "setup":
                            raise RuntimeError("R98 synthetic setup interruption")

                    def test_interrupted(self):
                        self.assertEqual(settings.media_root, self.tempdir)
                        self.assertEqual(settings.storage_backend, "local")
                        relative = media_storage.write_binary_asset("r98/error.bin", b"synthetic-error")
                        self.assertEqual((Path(self.tempdir) / relative).read_bytes(), b"synthetic-error")
                        raise RuntimeError("R98 synthetic body interruption")

                case = InterruptedFixture("test_interrupted")
                result = unittest.TestResult()
                case.run(result)
                self.assertEqual(result.testsRun, 1)
                self.assertEqual(len(result.errors), 1)
                self.assertIn("R98 synthetic " + phase + " interruption", result.errors[0][1])
                self.assertEqual(result.failures + result.skipped, [])
                self.assertEqual((settings.media_root, settings.storage_backend), (str(outside), "oss"))
                self.assertFalse(Path(case.tempdir).exists())
                self.assertFalse(outside.exists())
