import json
import os
import shutil
import tempfile
import unittest
from unittest.mock import patch

os.environ.setdefault("QMDH_OPENAI_IMAGE_API_KEY", "test-key")

from app.core.config import settings
from app.services.model_registry import get_provider_definition
from app.services.task_executor import OpenAIImageProviderAdapter


class _FakeResponse:
    def __init__(self, payload: dict):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


class OpenAIImageProviderAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.mkdtemp(prefix="qmdh-openai-test-")
        self.openai_api_key_patcher = patch.object(settings, "openai_image_api_key", "test-key")
        self.openai_api_key_patcher.start()
        profile = settings.get_image_provider_profile("openai_image")
        self.adapter = OpenAIImageProviderAdapter(get_provider_definition("openai_image"), profile)

    def tearDown(self) -> None:
        self.openai_api_key_patcher.stop()
        shutil.rmtree(self.tempdir, ignore_errors=True)

    def test_execute_persists_requested_number_of_generated_images(self) -> None:
        payload = {
            "data": [
                {
                    "b64_json": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yh3cAAAAASUVORK5CYII="
                }
            ],
            "usage": {"total_tokens": 123},
        }

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[_FakeResponse(payload), _FakeResponse(payload)],
        ):
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.media_url_prefix", "/media"):
                    with patch("app.services.task_executor.settings.openai_image_model", "gpt-image-1"):
                        outcome = self.adapter.execute(
                            "image.generate",
                            {"prompt": "Tower by the river", "aspect_ratio": "16:9", "image_count": 2},
                        )

        self.assertEqual(outcome.result["adapter_mode"], "openai")
        self.assertEqual(outcome.result["usage"]["total_tokens"], 123)
        self.assertEqual(outcome.result["requested_image_count"], 2)
        self.assertEqual(outcome.result["output_count"], 2)
        self.assertEqual(len(outcome.result["storage_paths"]), 2)
        self.assertTrue(outcome.result["storage_path"].startswith("/media/generated/openai_image/"))

        for storage_path in outcome.result["storage_paths"]:
            relative_path = storage_path.replace("/media/", "", 1).replace("/", os.sep)
            file_path = os.path.join(self.tempdir, relative_path)
            self.assertTrue(os.path.exists(file_path))
            self.assertGreater(os.path.getsize(file_path), 0)


if __name__ == "__main__":
    unittest.main()
