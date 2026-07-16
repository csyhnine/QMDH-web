import json
import os
import shutil
import tempfile
import unittest
from io import BytesIO
from unittest.mock import patch
from urllib.error import HTTPError

os.environ.setdefault("QMDH_OPENAI_IMAGE_API_KEY", "test-key")

from app.core.config import ImageProviderProfile
from app.services.model_registry import ProviderDefinition
from app.services.task_executor import OpenAIImageProviderAdapter, _download_generated_image, _DOWNLOAD_USER_AGENT


class _FakeResponse:
    def __init__(self, payload: dict):
        self.payload = payload
        self.headers = {}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


class _FakeBinaryResponse:
    def __init__(self, payload: bytes, content_type: str = "image/png"):
        self.payload = payload
        self.headers = {"Content-Type": content_type}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self) -> bytes:
        return self.payload


class ToAPIImageProviderAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.mkdtemp(prefix="qmdh-toapis-test-")

    def tearDown(self) -> None:
        shutil.rmtree(self.tempdir, ignore_errors=True)

    def _profile(self, **overrides) -> ImageProviderProfile:
        from dataclasses import replace

        base = ImageProviderProfile(
            provider_name="toapi_gpt_image_vip",
            api_key="test-key",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="gpt-image-2-vip",
            timeout_seconds=30,
            quality="high",
            adapter_config={"unit_price_1k": 1.62, "unit_price_2k": 2.67},
        )
        return replace(base, **overrides) if overrides else base

    def _adapter(self, profile: ImageProviderProfile) -> OpenAIImageProviderAdapter:
        return OpenAIImageProviderAdapter(
            ProviderDefinition(
                profile.provider_name,
                profile.model_name,
                ["image.generate", "image.edit"],
                adapter_kind="openai_compatible",
            ),
            profile,
        )

    def test_toapis_1k_submits_ratio_size_and_polls_async_task(self) -> None:
        profile = self._profile()
        adapter = self._adapter(profile)
        submit_payload = {
            "id": "task_img_abc123",
            "object": "generation.task",
            "model": "gpt-image-2-vip",
            "status": "queued",
        }
        poll_payload = {
            "id": "task_img_abc123",
            "status": "completed",
            "result": {"data": [{"url": "https://cdn.example.test/output-1k.png"}]},
        }

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[
                _FakeResponse(submit_payload),
                _FakeResponse(poll_payload),
                _FakeBinaryResponse(b"png-1k"),
            ],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    with patch("app.services.task_executor.sleep"):
                        outcome = adapter.execute(
                            "image.generate",
                            {
                                "prompt": "A civic library foyer",
                                "aspect_ratio": "16:9",
                                "resolution": "1k",
                            },
                        )

        submit_request = mocked_urlopen.call_args_list[0].args[0]
        poll_request = mocked_urlopen.call_args_list[1].args[0]
        submit_body = json.loads(submit_request.data.decode("utf-8"))

        self.assertTrue(submit_request.full_url.endswith("/images/generations"))
        self.assertEqual(submit_body["model"], "gpt-image-2-vip")
        self.assertEqual(submit_body["size"], "16:9")
        self.assertEqual(submit_body["resolution"], "1k")
        self.assertEqual(submit_body["response_format"], "url")
        self.assertNotIn("output_format", submit_body)
        self.assertTrue(poll_request.full_url.endswith("/images/generations/task_img_abc123"))
        self.assertEqual(outcome.model_name, "gpt-image-2-vip")
        self.assertEqual(outcome.result["adapter_mode"], "haodeya_async_image")
        self.assertEqual(outcome.result["billing"]["resolution_tier"], "1k")
        self.assertEqual(outcome.cost, 1.62)

    def test_toapis_uses_submit_polling_url_when_present(self) -> None:
        profile = self._profile()
        adapter = self._adapter(profile)
        submit_payload = {
            "id": "tsk_img_custom",
            "status": "queued",
            "polling_url": "https://newapi.haodeya.xyz/v1/images/generations/tsk_img_custom",
        }
        poll_payload = {"id": "tsk_img_custom", "status": "completed", "url": "https://cdn.example.test/output.png"}

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[
                _FakeResponse(submit_payload),
                _FakeResponse(poll_payload),
                _FakeBinaryResponse(b"png"),
            ],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    with patch("app.services.task_executor.sleep"):
                        adapter.execute(
                            "image.generate",
                            {"prompt": "A tower", "aspect_ratio": "1:1", "resolution": "1k"},
                        )

        poll_request = mocked_urlopen.call_args_list[1].args[0]
        self.assertEqual(
            poll_request.full_url,
            "https://newapi.haodeya.xyz/v1/images/generations/tsk_img_custom",
        )

    def test_toapis_poll_uses_only_images_generations_path(self) -> None:
        profile = self._profile()
        adapter = self._adapter(profile)
        submit_payload = {"id": "tsk_img_poll", "status": "queued"}

        def urlopen_side_effect(request, **_kwargs):
            if request.full_url.endswith("/images/generations"):
                return _FakeResponse(submit_payload)
            if request.full_url.endswith("/images/generations/tsk_img_poll"):
                body = json.dumps(
                    {"error": {"message": "Invalid URL (GET /v1/images/generations/tsk_img_poll)"}}
                ).encode("utf-8")
                raise HTTPError(request.full_url, 404, "Not Found", {}, BytesIO(body))
            raise AssertionError(f"unexpected url: {request.full_url}")

        with patch("app.services.task_executor.urlopen", side_effect=urlopen_side_effect):
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    with patch("app.services.task_executor.sleep"):
                        with self.assertRaises(Exception) as ctx:
                            adapter.execute(
                                "image.generate",
                                {"prompt": "A tower", "aspect_ratio": "1:1", "resolution": "1k"},
                            )

        self.assertIn("/images/generations/tsk_img_poll", str(ctx.exception))

    def test_toapis_2k_uses_tiered_model_name(self) -> None:
        profile = self._profile()
        adapter = self._adapter(profile)
        submit_payload = {"id": "task_img_2k", "status": "queued"}
        poll_payload = {
            "id": "task_img_2k",
            "status": "completed",
            "result": {"data": [{"url": "https://cdn.example.test/output-2k.png"}]},
        }

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[
                _FakeResponse(submit_payload),
                _FakeResponse(poll_payload),
                _FakeBinaryResponse(b"png-2k"),
            ],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    with patch("app.services.task_executor.sleep"):
                        outcome = adapter.execute(
                            "image.generate",
                            {
                                "prompt": "A civic library foyer",
                                "aspect_ratio": "16:9",
                                "resolution": "2k",
                            },
                        )

        submit_body = json.loads(mocked_urlopen.call_args_list[0].args[0].data.decode("utf-8"))
        self.assertEqual(submit_body["model"], "gpt-image-2-vip-2k")
        self.assertEqual(submit_body["resolution"], "2k")
        self.assertEqual(outcome.model_name, "gpt-image-2-vip-2k")
        self.assertEqual(outcome.result["billing"]["resolution_tier"], "2k")
        self.assertEqual(outcome.cost, 2.67)

    def test_toapis_2k_respects_admin_upstream_model_override(self) -> None:
        profile = self._profile(
            adapter_config={
                "unit_price_1k": 1.62,
                "unit_price_2k": 2.67,
                "upstream_model_2k": "custom-vip-2k-sku",
            }
        )
        adapter = self._adapter(profile)
        submit_payload = {"id": "task_img_2k_override", "status": "queued"}
        poll_payload = {
            "id": "task_img_2k_override",
            "status": "completed",
            "result": {"data": [{"url": "https://cdn.example.test/output-2k.png"}]},
        }

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[
                _FakeResponse(submit_payload),
                _FakeResponse(poll_payload),
                _FakeBinaryResponse(b"png-2k"),
            ],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    with patch("app.services.task_executor.sleep"):
                        outcome = adapter.execute(
                            "image.generate",
                            {
                                "prompt": "Override mapping",
                                "aspect_ratio": "16:9",
                                "resolution": "2k",
                            },
                        )

        submit_body = json.loads(mocked_urlopen.call_args_list[0].args[0].data.decode("utf-8"))
        self.assertEqual(submit_body["model"], "custom-vip-2k-sku")
        self.assertEqual(outcome.model_name, "custom-vip-2k-sku")
        self.assertEqual(outcome.result["billing"]["resolution_tier"], "2k")

    def test_toapis_4k_uses_tiered_model_name(self) -> None:
        profile = self._profile()
        adapter = self._adapter(profile)
        submit_payload = {"id": "task_img_4k", "status": "queued"}
        poll_payload = {
            "id": "task_img_4k",
            "status": "completed",
            "result": {"data": [{"url": "https://cdn.example.test/output-4k.png"}]},
        }

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[
                _FakeResponse(submit_payload),
                _FakeResponse(poll_payload),
                _FakeBinaryResponse(b"png-4k"),
            ],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    with patch("app.services.task_executor.sleep"):
                        outcome = adapter.execute(
                            "image.generate",
                            {
                                "prompt": "4k reserved mapping",
                                "aspect_ratio": "16:9",
                                "resolution": "4k",
                            },
                        )

        submit_body = json.loads(mocked_urlopen.call_args_list[0].args[0].data.decode("utf-8"))
        self.assertEqual(submit_body["model"], "gpt-image-2-vip-4k")
        self.assertEqual(submit_body["resolution"], "4k")
        self.assertEqual(outcome.model_name, "gpt-image-2-vip-4k")
        self.assertEqual(outcome.result["billing"]["resolution_tier"], "4k")
        # No unit_price_4k configured → falls back to 2K then 1K price.
        self.assertEqual(outcome.cost, 2.67)

    def test_toapis_reference_images_use_public_https_urls(self) -> None:
        profile = self._profile()
        adapter = self._adapter(profile)
        submit_payload = {"id": "task_img_ref", "status": "queued"}
        poll_payload = {"id": "task_img_ref", "status": "completed", "url": "https://cdn.example.test/output-ref.png"}

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[
                _FakeResponse(submit_payload),
                _FakeResponse(poll_payload),
                _FakeBinaryResponse(b"png-ref"),
            ],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    with patch("app.services.task_executor.sleep"):
                        outcome = adapter.execute(
                            "image.edit",
                            {
                                "edit_prompt": "Enhance facade quality",
                                "aspect_ratio": "16:9",
                                "resolution": "2k",
                                "reference_images": ["https://cityusbdisk.cn/media/refs/source.png"],
                            },
                        )

        submit_body = json.loads(mocked_urlopen.call_args_list[0].args[0].data.decode("utf-8"))
        self.assertEqual(submit_body["image_urls"], ["https://cityusbdisk.cn/media/refs/source.png"])
        self.assertTrue(outcome.result["reference_image_used"])
        self.assertEqual(outcome.result["reference_image_mode"], "haodeya_async_image_urls")

    def test_toapis_generate_with_reference_images_stays_on_generations_endpoint(self) -> None:
        profile = self._profile()
        adapter = self._adapter(profile)
        submit_payload = {"id": "task_img_gen_ref", "status": "queued"}
        poll_payload = {"id": "task_img_gen_ref", "status": "completed", "url": "https://cdn.example.test/output.png"}

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[
                _FakeResponse(submit_payload),
                _FakeResponse(poll_payload),
                _FakeBinaryResponse(b"png"),
            ],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    with patch("app.services.task_executor.sleep"):
                        adapter.execute(
                            "image.generate",
                            {
                                "prompt": "Keep the same massing",
                                "aspect_ratio": "16:9",
                                "resolution": "1k",
                                "reference_images": ["https://cityusbdisk.cn/media/refs/source.png"],
                            },
                        )

        submit_request = mocked_urlopen.call_args_list[0].args[0]
        self.assertTrue(submit_request.full_url.endswith("/images/generations"))
        submit_body = json.loads(submit_request.data.decode("utf-8"))
        self.assertIn("image_urls", submit_body)

    def test_download_generated_image_sends_non_python_user_agent(self) -> None:
        image_url = "https://files.toapis.com/generated/demo.png"
        with patch(
            "app.services.task_executor.urlopen",
            return_value=_FakeBinaryResponse(b"\x89PNG\r\n\x1a\n", "image/png"),
        ) as mocked_urlopen:
            payload, content_type = _download_generated_image(image_url, timeout_seconds=30)

        self.assertEqual(payload[:4], b"\x89PNG")
        self.assertEqual(content_type, "image/png")
        request = mocked_urlopen.call_args.args[0]
        self.assertEqual(request.full_url, image_url)
        self.assertEqual(request.get_header("User-agent"), _DOWNLOAD_USER_AGENT)
        self.assertNotIn("Python-urllib", request.get_header("User-agent") or "")


if __name__ == "__main__":
    unittest.main()
