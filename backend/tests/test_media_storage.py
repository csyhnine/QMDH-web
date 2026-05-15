import os
import shutil
import tempfile
import unittest
from unittest.mock import patch

from app.services.media_storage import (
    LocalStorage,
    OSSStorage,
    resolve_storage_path,
    write_binary_asset,
)


class _TransientOssError(Exception):
    def __init__(self, status: int):
        super().__init__(f"status={status}")
        self.status = status


class _FakeBucket:
    def __init__(self, failures: list[Exception] | None = None):
        self.failures = list(failures or [])
        self.put_calls: list[tuple[str, bytes]] = []

    def put_object(self, key, data, headers=None, progress_callback=None):
        del headers, progress_callback
        self.put_calls.append((key, data))
        if self.failures:
            raise self.failures.pop(0)
        return object()


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


if __name__ == "__main__":
    unittest.main()
