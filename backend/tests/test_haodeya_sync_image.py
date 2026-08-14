import json
import shutil
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services.model_registry import ImageProviderProfile, ProviderDefinition
from app.services.task_executor import OpenAIImageProviderAdapter


def _minimal_png_header(width: int, height: int) -> bytes:
    png = bytearray(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
    png.extend(struct.pack(">II", width, height))
    png.extend(b"\x00" * 8)
    return bytes(png)


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

    def test_count_follow_source_infers_landscape_pixel_size(self) -> None:
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
        ref_file = self.tempdir / "references" / "wide.png"
        ref_file.parent.mkdir(parents=True, exist_ok=True)
        ref_file.write_bytes(_minimal_png_header(1920, 1080))
        ref_path = "/media/references/wide.png"

        sync_payload = {
            "data": [{"url": "https://cdn.example.test/count-follow-source.png"}],
            "model": "gpt-image-2-count",
        }

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[
                _FakeResponse(sync_payload),
                _FakeBinaryResponse(b"png-follow"),
            ],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    with patch("app.services.task_executor.settings.media_url_prefix", "/media"):
                        with patch(
                            "app.services.task_executor.settings.public_media_base_url",
                            "https://cityusbdisk.cn",
                        ):
                            adapter.execute(
                                "image.edit",
                                {
                                    "edit_prompt": "refresh facade",
                                    "aspect_ratio": "遵循原图",
                                    "resolution": "1k",
                                    "reference_images": [ref_path],
                                },
                            )

        submit_body = json.loads(mocked_urlopen.call_args_list[0].args[0].data.decode("utf-8"))
        self.assertEqual(submit_body["size"], "1536x1024")
        self.assertIn("image_urls", submit_body)

    def test_count_encodes_non_ascii_reference_urls(self) -> None:
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
        raw_ref = "https://qmdh-media.oss-cn-shenzhen.aliyuncs.com/generated/清洗.png"
        sync_payload = {"data": [{"url": "https://cdn.example.test/out.png"}], "model": "gpt-image-2-count"}

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[_FakeResponse(sync_payload), _FakeBinaryResponse(b"png")],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    adapter.execute(
                        "image.generate",
                        {
                            "prompt": "edit",
                            "aspect_ratio": "16:9",
                            "resolution": "1k",
                            "reference_images": [raw_ref],
                        },
                    )

        submit_body = json.loads(mocked_urlopen.call_args_list[0].args[0].data.decode("utf-8"))
        self.assertIn("%E6%B8%85", submit_body["image_urls"][0])
        self.assertNotEqual(submit_body["image_urls"][0], raw_ref)

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
