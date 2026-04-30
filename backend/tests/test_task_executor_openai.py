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
        self.assertEqual(outcome.cost, 0.5)
        self.assertEqual(outcome.cost_currency, "CNY")
        self.assertEqual(outcome.result["billing"]["billable_units"], 2)
        self.assertEqual(len(outcome.result["storage_paths"]), 2)
        self.assertTrue(outcome.result["storage_path"].startswith("/media/generated/openai_image/"))

        for storage_path in outcome.result["storage_paths"]:
            relative_path = storage_path.replace("/media/", "", 1).replace("/", os.sep)
            file_path = os.path.join(self.tempdir, relative_path)
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
            side_effect=[_FakeResponse(caption_payload), _FakeResponse(generation_payload)],
        ) as mocked_urlopen:
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
        self.assertEqual(outcome.result["storage_path"], "https://cdn.example.test/generated.png")
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

        with patch("app.services.task_executor.urlopen", side_effect=[_FakeResponse(generation_payload)]) as mocked_urlopen:
            outcome = adapter.execute(
                "image.generate",
                {"prompt": "A minimal white gallery with polished concrete floor", "aspect_ratio": "16:9"},
            )

        generation_request = mocked_urlopen.call_args_list[0].args[0]
        generation_body = json.loads(generation_request.data.decode("utf-8"))

        self.assertEqual(generation_body["model"], "FireRedTeam/FireRed-Image-Edit-1.1")
        self.assertTrue(generation_body["image_url"].startswith("data:image/png;base64,"))
        self.assertEqual(outcome.result["storage_path"], "https://cdn.example.test/firered.png")
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

        with patch("app.services.task_executor.urlopen", side_effect=[_FakeResponse(generation_payload)]) as mocked_urlopen:
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
        self.assertEqual(outcome.result["storage_path"], "https://cdn.example.test/firered-reference.png")
        self.assertTrue(outcome.result["reference_image_used"])
        self.assertEqual(outcome.result["image_edit_bridge_mode"], "reference_image")


if __name__ == "__main__":
    unittest.main()
