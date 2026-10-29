"""R33: temporary files and conditional fake OSS; no real cloud connection."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Barrier, Lock, Thread as NativeThread
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from app.services import media_storage as media


class ObjectExists(Exception):
    status = 409
    code = "FileAlreadyExists"


class MissingObject(Exception):
    status = 404


class Bucket:
    def __init__(self):
        self.objects, self.calls, self.reads = {}, [], []
        self.version = None
        self.fault = None
        self.lock = Lock()
        self.barrier = None
        self.on_exists = None

    def get_bucket_versioning(self):
        if self.version == "error":
            raise OSError("synthetic version metadata failure")
        return SimpleNamespace() if self.version == "missing" else SimpleNamespace(status=self.version)

    def put_object(self, key, data, headers=None):
        if self.barrier is not None:
            self.barrier.wait(timeout=10)
        with self.lock:
            self.calls.append((key, bytes(data), dict(headers or {})))
            if key in self.objects and (headers or {}).get("x-oss-forbid-overwrite") == "true":
                raise ObjectExists()
            if self.fault == "before":
                raise OSError("synthetic put failure")
            self.objects[key] = bytes(data)
            if self.fault == "after":
                raise OSError("synthetic accepted put with lost response")
        return SimpleNamespace(status=200)

    def get_object(self, key):
        with self.lock:
            self.reads.append(key)
            if self.fault == "read":
                raise OSError("synthetic object read failure")
            if key not in self.objects:
                raise MissingObject()
            return BytesIO(self.objects[key])

    def object_exists(self, key):
        if self.on_exists is not None:
            return self.on_exists(key)
        return key in self.objects


class ImmediateThread:
    calls = []

    def __init__(self, *, target, args, kwargs, **options):
        self.target, self.args, self.kwargs = target, args, kwargs
        self.calls.append((target, args, kwargs, options))

    def start(self):
        self.target(*self.args, **self.kwargs)


class StorageNoOverwriteTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory(prefix="r33-offline-")))
        self.local = media.LocalStorage(str(self.root), "/media")
        self.bucket = Bucket()
        self.remote = media.OSSStorage(endpoint="https://oss.invalid", bucket_name="synthetic", access_key_id="unused",
                                       access_key_secret="unused", bucket=self.bucket, sleep_func=lambda _: None)
        self.enterContext(patch.object(media, "get_local_storage", return_value=self.local))
        self.enterContext(patch.object(media, "get_storage_backend", return_value=self.remote))
        self.enterContext(patch.object(media, "_oss_enabled", return_value=True))
        self.enterContext(patch.object(media.settings, "public_media_base_url", ""))
        ImmediateThread.calls = []
        self.enterContext(patch.object(media.threading, "Thread", ImmediateThread))

    def seed(self, key, *, local=None, remote=None):
        if local is not None:
            self.local.write(key, local)
        if remote is not None:
            self.bucket.objects[key] = remote

    def assert_pair(self, key, expected):
        self.assertEqual((self.local.read(key), self.bucket.objects[key]), (expected, expected))

    def test_original_both_old_probe_preserves_local_and_remote_instead_of_mirroring_new_input(self):
        key = "ordinary/old.bin"
        self.seed(key, local=b"old", remote=b"old")
        self.assertEqual(media.write_binary_asset(key, b"new", overwrite=False), key)
        self.assert_pair(key, b"old")
        self.assertEqual(self.bucket.calls, [])

    def test_direct_oss_no_overwrite_uses_conditional_create_and_preserves_existing_object(self):
        key = "ordinary/remote.txt"
        self.bucket.objects[key] = b"old"
        self.assertEqual(self.remote.write(key, b"new", overwrite=False), key)
        self.assertEqual(self.bucket.objects[key], b"old")
        self.assertEqual(len(self.bucket.calls), 1)
        self.assertEqual(self.bucket.calls[0][2]["x-oss-forbid-overwrite"], "true")

    def test_local_only_mirrors_actual_retained_bytes_and_never_new_caller_bytes(self):
        key = "ordinary/local-only.bin"
        self.seed(key, local=b"retained local")
        self.assertEqual(media.write_binary_asset(key, b"ignored input", overwrite=False), key)
        self.assert_pair(key, b"retained local")
        self.assertEqual(self.bucket.calls[0][1], b"retained local")

    def test_remote_only_populates_local_cache_from_existing_remote_winner(self):
        key = "ordinary/remote-only.bin"
        self.seed(key, remote=b"existing remote")
        self.assertEqual(media.write_binary_asset(key, b"ignored input", overwrite=False), key)
        self.assert_pair(key, b"existing remote")
        self.assertEqual(self.bucket.calls, [])

    def test_existing_divergence_reports_hashes_and_preserves_both_original_copies(self):
        key = "ordinary/conflict.bin"
        self.seed(key, local=b"old local", remote=b"old remote")
        with self.assertRaises(OSError) as caught:
            media.write_binary_asset(key, b"new input", overwrite=False)
        self.assertEqual((self.local.read(key), self.bucket.objects[key]), (b"old local", b"old remote"))
        self.assertIn(key, str(caught.exception))
        self.assertEqual(caught.exception.local_sha256, sha256(b"old local").hexdigest())
        self.assertEqual(caught.exception.remote_sha256, sha256(b"old remote").hexdigest())
        self.assertNotIn("old local", str(caught.exception))
        self.assertEqual(self.bucket.calls, [])

    def test_both_absent_create_one_canonical_object_and_repeat_keeps_it(self):
        key = "ordinary/new.png"
        self.assertEqual(media.write_binary_asset(key, b"canonical", overwrite=False), key)
        self.assert_pair(key, b"canonical")
        self.assertEqual(media.write_binary_asset(key, b"different retry", overwrite=False), key)
        self.assert_pair(key, b"canonical")
        self.assertEqual(len(self.bucket.calls), 1)
        self.assertEqual(self.bucket.calls[0][2]["x-oss-forbid-overwrite"], "true")
        self.assertEqual(ImmediateThread.calls, [])

    def test_local_twenty_writers_publish_one_complete_winner_without_temporary_leaks(self):
        key = "ordinary/local-race.bin"
        barrier = Barrier(20)
        payloads = [bytes([index]) * 65536 for index in range(20)]
        def write(payload):
            barrier.wait(timeout=10)
            return self.local.write(key, payload, overwrite=False)
        original_link = media.os.link
        def publish(source, target):
            self.assertIn(Path(source).read_bytes(), payloads)
            return original_link(source, target)
        with patch.object(media.threading, "Thread", NativeThread), patch.object(media.os, "link", side_effect=publish):
            with ThreadPoolExecutor(max_workers=20) as pool:
                self.assertEqual(list(pool.map(write, payloads)), [key] * 20)
        winner = self.local.read(key)
        self.assertIn(winner, payloads)
        for payload in payloads:
            self.local.write(key, payload, overwrite=False)
        self.assertEqual(self.local.read(key), winner)
        with patch.object(media.os, "link", side_effect=OSError("synthetic publication failure")):
            with self.assertRaises(OSError):
                self.local.write("ordinary/failed.bin", b"unpublished", overwrite=False)
        self.assertEqual([p for p in self.root.rglob("*") if p.is_file()], [self.root / key])

    def test_four_remote_conditional_writers_converge_to_one_complete_local_and_remote_winner(self):
        key = "ordinary/two-ended-race.bin"
        self.bucket.barrier = Barrier(4)
        payloads = [bytes([index]) * 8192 for index in range(4)]
        with patch.object(media.threading, "Thread", NativeThread):
            with ThreadPoolExecutor(max_workers=4) as pool:
                self.assertEqual(list(pool.map(lambda data: media.write_binary_asset(key, data, overwrite=False), payloads)), [key] * 4)
        self.assertIn(self.bucket.objects[key], payloads)
        self.assert_pair(key, self.bucket.objects[key])
        self.assertEqual(len(self.bucket.calls), 4)
        self.assertTrue(all(headers["x-oss-forbid-overwrite"] == "true" for _, _, headers in self.bucket.calls))

    def test_unknown_versioning_capability_refuses_new_put_without_creating_local_conflict(self):
        for version in ("Enabled", "Suspended", "unknown", "missing", "error"):
            with self.subTest(version=version):
                self.bucket.version = version
                key = f"ordinary/version-{version}.bin"
                with self.assertRaises(OSError):
                    media.write_binary_asset(key, b"new", overwrite=False)
                self.assertFalse(self.local.exists(key))
                self.assertNotIn(key, self.bucket.objects)
        self.assertEqual(self.bucket.calls, [])

    def test_failure_and_lost_response_preserve_known_copies_and_retry_reads_the_winner(self):
        for fault in ("before", "after"):
            with self.subTest(fault=fault):
                key = f"ordinary/failure-{fault}.bin"
                before = len(self.bucket.calls)
                self.bucket.fault = fault
                with self.assertRaises(OSError):
                    media.write_binary_asset(key, b"original attempt", overwrite=False)
                self.assertFalse(self.local.exists(key))
                self.assertEqual(len(self.bucket.calls) - before, 1)
                self.bucket.fault = None
                media.write_binary_asset(key, b"retry bytes", overwrite=False)
                self.assert_pair(key, b"original attempt" if fault == "after" else b"retry bytes")
                self.assertEqual(len(self.bucket.calls) - before, 1 if fault == "after" else 2)

    def test_remote_read_failure_is_reported_and_leaves_local_bytes_untouched(self):
        key = "ordinary/read-failure.bin"
        self.seed(key, local=b"old")
        self.bucket.fault = "read"
        with self.assertRaises(OSError):
            media.write_binary_asset(key, b"new", overwrite=False)
        self.assertEqual(self.local.read(key), b"old")
        self.assertEqual(self.bucket.calls, [])
        self.assertEqual(ImmediateThread.calls, [])

    def test_local_publication_error_leaves_remote_winner_and_does_not_report_success(self):
        key = "ordinary/local-failure.bin"
        with patch.object(self.local, "write", side_effect=OSError("synthetic local publication failure")):
            with self.assertRaises(OSError):
                media.write_binary_asset(key, b"remote retained", overwrite=False)
        self.assertEqual(self.bucket.objects.get(key), b"remote retained")
        self.assertFalse(self.local.exists(key))
        media.write_binary_asset(key, b"ignored retry", overwrite=False)
        self.assert_pair(key, b"remote retained")
        self.assertEqual(len(self.bucket.calls), 1)
        original_temporary = media.NamedTemporaryFile
        class ShortFile:
            def __init__(self, **kwargs):
                self.stream = original_temporary(**kwargs)
                self.name = self.stream.name
            def __enter__(self):
                return self
            def write(self, data):
                return self.stream.write(data[:-1])
            def __exit__(self, *args):
                self.stream.close()
        with patch.object(media, "NamedTemporaryFile", side_effect=ShortFile):
            with self.assertRaises(OSError):
                self.local.write("ordinary/short.bin", b"incomplete bytes", overwrite=False)
        self.assertFalse(self.local.exists("ordinary/short.bin"))
        self.assertEqual(list(self.root.rglob(".qmdh-write-*")), [])

    def test_legacy_false_background_mirror_uses_local_bytes_and_logs_failure(self):
        key = "ordinary/legacy-mirror.bin"
        self.seed(key, local=b"old local")
        media._mirror_to_oss(key, b"ignored input", overwrite=False)
        self.assert_pair(key, b"old local")
        self.bucket.objects[key] = b"conflicting remote"
        with self.assertLogs(media.logger, level="ERROR") as logged:
            media._mirror_to_oss(key, b"ignored input", overwrite=False)
        self.assertIn(key, "\n".join(logged.output))
        self.assertEqual((self.local.read(key), self.bucket.objects[key]), (b"old local", b"conflicting remote"))

    def test_default_true_overwrite_still_uses_original_asynchronous_mirror_contract(self):
        key = "ordinary/default.bin"
        self.seed(key, local=b"old", remote=b"old")
        self.assertEqual(media.write_binary_asset(key, b"new"), key)
        self.assert_pair(key, b"new")
        self.assertEqual(len(ImmediateThread.calls), 1)
        self.assertTrue(ImmediateThread.calls[0][2]["overwrite"])
        self.assertNotIn("x-oss-forbid-overwrite", self.bucket.calls[0][2])

    def test_real_bin_alias_call_preserves_existing_typed_alias_on_both_ends(self):
        binary, alias = "references/synthetic.bin", "references/synthetic.png"
        self.seed(binary, local=b"\x89PNG\r\n\x1a\nnew synthetic bytes")
        self.seed(alias, local=b"old typed alias", remote=b"old typed alias")
        self.assertEqual(media.ensure_public_object_url(binary), "https://synthetic.oss.invalid/" + alias)
        self.assert_pair(alias, b"old typed alias")
        self.assertEqual(self.bucket.calls, [])

    def test_real_svg_preview_keeps_existing_and_conditionally_publishes_new_preview(self):
        key = "previews/synthetic.svg"
        path = media.write_preview_svg(key, title="first", eyebrow="fixture", detail="offline", accent_seed="one")
        self.assertEqual(path, key)
        original = self.local.read(key)
        self.assertIn(b"first", original)
        media.write_preview_svg(key, title="second", eyebrow="fixture", detail="changed", accent_seed="two")
        self.assert_pair(key, original)
        self.assertEqual(len(self.bucket.calls), 1)

    def test_actual_installed_sdk_forwards_conditional_header_without_http(self):
        import oss2
        bucket = oss2.Bucket(oss2.Auth("synthetic", "unused"), "https://oss.invalid", "fixture", enable_crc=False)
        response = SimpleNamespace(status=200, request_id="offline", headers={"etag": '"synthetic"', "x-oss-request-id": "offline"})
        with patch.object(bucket, "_Bucket__do_object", return_value=response) as request:
            bucket.put_object("fixture.bin", b"bytes", headers={"x-oss-forbid-overwrite": "true", "Content-Type": "application/octet-stream"})
        self.assertEqual(request.call_args.args[:2], ("PUT", "fixture.bin"))
        self.assertEqual(request.call_args.kwargs["headers"]["x-oss-forbid-overwrite"], "true")
        self.assertEqual(request.call_args.kwargs["data"], b"bytes")

    def test_public_missing_object_race_never_overwrites_another_remote_winner(self):
        key = "references/public-race.png"
        self.seed(key, local=b"local original")
        def race(path):
            self.bucket.objects[path] = b"other remote winner"
            return False
        self.bucket.on_exists = race
        with self.assertRaises(OSError):
            media.ensure_public_object_url(key)
        self.assertEqual((self.local.read(key), self.bucket.objects[key]), (b"local original", b"other remote winner"))
        self.assertEqual(self.bucket.calls, [])
