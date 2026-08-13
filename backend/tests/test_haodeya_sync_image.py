import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services.model_registry import ImageProviderProfile, ProviderDefinition
from app.services.task_executor import OpenAIImageProviderAdapter


class _FakeResponse:
    def __init__(self, payload: dict):
        self._payload = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class _FakeBinaryResponse:
    def __init__(self, payload: bytes):
        self._payload = payload

    def read(self) -> bytes:
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class HaodeyaSyncImageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = Path(tempfile.mkdtemp())

    def tearDown(self) -> None:
        shutil.rmtree(self.tempdir, ignore_errors=True)

    def test_count_sku_sync_short_body_no_poll(self) -> None:
        profile = ImageProviderProfile(
            provider_name="gpt-image-2-count",
            api_key="test-key",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="gpt-image-2-count",
            timeout_seconds=30,
            quality="high",
            adapter_config={"unit_price_1k": 1.62, "unit_price_2k": 2.67},
        )
        adapter = OpenAIImageProviderAdapter(
            ProviderDefinition(
                profile.provider_name,
                profile.model_name,
                ["image.generate", "image.edit"],
                adapter_kind="openai_compatible",
            ),
            profile,
        )
        sync_payload = {
            "created": 1,
            "data": [{"url": "https://cdn.example.test/count-1k.png"}],
            "model": "gpt-image-2-count",
        }

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[
                _FakeResponse(sync_payload),
                _FakeBinaryResponse(b"png-count"),
            ],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    outcome = adapter.execute(
                        "image.generate",
                        {
                            "prompt": "生成一个女孩在跳舞",
                            "aspect_ratio": "1:1",
                            "resolution": "1k",
                        },
                    )

        self.assertEqual(mocked_urlopen.call_count, 2)
        submit_body = json.loads(mocked_urlopen.call_args_list[0].args[0].data.decode("utf-8"))
        self.assertEqual(submit_body, {
            "model": "gpt-image-2-count",
            "prompt": "生成一个女孩在跳舞",
            "size": "1024x1024",
        })
        self.assertEqual(outcome.result["adapter_mode"], "haodeya_sync_image")
        self.assertEqual(outcome.model_name, "gpt-image-2-count")

    def test_count_rejects_ratio_size_uses_pixels(self) -> None:
        profile = ImageProviderProfile(
            provider_name="gpt-image-2-count",
            api_key="test-key",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="gpt-image-2-count",
            timeout_seconds=30,
            quality="high",
            adapter_config={"unit_price_1k": 1.62, "unit_price_2k": 2.67},
        )
        adapter = OpenAIImageProviderAdapter(
            ProviderDefinition(
                profile.provider_name,
                profile.model_name,
                ["image.generate"],
                adapter_kind="openai_compatible",
            ),
            profile,
        )
        sync_payload = {
            "data": [{"url": "https://cdn.example.test/count-16x9.png"}],
            "model": "gpt-image-2-count-2k",
        }

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[
                _FakeResponse(sync_payload),
                _FakeBinaryResponse(b"png-16x9"),
            ],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    adapter.execute(
                        "image.generate",
                        {"prompt": "wide", "aspect_ratio": "16:9", "resolution": "2k"},
                    )

        submit_body = json.loads(mocked_urlopen.call_args_list[0].args[0].data.decode("utf-8"))
        self.assertEqual(submit_body["model"], "gpt-image-2-count-2k")
        self.assertEqual(submit_body["size"], "1536x1024")
        self.assertNotEqual(submit_body["size"], "16:9")

    def test_count_sends_image_urls_for_reference(self) -> None:
        profile = ImageProviderProfile(
            provider_name="gpt-image-2-count",
            api_key="test-key",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="gpt-image-2-count",
            timeout_seconds=30,
            quality="high",
            adapter_config={"unit_price_1k": 1.62, "unit_price_2k": 2.67},
        )
        adapter = OpenAIImageProviderAdapter(
            ProviderDefinition(
                profile.provider_name,
                profile.model_name,
                ["image.generate", "image.edit"],
                adapter_kind="openai_compatible",
            ),
            profile,
        )
        sync_payload = {
            "data": [{"url": "https://cdn.example.test/count-ref.png"}],
            "model": "gpt-image-2-count",
        }
        ref_url = "https://cityusbdisk.cn/media/refs/army.png"

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[
                _FakeResponse(sync_payload),
                _FakeBinaryResponse(b"png-ref"),
            ],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    outcome = adapter.execute(
                        "image.generate",
                        {
                            "prompt": "配上复杂的说明性文字",
                            "aspect_ratio": "16:9",
                            "resolution": "1k",
                            "reference_images": [ref_url],
                        },
                    )

        submit_body = json.loads(mocked_urlopen.call_args_list[0].args[0].data.decode("utf-8"))
        self.assertEqual(submit_body["model"], "gpt-image-2-count")
        self.assertEqual(submit_body["image_urls"], [ref_url])
        self.assertTrue(outcome.result.get("reference_image_used"))
        self.assertEqual(outcome.result.get("reference_image_mode"), "haodeya_sync_image_urls")

    def test_count_2k_uses_tiered_model_name(self) -> None:
        profile = ImageProviderProfile(
            provider_name="gpt-image-2-count",
            api_key="test-key",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="gpt-image-2-count",
            timeout_seconds=30,
            quality="high",
            adapter_config={"unit_price_1k": 1.62, "unit_price_2k": 2.67},
        )
        adapter = OpenAIImageProviderAdapter(
            ProviderDefinition(
                profile.provider_name,
                profile.model_name,
                ["image.generate"],
                adapter_kind="openai_compatible",
            ),
            profile,
        )
        sync_payload = {
            "data": [{"url": "https://cdn.example.test/count-2k.png"}],
            "model": "gpt-image-2-count-2k",
        }

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[
                _FakeResponse(sync_payload),
                _FakeBinaryResponse(b"png-2k"),
            ],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    outcome = adapter.execute(
                        "image.generate",
                        {"prompt": "dancer", "aspect_ratio": "1:1", "resolution": "2k"},
                    )

        submit_body = json.loads(mocked_urlopen.call_args_list[0].args[0].data.decode("utf-8"))
        self.assertEqual(submit_body["model"], "gpt-image-2-count-2k")
        self.assertEqual(set(submit_body.keys()), {"model", "prompt", "size"})
        self.assertEqual(outcome.model_name, "gpt-image-2-count-2k")
        self.assertEqual(outcome.result["billing"]["resolution_tier"], "2k")


if __name__ == "__main__":
    unittest.main()
