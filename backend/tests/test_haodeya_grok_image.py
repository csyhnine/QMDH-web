import unittest
from dataclasses import replace
from unittest.mock import patch

from app.services.model_registry import ImageProviderProfile, ProviderDefinition
from app.services.task_executor import (
    _build_image_request_plan,
    _grok_image_request_body,
    _grok_reference_image_value,
    _should_use_chat_modalities_plan_for_2k,
    _uses_haodeya_grok_image,
    _uses_haodeya_seedream_image,
    OPENAI_IMAGES_STRATEGY,
)


class HaodeyaGrokImageTests(unittest.TestCase):
    def _profile(self, **overrides) -> ImageProviderProfile:
        base = ImageProviderProfile(
            provider_name="x-ai/grok-imagine-image",
            api_key="test-key",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="x-ai/grok-imagine-image-2.0",
            timeout_seconds=30,
            quality="medium",
            output_format="png",
            strategies={"image.generate": "openai_images"},
            adapter_config={"upstream_model_2k": "x-ai/grok-imagine-image-2.0-2k"},
            capabilities=("image.generate", "image.edit"),
        )
        return replace(base, **overrides) if overrides else base

    def _definition(self, profile: ImageProviderProfile) -> ProviderDefinition:
        return ProviderDefinition(
            profile.provider_name,
            profile.model_name,
            list(profile.capabilities),
            adapter_kind="openai_compatible",
        )

    def test_detects_grok_image_not_seedream(self) -> None:
        profile = self._profile()
        self.assertTrue(_uses_haodeya_grok_image(profile))
        self.assertFalse(_uses_haodeya_seedream_image(profile))

    def test_grok_video_flavor_is_not_image(self) -> None:
        profile = self._profile(model_name="x-ai/grok-imagine-video")
        self.assertFalse(_uses_haodeya_grok_image(profile))

    def test_1k_16x9_uses_pixel_size_not_aspect_ratio(self) -> None:
        profile = self._profile()
        body = _grok_image_request_body(
            profile=profile,
            payload={"resolution": "1k", "aspect_ratio": "16:9"},
            prompt="wide scene",
        )
        self.assertEqual(body["model"], "x-ai/grok-imagine-image-2.0")
        self.assertEqual(body["size"], "1536x1024")
        self.assertNotIn("aspect_ratio", body)
        self.assertNotIn("modalities", body)

    def test_2k_16x9_uses_aspect_ratio_and_2k_model(self) -> None:
        profile = self._profile()
        body = _grok_image_request_body(
            profile=profile,
            payload={"resolution": "2k", "aspect_ratio": "16:9"},
            prompt="wide scene",
        )
        self.assertEqual(body["model"], "x-ai/grok-imagine-image-2.0-2k")
        self.assertEqual(body["aspect_ratio"], "16:9")
        self.assertNotIn("size", body)
        self.assertNotIn("image_config", body)

    def test_request_plan_stays_on_images_generations(self) -> None:
        profile = self._profile()
        plan = _build_image_request_plan(
            profile=profile,
            definition=self._definition(profile),
            capability="image.generate",
            payload={"prompt": "test", "resolution": "2k", "aspect_ratio": "16:9"},
            prompt="test",
        )
        self.assertEqual(plan.endpoint_path, "/images/generations")
        self.assertEqual(plan.strategy, OPENAI_IMAGES_STRATEGY)
        self.assertEqual(plan.adapter_mode, "haodeya_grok_image")
        self.assertEqual(plan.body["model"], "x-ai/grok-imagine-image-2.0-2k")
        self.assertEqual(plan.body["aspect_ratio"], "16:9")
        self.assertNotIn("modalities", plan.body)

    def test_chat_modalities_2k_hijack_disabled_for_grok(self) -> None:
        profile = self._profile()
        self.assertFalse(
            _should_use_chat_modalities_plan_for_2k(
                profile=profile,
                strategy=OPENAI_IMAGES_STRATEGY,
                payload={"resolution": "2k", "aspect_ratio": "16:9"},
            )
        )

    def test_i2i_uses_image_urls_on_generations(self) -> None:
        profile = self._profile()
        ref_url = "https://cdn.example.com/ref.png"
        plan = _build_image_request_plan(
            profile=profile,
            definition=self._definition(profile),
            capability="image.edit",
            payload={
                "prompt": "change outfit",
                "resolution": "2k",
                "aspect_ratio": "16:9",
                "reference_images": [ref_url],
            },
            prompt="change outfit",
        )
        self.assertEqual(plan.endpoint_path, "/images/generations")
        self.assertEqual(plan.body["image_urls"], [ref_url])
        self.assertEqual(plan.body["aspect_ratio"], "16:9")
        self.assertEqual(plan.reference_result.get("reference_image_mode"), "haodeya_grok_image")
        self.assertFalse(plan.multipart_files)

    def test_i2i_inlines_local_media_as_data_urls(self) -> None:
        profile = self._profile()
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
        with patch(
            "app.services.task_executor._load_reference_image_bytes",
            return_value=(png, "ref.png", "image/png"),
        ):
            value = _grok_reference_image_value("/media/references/ref.png")
            self.assertTrue(value.startswith("data:image/png;base64,"))

            plan = _build_image_request_plan(
                profile=profile,
                definition=self._definition(profile),
                capability="image.edit",
                payload={
                    "prompt": "change outfit",
                    "resolution": "2k",
                    "aspect_ratio": "16:9",
                    "reference_images": ["/media/references/ref.png"],
                },
                prompt="change outfit",
            )
        self.assertTrue(str(plan.body["image_urls"][0]).startswith("data:image/png;base64,"))
        self.assertEqual(plan.reference_result.get("reference_image_mode"), "haodeya_grok_image_inline")

    def test_i2i_inlines_own_public_https_media_paths(self) -> None:
        profile = self._profile()
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
        public_url = "https://cityusbdisk.cn/media/references/ref.png"
        with patch("app.services.task_executor.settings.public_media_base_url", "https://cityusbdisk.cn"):
            with patch("app.services.task_executor.settings.media_url_prefix", "/media"):
                with patch(
                    "app.services.task_executor._load_reference_image_bytes",
                    return_value=(png, "ref.png", "image/png"),
                ) as load_mock:
                    value = _grok_reference_image_value(public_url)
        load_mock.assert_called_once()
        self.assertTrue(value.startswith("data:image/png;base64,"))

    def test_follow_source_2k_infers_aspect_from_reference(self) -> None:
        profile = self._profile()
        ref_url = "https://cdn.example.com/ref.png"
        with patch(
            "app.services.image_aspect_ratio.dimensions_from_reference_images",
            return_value=(1920, 1080),
        ):
            body = _grok_image_request_body(
                profile=profile,
                payload={
                    "resolution": "2k",
                    "aspect_ratio": "遵循原图",
                    "reference_image": ref_url,
                },
                prompt="match reference",
            )
        self.assertEqual(body["aspect_ratio"], "16:9")
        self.assertNotIn("size", body)


if __name__ == "__main__":
    unittest.main()
