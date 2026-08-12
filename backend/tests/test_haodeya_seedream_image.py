import unittest

from app.services.model_registry import ImageProviderProfile, ProviderDefinition
from app.services.task_executor import (
    _build_image_request_plan,
    _seedream_image_size,
    _uses_haodeya_seedream_image,
    _uses_haodeya_wan_image,
)


class HaodeyaSeedreamImageTests(unittest.TestCase):
    def _profile(self, **overrides) -> ImageProviderProfile:
        from dataclasses import replace

        base = ImageProviderProfile(
            provider_name="doubao-seedream",
            api_key="test-key",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="doubao-seedream-5.0-lite",
            timeout_seconds=30,
            quality="high",
            output_format="png",
            strategies={"image.generate": "openai_images"},
            adapter_config={},
            capabilities=("image.generate",),
        )
        return replace(base, **overrides) if overrides else base

    def test_detects_seedream_and_not_wan(self) -> None:
        profile = self._profile()
        self.assertTrue(_uses_haodeya_seedream_image(profile))
        self.assertFalse(_uses_haodeya_wan_image(profile))

    def test_seedream_size_never_1k_or_pixels(self) -> None:
        profile = self._profile()
        self.assertEqual(_seedream_image_size(profile, {"resolution": "1k", "aspect_ratio": "1:1"}), "2K")
        self.assertEqual(_seedream_image_size(profile, {"resolution": "2k", "aspect_ratio": "1:1"}), "2K")
        self.assertEqual(_seedream_image_size(profile, {"resolution": "4k", "aspect_ratio": "1:1"}), "4K")

    def test_seedream_size_maps_aspect_ratio_to_pixels(self) -> None:
        profile = self._profile()
        self.assertEqual(
            _seedream_image_size(profile, {"resolution": "2k", "aspect_ratio": "16:9"}),
            "2560x1440",
        )
        self.assertEqual(
            _seedream_image_size(profile, {"resolution": "2k", "aspect_ratio": "9:16"}),
            "1440x2560",
        )
        self.assertEqual(
            _seedream_image_size(profile, {"resolution": "4k", "aspect_ratio": "16:9"}),
            "3840x2160",
        )

    def test_request_body_uses_literal_tier_size(self) -> None:
        profile = self._profile()
        definition = ProviderDefinition(
            profile.provider_name,
            profile.model_name,
            ["image.generate"],
            adapter_kind="openai_compatible",
        )
        plan = _build_image_request_plan(
            profile=profile,
            definition=definition,
            capability="image.generate",
            payload={"prompt": "生成一个女孩在跳舞", "resolution": "1k", "aspect_ratio": "1:1"},
            prompt="生成一个女孩在跳舞",
        )
        self.assertEqual(plan.body["model"], "doubao-seedream-5.0-lite")
        self.assertEqual(plan.body["size"], "2K")
        self.assertNotIn("quality", plan.body)
        self.assertNotIn("output_format", plan.body)
        self.assertNotEqual(plan.body["size"], "1024x1024")
        self.assertNotEqual(plan.body["size"], "1K")

    def test_request_body_16x9_uses_pixel_size(self) -> None:
        profile = self._profile()
        definition = ProviderDefinition(
            profile.provider_name,
            profile.model_name,
            ["image.generate"],
            adapter_kind="openai_compatible",
        )
        plan = _build_image_request_plan(
            profile=profile,
            definition=definition,
            capability="image.generate",
            payload={"prompt": "wide", "resolution": "2k", "aspect_ratio": "16:9"},
            prompt="wide",
        )
        self.assertEqual(plan.body["size"], "2560x1440")
        self.assertEqual(plan.body["model"], "doubao-seedream-5.0-lite")

    def test_i2i_injects_image_on_generations_not_edits(self) -> None:
        profile = self._profile()
        definition = ProviderDefinition(
            profile.provider_name,
            profile.model_name,
            ["image.generate", "image.edit"],
            adapter_kind="openai_compatible",
        )
        ref_url = "https://cdn.example.com/ref.png"
        plan = _build_image_request_plan(
            profile=profile,
            definition=definition,
            capability="image.edit",
            payload={
                "prompt": "让裙子变成蓝色",
                "resolution": "2k",
                "aspect_ratio": "16:9",
                "reference_images": [ref_url],
            },
            prompt="让裙子变成蓝色",
        )
        self.assertEqual(plan.endpoint_path, "/images/generations")
        self.assertEqual(plan.body["image"], [ref_url])
        self.assertEqual(plan.body["size"], "2560x1440")
        self.assertTrue(plan.reference_result.get("reference_image_used"))
        self.assertEqual(plan.reference_result.get("reference_image_mode"), "haodeya_seedream_image")
        self.assertFalse(plan.multipart_files)

    def test_generate_with_ref_still_uses_image_field(self) -> None:
        profile = self._profile()
        definition = ProviderDefinition(
            profile.provider_name,
            profile.model_name,
            ["image.generate", "image.edit"],
            adapter_kind="openai_compatible",
        )
        ref_url = "https://cdn.example.com/a.png"
        plan = _build_image_request_plan(
            profile=profile,
            definition=definition,
            capability="image.generate",
            payload={
                "prompt": "change outfit",
                "resolution": "2k",
                "aspect_ratio": "1:1",
                "reference_image": ref_url,
            },
            prompt="change outfit",
        )
        self.assertEqual(plan.endpoint_path, "/images/generations")
        self.assertEqual(plan.body["image"], [ref_url])
        self.assertEqual(plan.body["size"], "2K")
        self.assertNotIn("image_url", plan.body)


if __name__ == "__main__":
    unittest.main()
