import json
import os
import shutil
import tempfile
import unittest
from dataclasses import replace
from unittest.mock import patch

os.environ.setdefault("QMDH_OPENAI_IMAGE_API_KEY", "test-key")

from app.core.config import settings
from app.core.config import ImageProviderProfile
from app.services.model_registry import ProviderDefinition
from app.services.model_registry import get_provider_definition
from app.services.task_executor import OpenAIImageProviderAdapter


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


class OpenAIImageProviderAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.mkdtemp(prefix="qmdh-openai-test-")
        self.openai_api_key_patcher = patch.object(settings, "openai_image_api_key", "test-key")
        self.openai_api_key_patcher.start()
        profile = settings.get_image_provider_profile("openai_image")
        self.adapter = OpenAIImageProviderAdapter(
            get_provider_definition("openai_image"),
            replace(profile, pricing_currency="CNY", pricing_unit="per_image", unit_price=0.25),
        )

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
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    with patch("app.services.task_executor.settings.media_url_prefix", "/media"):
                        with patch("app.services.task_executor.settings.openai_image_model", "gpt-image-1"):
                            outcome = self.adapter.execute(
                                "image.generate",
                                {"prompt": "Tower by the river", "aspect_ratio": "16:9", "image_count": 2},
                            )

        self.assertEqual(outcome.result["adapter_mode"], "openai")
        self.assertEqual(outcome.result["request_strategy"], "openai_images")
        self.assertEqual(outcome.result["request_endpoint"], "/images/generations")
        self.assertEqual(outcome.result["request_url"], "https://api.openai.com/v1/images/generations")
        self.assertEqual(outcome.result["request_timeout_seconds"], self.adapter.profile.timeout_seconds)
        self.assertEqual(outcome.result["usage"]["total_tokens"], 123)
        self.assertEqual(outcome.result["requested_image_count"], 2)
        self.assertEqual(outcome.result["output_count"], 2)
        self.assertEqual(outcome.cost, 0.5)
        self.assertEqual(outcome.cost_currency, "CNY")
        self.assertEqual(outcome.result["billing"]["billable_units"], 2)
        self.assertEqual(len(outcome.result["storage_paths"]), 2)
        self.assertTrue(outcome.result["storage_path"].startswith("generated/openai_image/"))

        for storage_path in outcome.result["storage_paths"]:
            file_path = os.path.join(self.tempdir, storage_path.replace("/", os.sep))
            self.assertTrue(os.path.exists(file_path))
            self.assertGreater(os.path.getsize(file_path), 0)

    def test_modelscope_reference_image_is_captioned_into_generation_prompt(self) -> None:
        profile = ImageProviderProfile(
            provider_name="modelscope_free_image",
            api_key="test-key",
            base_url="https://api-inference.modelscope.cn/v1",
            model_name="MAILAND/majicflus_v1",
            timeout_seconds=1,
            reference_mode="caption_prompt",
            reference_caption_model="Qwen/Test-VL",
        )
        adapter = OpenAIImageProviderAdapter(
            ProviderDefinition(
                "modelscope_free_image",
                "MAILAND/majicflus_v1",
                ["image.generate"],
                adapter_kind="openai_compatible",
            ),
            profile,
        )
        caption_payload = {"choices": [{"message": {"content": "A calm glass riverfront facade at sunrise."}}]}
        generation_payload = {"images": ["https://cdn.example.test/generated.png"]}

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[
                _FakeResponse(caption_payload),
                _FakeResponse(generation_payload),
                _FakeBinaryResponse(b"generated-image"),
            ],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    outcome = adapter.execute(
                        "image.generate",
                        {
                            "prompt": "Design a waterfront commercial entrance",
                            "aspect_ratio": "16:9",
                            "reference_image": "data:image/png;base64,aGVsbG8=",
                        },
                    )

        generation_request = mocked_urlopen.call_args_list[1].args[0]
        generation_body = json.loads(generation_request.data.decode("utf-8"))

        self.assertIn("Reference image analysis", generation_body["prompt"])
        self.assertIn("A calm glass riverfront facade at sunrise.", generation_body["prompt"])
        self.assertTrue(outcome.result["storage_path"].startswith("generated/modelscope_free_image/"))
        self.assertTrue(outcome.result["reference_image_used"])
        self.assertEqual(outcome.result["reference_caption_model"], "Qwen/Test-VL")

    def test_firered_uses_white_canvas_bridge_without_reference_image(self) -> None:
        profile = ImageProviderProfile(
            provider_name="modelscope_firered_image_edit",
            api_key="test-key",
            base_url="https://api-inference.modelscope.cn/v1",
            model_name="FireRedTeam/FireRed-Image-Edit-1.1",
            timeout_seconds=1,
            reference_mode="caption_prompt",
            reference_caption_model="Qwen/Test-VL",
        )
        adapter = OpenAIImageProviderAdapter(
            ProviderDefinition(
                "modelscope_firered_image_edit",
                "FireRedTeam/FireRed-Image-Edit-1.1",
                ["image.generate", "image.edit"],
                adapter_kind="openai_compatible",
            ),
            profile,
        )
        generation_payload = {"images": ["https://cdn.example.test/firered.png"]}

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[_FakeResponse(generation_payload), _FakeBinaryResponse(b"firered-image")],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    outcome = adapter.execute(
                        "image.generate",
                        {"prompt": "A minimal white gallery with polished concrete floor", "aspect_ratio": "16:9"},
                    )

        generation_request = mocked_urlopen.call_args_list[0].args[0]
        generation_body = json.loads(generation_request.data.decode("utf-8"))

        self.assertEqual(generation_body["model"], "FireRedTeam/FireRed-Image-Edit-1.1")
        self.assertTrue(generation_body["image_url"].startswith("data:image/png;base64,"))
        self.assertTrue(outcome.result["storage_path"].startswith("generated/modelscope_firered_image_edit/"))
        self.assertTrue(outcome.result["image_edit_bridge_used"])
        self.assertEqual(outcome.result["image_edit_bridge_mode"], "white_canvas")

    def test_firered_uses_uploaded_reference_image_for_bridge(self) -> None:
        profile = ImageProviderProfile(
            provider_name="modelscope_firered_image_edit",
            api_key="test-key",
            base_url="https://api-inference.modelscope.cn/v1",
            model_name="FireRedTeam/FireRed-Image-Edit-1.1",
            timeout_seconds=1,
            reference_mode="caption_prompt",
            reference_caption_model="Qwen/Test-VL",
        )
        adapter = OpenAIImageProviderAdapter(
            ProviderDefinition(
                "modelscope_firered_image_edit",
                "FireRedTeam/FireRed-Image-Edit-1.1",
                ["image.generate", "image.edit"],
                adapter_kind="openai_compatible",
            ),
            profile,
        )
        reference_image = "data:image/png;base64,cmVmZXJlbmNl"
        generation_payload = {"images": ["https://cdn.example.test/firered-reference.png"]}

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[_FakeResponse(generation_payload), _FakeBinaryResponse(b"firered-reference-image")],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    outcome = adapter.execute(
                        "image.edit",
                        {
                            "edit_prompt": "Enhance the architectural atmosphere",
                            "aspect_ratio": "16:9",
                            "source_image": reference_image,
                        },
                    )

        generation_request = mocked_urlopen.call_args_list[0].args[0]
        generation_body = json.loads(generation_request.data.decode("utf-8"))

        self.assertEqual(generation_body["image_url"], reference_image)
        self.assertTrue(outcome.result["storage_path"].startswith("generated/modelscope_firered_image_edit/"))
        self.assertTrue(outcome.result["reference_image_used"])
        self.assertEqual(outcome.result["image_edit_bridge_mode"], "reference_image")

    def test_image_edit_models_use_white_canvas_fallback_without_uploaded_image(self) -> None:
        profile = ImageProviderProfile(
            provider_name="ms_qwen_qwen-image-edit",
            api_key="test-key",
            base_url="https://api-inference.modelscope.cn/v1",
            model_name="Qwen/Qwen-Image-Edit",
            timeout_seconds=1,
            reference_mode="disabled",
        )
        adapter = OpenAIImageProviderAdapter(
            ProviderDefinition(
                "ms_qwen_qwen-image-edit",
                "Qwen/Qwen-Image-Edit",
                ["image.edit"],
                adapter_kind="openai_compatible",
            ),
            profile,
        )
        generation_payload = {"images": ["https://cdn.example.test/qwen-image-edit.png"]}

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[_FakeResponse(generation_payload), _FakeBinaryResponse(b"qwen-image-edit")],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    outcome = adapter.execute(
                        "image.edit",
                        {
                            "edit_prompt": "Turn the scene into a rainy cinematic night shot",
                            "aspect_ratio": "16:9",
                        },
                    )

        generation_request = mocked_urlopen.call_args_list[0].args[0]
        generation_body = json.loads(generation_request.data.decode("utf-8"))

        self.assertEqual(generation_body["model"], "Qwen/Qwen-Image-Edit")
        self.assertTrue(generation_body["image_url"].startswith("data:image/png;base64,"))
        self.assertTrue(outcome.result["storage_path"].startswith("generated/ms_qwen_qwen-image-edit/"))
        self.assertFalse(outcome.result["reference_image_used"])
        self.assertEqual(outcome.result["image_edit_bridge_mode"], "white_canvas")

    def test_gpt_image_2_with_multiple_reference_images_uses_native_edit_endpoint_even_in_generate_mode(self) -> None:
        profile = ImageProviderProfile(
            provider_name="openai_gpt_image_2",
            api_key="test-key",
            base_url="https://api.openai.com/v1",
            model_name="gpt-image-2",
            timeout_seconds=1,
            reference_mode="disabled",
        )
        adapter = OpenAIImageProviderAdapter(
            ProviderDefinition(
                "openai_gpt_image_2",
                "gpt-image-2",
                ["image.generate", "image.edit"],
                adapter_kind="openai_compatible",
            ),
            profile,
        )
        reference_images = [
            "data:image/png;base64,cmVmZXJlbmNlMQ==",
            "data:image/png;base64,cmVmZXJlbmNlMg==",
        ]
        generation_payload = {"data": [{"b64_json": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yh3cAAAAASUVORK5CYII="}]}

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[_FakeResponse(generation_payload)],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    outcome = adapter.execute(
                        "image.generate",
                        {
                            "prompt": "Keep the same massing and camera angle, enhance facade quality",
                            "aspect_ratio": "16:9",
                            "reference_images": reference_images,
                            "reference_image": reference_images[0],
                        },
                    )

        generation_request = mocked_urlopen.call_args_list[0].args[0]
        generation_body = json.loads(generation_request.data.decode("utf-8"))

        self.assertTrue(generation_request.full_url.endswith("/images/edits"))
        self.assertEqual(generation_body["model"], "gpt-image-2")
        self.assertEqual(len(generation_body["images"]), 2)
        self.assertEqual(generation_body["images"][0]["image_url"], reference_images[0])
        self.assertEqual(generation_body["images"][1]["image_url"], reference_images[1])
        self.assertTrue(outcome.result["reference_image_used"])
        self.assertEqual(outcome.result["reference_image_count"], 2)
        self.assertTrue(outcome.result["native_image_edit_used"])
        self.assertEqual(outcome.result["native_image_edit_fallback_from"], "image.generate")
        self.assertTrue(outcome.result["storage_path"].startswith("generated/openai_gpt_image_2/"))

    def test_chat_modalities_image_strategy_uses_chat_completions_with_modalities(self) -> None:
        profile = ImageProviderProfile(
            provider_name="openrouter_gemini_image",
            api_key="test-key",
            base_url="https://openrouter.example.test/v1",
            model_name="google/gemini-3.1-flash-image-preview",
            timeout_seconds=1,
            strategies={
                "chat.completions": "openai_chat",
                "image.generate": "chat_modalities_image",
                "image.edit": "chat_modalities_image_edit",
            },
        )
        adapter = OpenAIImageProviderAdapter(
            ProviderDefinition(
                "openrouter_gemini_image",
                "google/gemini-3.1-flash-image-preview",
                ["image.generate", "image.edit", "chat.completions"],
                adapter_kind="openai_compatible",
            ),
            profile,
        )
        generation_payload = {
            "choices": [
                {
                    "message": {
                        "content": [
                            {"type": "image_url", "image_url": {"url": "https://cdn.example.test/generated-chat-image.png"}}
                        ]
                    }
                }
            ]
        }

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[_FakeResponse(generation_payload), _FakeBinaryResponse(b"chat-image")],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    outcome = adapter.execute(
                        "image.generate",
                        {"prompt": "Render a compact cultural pavilion", "aspect_ratio": "1:1"},
                    )

        generation_request = mocked_urlopen.call_args_list[0].args[0]
        generation_body = json.loads(generation_request.data.decode("utf-8"))

        self.assertTrue(generation_request.full_url.endswith("/chat/completions"))
        self.assertEqual(generation_body["modalities"], ["image", "text"])
        self.assertEqual(generation_body["image_config"]["aspect_ratio"], "1:1")
        self.assertEqual(outcome.result["request_strategy"], "chat_modalities_image")
        self.assertEqual(outcome.result["request_endpoint"], "/chat/completions")
        self.assertEqual(outcome.result["request_url"], "https://openrouter.example.test/v1/chat/completions")

    def test_chat_modalities_image_edit_strategy_sends_multimodal_message(self) -> None:
        profile = ImageProviderProfile(
            provider_name="openrouter_gemini_image",
            api_key="test-key",
            base_url="https://openrouter.example.test/v1",
            model_name="google/gemini-3.1-flash-image-preview",
            timeout_seconds=1,
            strategies={
                "image.generate": "chat_modalities_image",
                "image.edit": "chat_modalities_image_edit",
            },
        )
        adapter = OpenAIImageProviderAdapter(
            ProviderDefinition(
                "openrouter_gemini_image",
                "google/gemini-3.1-flash-image-preview",
                ["image.generate", "image.edit"],
                adapter_kind="openai_compatible",
            ),
            profile,
        )
        generation_payload = {
            "choices": [
                {
                    "message": {
                        "content": [
                            {"type": "image_url", "image_url": {"url": "https://cdn.example.test/generated-chat-edit.png"}}
                        ]
                    }
                }
            ]
        }
        reference_image = "data:image/png;base64,cmVmZXJlbmNlLWltYWdl"

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[_FakeResponse(generation_payload), _FakeBinaryResponse(b"chat-edit-image")],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    outcome = adapter.execute(
                        "image.edit",
                        {
                            "edit_prompt": "Preserve the massing and enrich facade rhythm",
                            "aspect_ratio": "16:9",
                            "source_image": reference_image,
                        },
                    )

        generation_request = mocked_urlopen.call_args_list[0].args[0]
        generation_body = json.loads(generation_request.data.decode("utf-8"))
        content = generation_body["messages"][0]["content"]

        self.assertTrue(generation_request.full_url.endswith("/chat/completions"))
        self.assertEqual(generation_body["modalities"], ["image", "text"])
        self.assertEqual(content[0]["type"], "text")
        self.assertEqual(content[1]["type"], "image_url")
        self.assertEqual(content[1]["image_url"]["url"], reference_image)
        self.assertEqual(outcome.result["request_strategy"], "chat_modalities_image_edit")

    def test_chat_modalities_smart_ratio_resolves_to_provider_whitelist(self) -> None:
        profile = ImageProviderProfile(
            provider_name="openrouter_gpt_image",
            api_key="test-key",
            base_url="https://openrouter.example.test/v1",
            model_name="openai/gpt-5.4-image-2",
            timeout_seconds=1,
            strategies={"image.generate": "chat_modalities_image"},
        )
        adapter = OpenAIImageProviderAdapter(
            ProviderDefinition(
                "openrouter_gpt_image",
                "openai/gpt-5.4-image-2",
                ["image.generate"],
                adapter_kind="openai_compatible",
            ),
            profile,
        )
        generation_payload = {
            "choices": [
                {
                    "message": {
                        "content": [
                            {"type": "image_url", "image_url": {"url": "https://cdn.example.test/generated-smart.png"}}
                        ]
                    }
                }
            ]
        }

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[_FakeResponse(generation_payload), _FakeBinaryResponse(b"smart-image")],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    outcome = adapter.execute(
                        "image.generate",
                        {"prompt": "Render a compact cultural pavilion", "aspect_ratio": "智能"},
                    )

        generation_body = json.loads(mocked_urlopen.call_args_list[0].args[0].data.decode("utf-8"))
        self.assertEqual(generation_body["image_config"]["aspect_ratio"], "1:1")
        self.assertEqual(outcome.result["aspect_ratio"], "1:1")
        self.assertEqual(outcome.result["aspect_ratio_requested"], "智能")

    def test_gemini_image_preview_defaults_to_chat_modalities_strategy_when_strategies_are_empty(self) -> None:
        profile = ImageProviderProfile(
            provider_name="google_gemini-3.1-flash-image-preview",
            api_key="test-key",
            base_url="https://newapi.example.test/v1",
            model_name="google/gemini-3.1-flash-image-preview",
            timeout_seconds=1,
            strategies={},
        )
        adapter = OpenAIImageProviderAdapter(
            ProviderDefinition(
                "google_gemini-3.1-flash-image-preview",
                "google/gemini-3.1-flash-image-preview",
                ["image.generate", "image.edit"],
                adapter_kind="openai_compatible",
            ),
            profile,
        )
        generation_payload = {
            "choices": [
                {
                    "message": {
                        "content": [
                            {"type": "image_url", "image_url": {"url": "https://cdn.example.test/generated-gemini.png"}}
                        ]
                    }
                }
            ]
        }

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[_FakeResponse(generation_payload), _FakeBinaryResponse(b"gemini-image")],
        ) as mocked_urlopen:
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    outcome = adapter.execute(
                        "image.generate",
                        {"prompt": "Render a museum atrium skylight", "aspect_ratio": "1:1"},
                    )

        generation_request = mocked_urlopen.call_args_list[0].args[0]
        generation_body = json.loads(generation_request.data.decode("utf-8"))
        self.assertTrue(generation_request.full_url.endswith("/chat/completions"))
        self.assertEqual(generation_body["modalities"], ["image", "text"])
        self.assertEqual(outcome.result["request_strategy"], "chat_modalities_image")

    def test_chat_modalities_message_images_are_normalized_from_nested_image_url(self) -> None:
        profile = ImageProviderProfile(
            provider_name="openrouter_gemini_image",
            api_key="test-key",
            base_url="https://openrouter.example.test/v1",
            model_name="google/gemini-3.1-flash-image-preview",
            timeout_seconds=1,
            strategies={"image.generate": "chat_modalities_image"},
        )
        adapter = OpenAIImageProviderAdapter(
            ProviderDefinition(
                "openrouter_gemini_image",
                "google/gemini-3.1-flash-image-preview",
                ["image.generate"],
                adapter_kind="openai_compatible",
            ),
            profile,
        )
        generation_payload = {
            "choices": [
                {
                    "message": {
                        "images": [
                            {"image_url": {"url": "https://cdn.example.test/generated-nested-image.png"}}
                        ]
                    }
                }
            ]
        }

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[_FakeResponse(generation_payload), _FakeBinaryResponse(b"nested-image")],
        ):
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    outcome = adapter.execute(
                        "image.generate",
                        {"prompt": "Render a civic library foyer", "aspect_ratio": "1:1"},
                    )

        self.assertTrue(outcome.result["storage_path"].startswith("generated/openrouter_gemini_image/"))

    def test_chat_modalities_message_images_data_url_are_normalized_to_b64(self) -> None:
        profile = ImageProviderProfile(
            provider_name="openrouter_gemini_image",
            api_key="test-key",
            base_url="https://openrouter.example.test/v1",
            model_name="google/gemini-3.1-flash-image-preview",
            timeout_seconds=1,
            strategies={"image.generate": "chat_modalities_image"},
        )
        adapter = OpenAIImageProviderAdapter(
            ProviderDefinition(
                "openrouter_gemini_image",
                "google/gemini-3.1-flash-image-preview",
                ["image.generate"],
                adapter_kind="openai_compatible",
            ),
            profile,
        )
        data_url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yh3cAAAAASUVORK5CYII="
        generation_payload = {
            "choices": [
                {
                    "message": {
                        "images": [
                            {"image_url": {"url": data_url}}
                        ]
                    }
                }
            ]
        }

        with patch(
            "app.services.task_executor.urlopen",
            side_effect=[_FakeResponse(generation_payload)],
        ):
            with patch("app.services.task_executor.settings.media_root", self.tempdir):
                with patch("app.services.task_executor.settings.storage_backend", "local"):
                    outcome = adapter.execute(
                        "image.generate",
                        {"prompt": "Render a civic library foyer", "aspect_ratio": "1:1"},
                    )

        self.assertTrue(outcome.result["storage_path"].startswith("generated/openrouter_gemini_image/"))


if __name__ == "__main__":
    unittest.main()
