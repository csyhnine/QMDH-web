import os
import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services.media_storage import (
    LocalStorage,
    OSSStorage,
    _content_type_for_path,
    encode_public_http_url,
    ensure_public_object_url,
    read_binary_asset,
    resolve_storage_path,
    write_binary_asset,
)


class _TransientOssError(Exception):
    def __init__(self, status: int):
        super().__init__(f"status={status}")
        self.status = status


class _FakeBucket:
    def __init__(self, failures: list[Exception] | None = None, objects: dict[str, bytes] | None = None):
        self.failures = list(failures or [])
        self.objects = dict(objects or {})
        self.put_calls: list[tuple[str, bytes]] = []

    def put_object(self, key, data, headers=None, progress_callback=None):
        del headers, progress_callback
        self.put_calls.append((key, data))
        if self.failures:
            raise self.failures.pop(0)
        self.objects[key] = data
        return object()

    def get_object(self, key):
        if key not in self.objects:
            exc = Exception("NoSuchKey")
            exc.status = 404  # type: ignore[attr-defined]
            raise exc

        class _Result:
            def __init__(self, payload: bytes):
                self._payload = payload

            def read(self):
                return self._payload

        return _Result(self.objects[key])

    def object_exists(self, key):
        return key in self.objects


class MediaStorageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.mkdtemp(prefix="qmdh-media-storage-")

    def tearDown(self) -> None:
        shutil.rmtree(self.tempdir, ignore_errors=True)

    def test_local_storage_write_and_url_resolution(self) -> None:
        with patch("app.services.media_storage.settings.storage_backend", "local"):
            with patch("app.services.media_storage.settings.media_root", self.tempdir):
                with patch("app.services.media_storage.settings.media_url_prefix", "/media"):
                    relative_path = write_binary_asset("generated/demo/example.png", b"png-bytes")

                    self.assertEqual(relative_path, "generated/demo/example.png")
                    self.assertTrue(
                        os.path.exists(os.path.join(self.tempdir, "generated", "demo", "example.png"))
                    )
                    self.assertEqual(
                        resolve_storage_path(relative_path),
                        "/media/generated/demo/example.png",
                    )
                    self.assertEqual(
                        resolve_storage_path("https://legacy.example.test/path.png"),
                        "https://legacy.example.test/path.png",
                    )
                    self.assertEqual(resolve_storage_path("/media/already-absolute.png"), "/media/already-absolute.png")
                    self.assertEqual(read_binary_asset(relative_path), b"png-bytes")

    def test_storage_backend_contract_preserves_relative_path_suffix(self) -> None:
        local_backend = LocalStorage(self.tempdir, "/media")
        oss_backend = OSSStorage(
            endpoint="oss-cn-hangzhou.aliyuncs.com",
            bucket_name="qmdh-assets",
            access_key_id="key-id",
            access_key_secret="key-secret",
            bucket=_FakeBucket(),
            sleep_func=lambda seconds: None,
        )

        paths = [
            "generated/openai/example.png",
            "references/demo-file.webp",
            "inspiration/cards/preview.svg",
        ]

        for backend in (local_backend, oss_backend):
            for relative_path in paths:
                with self.subTest(backend=backend.__class__.__name__, relative_path=relative_path):
                    stored_path = backend.write(relative_path, b"payload")
                    self.assertEqual(stored_path, relative_path)
                    self.assertTrue(backend.url_for(relative_path).endswith(relative_path))
                    self.assertEqual(backend.read(relative_path), b"payload")
                    self.assertTrue(backend.exists(relative_path))

    def test_oss_storage_retries_transient_errors_and_uses_cdn_urls(self) -> None:
        sleep_calls: list[int] = []
        bucket = _FakeBucket(failures=[_TransientOssError(500), _TransientOssError(503)])
        backend = OSSStorage(
            endpoint="oss-cn-hangzhou.aliyuncs.com",
            bucket_name="qmdh-assets",
            access_key_id="key-id",
            access_key_secret="key-secret",
            cdn_base_url="https://cdn.example.test/assets",
            bucket=bucket,
            sleep_func=lambda seconds: sleep_calls.append(seconds),
        )

        stored_path = backend.write("generated/demo/retry.png", b"retry-bytes")

        self.assertEqual(stored_path, "generated/demo/retry.png")
        self.assertEqual(sleep_calls, [1, 2])
        self.assertEqual(len(bucket.put_calls), 3)
        self.assertEqual(
            backend.url_for(stored_path),
            "https://cdn.example.test/assets/generated/demo/retry.png",
        )

    def test_oss_write_keeps_local_urls_and_mirrors_async(self) -> None:
        bucket = _FakeBucket()
        with patch("app.services.media_storage.settings.storage_backend", "oss"):
            with patch("app.services.media_storage.settings.media_root", self.tempdir):
                with patch("app.services.media_storage.settings.media_url_prefix", "/media"):
                    with patch("app.services.media_storage.settings.oss_endpoint", "https://oss-cn-shenzhen.aliyuncs.com"):
                        with patch("app.services.media_storage.settings.oss_bucket_name", "qmdh-media"):
                            with patch("app.services.media_storage.settings.oss_access_key_id", "ak"):
                                with patch("app.services.media_storage.settings.oss_access_key_secret", "sk"):
                                    with patch(
                                        "app.services.media_storage.OSSStorage._build_bucket",
                                        return_value=bucket,
                                    ):
                                        path = write_binary_asset("chat/uploads/a.png", b"img")
                                        self.assertEqual(path, "chat/uploads/a.png")
                                        self.assertEqual(resolve_storage_path(path), "/media/chat/uploads/a.png")
                                        self.assertTrue(
                                            os.path.exists(os.path.join(self.tempdir, "chat", "uploads", "a.png"))
                                        )
                                        self.assertEqual(read_binary_asset(path), b"img")
                                        # Background mirror should land on OSS shortly
                                        for _ in range(50):
                                            if path in bucket.objects:
                                                break
                                            time.sleep(0.02)
                                        self.assertEqual(bucket.objects.get(path), b"img")

                                        from app.services.media_storage import ensure_public_object_url

                                        public = ensure_public_object_url(path)
                                        self.assertEqual(
                                            public,
                                            "https://qmdh-media.oss-cn-shenzhen.aliyuncs.com/chat/uploads/a.png",
                                        )

    def test_read_falls_back_to_oss_when_local_missing(self) -> None:
        bucket = _FakeBucket(objects={"legacy/only-oss.png": b"from-oss"})
        with patch("app.services.media_storage.settings.storage_backend", "oss"):
            with patch("app.services.media_storage.settings.media_root", self.tempdir):
                with patch("app.services.media_storage.settings.media_url_prefix", "/media"):
                    with patch("app.services.media_storage.settings.oss_endpoint", "https://oss-cn-shenzhen.aliyuncs.com"):
                        with patch("app.services.media_storage.settings.oss_bucket_name", "qmdh-media"):
                            with patch("app.services.media_storage.settings.oss_access_key_id", "ak"):
                                with patch("app.services.media_storage.settings.oss_access_key_secret", "sk"):
                                    with patch(
                                        "app.services.media_storage.OSSStorage._build_bucket",
                                        return_value=bucket,
                                    ):
                                        self.assertEqual(read_binary_asset("legacy/only-oss.png"), b"from-oss")

    def test_encode_public_http_url_percent_encodes_non_ascii_path(self) -> None:
        raw = "https://qmdh-media.oss-cn-shenzhen.aliyuncs.com/generated/清洗.png"
        encoded = encode_public_http_url(raw)
        self.assertNotEqual(encoded, raw)
        self.assertIn("%E6%B8%85", encoded)
        self.assertTrue(encoded.endswith(".png"))

    def test_encode_public_http_url_is_idempotent_for_already_encoded_paths(self) -> None:
        once = encode_public_http_url(
            "https://qmdh-media.oss-cn-shenzhen.aliyuncs.com/generated/清洗.png"
        )
        twice = encode_public_http_url(once)
        self.assertEqual(twice, once)
        self.assertNotIn("%25E4", twice)

    def test_oss_url_for_encodes_non_ascii_keys(self) -> None:
        bucket = _FakeBucket()
        backend = OSSStorage(
            endpoint="https://oss-cn-shenzhen.aliyuncs.com",
            bucket_name="qmdh-media",
            access_key_id="ak",
            access_key_secret="sk",
            cdn_base_url="https://qmdh-media.oss-cn-shenzhen.aliyuncs.com",
            timeout_seconds=5,
        )
        with patch.object(backend, "_get_bucket", return_value=bucket):
            url = backend.url_for("generated/清洗.png")
        self.assertIn("%E6%B8%85", url)

    def test_ensure_public_object_url_prefers_site_media_over_raw_oss(self) -> None:
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rel = "generated/sample.png"
            target = root / rel
            target.parent.mkdir(parents=True)
            target.write_bytes(png)
            with patch("app.services.media_storage.settings.media_root", str(root)):
                with patch("app.services.media_storage.settings.storage_backend", "local"):
                    with patch("app.services.media_storage.settings.media_url_prefix", "/media"):
                        with patch(
                            "app.services.media_storage.settings.public_media_base_url",
                            "https://cityusbdisk.cn",
                        ):
                            url = ensure_public_object_url(f"/media/{rel}")
        self.assertTrue(url.startswith("https://cityusbdisk.cn/media/"))
        self.assertIn("sample.png", url)

    def test_ensure_public_object_url_bin_png_gets_png_alias(self) -> None:
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rel = "generated/test-ref.bin"
            target = root / rel
            target.parent.mkdir(parents=True)
            target.write_bytes(png)
            with patch("app.services.media_storage.settings.media_root", str(root)):
                with patch("app.services.media_storage.settings.storage_backend", "local"):
                    with patch("app.services.media_storage.settings.media_url_prefix", "/media"):
                        with patch(
                            "app.services.media_storage.settings.public_media_base_url",
                            "https://cityusbdisk.cn",
                        ):
                            url = ensure_public_object_url(f"/media/{rel}")
                            alias = root / "generated/test-ref.png"
                            self.assertTrue(alias.is_file())
                            self.assertTrue(url.endswith("test-ref.png"))
                            self.assertIn("cityusbdisk.cn/media/", url)

    def test_content_type_for_path_sniffs_bin_png(self) -> None:
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
        self.assertEqual(_content_type_for_path("generated/x.bin", png), "image/png")


if __name__ == "__main__":
    unittest.main()
