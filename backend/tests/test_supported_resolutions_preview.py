import os
import unittest

os.environ.setdefault("QMDH_OPENAI_IMAGE_API_KEY", "test-key")

from app.core.config import ImageProviderProfile
from app.services.model_registry import ProviderDefinition
from app.services.task_executor import (
    _apply_supported_resolution_clamp,
    _build_image_request_plan,
    _clamp_resolution_to_supported,
)


class SupportedResolutionClampTests(unittest.TestCase):
    def test_clamp_raises_1k_to_lowest_supported(self) -> None:
        self.assertEqual(_clamp_resolution_to_supported("1k", ("2k", "4k")), "2k")
        self.assertEqual(_clamp_resolution_to_supported("4k", ("2k",)), "2k")
        self.assertEqual(_clamp_resolution_to_supported("2k", ("1k", "2k")), "2k")

    def test_apply_clamp_mutates_payload(self) -> None:
        profile = ImageProviderProfile(
            provider_name="demo",
            api_key="test-key",
            base_url="https://example.com/v1",
            model_name="demo-image",
            strategies={"image.generate": "openai_images"},
            adapter_config={
                "supported_resolutions": ["2k", "4k"],
                "image_size_mode": "literal_tier",
            },
            capabilities=("image.generate",),
        )
        payload = {"resolution": "1k"}
        self.assertEqual(_apply_supported_resolution_clamp(profile, payload), "2k")
        self.assertEqual(payload["resolution"], "2k")

    def test_empty_supported_resolutions_keeps_legacy(self) -> None:
        profile = ImageProviderProfile(
            provider_name="demo",
            api_key="test-key",
            base_url="https://example.com/v1",
            model_name="demo-image",
            strategies={"image.generate": "openai_images"},
            adapter_config={},
            capabilities=("image.generate",),
        )
        payload = {"resolution": "1k"}
        self.assertEqual(_apply_supported_resolution_clamp(profile, payload), "1k")

    def test_literal_tier_preview_body_uses_clamped_size(self) -> None:
        profile = ImageProviderProfile(
            provider_name="seedream-demo",
            api_key="test-key",
            base_url="https://example.com/v1",
            model_name="seedream",
            strategies={"image.generate": "openai_images"},
            adapter_config={
                "image_size_mode": "literal_tier",
                "supported_resolutions": ["2k", "4k"],
            },
            capabilities=("image.generate",),
        )
        definition = ProviderDefinition(
            "seedream-demo",
            "seedream",
            ["image.generate"],
            adapter_kind="openai_compatible",
        )
        plan = _build_image_request_plan(
            profile=profile,
            definition=definition,
            capability="image.generate",
            payload={"prompt": "preview", "resolution": "1k", "aspect_ratio": "1:1"},
            prompt="preview",
        )
        self.assertEqual(plan.body["size"], "2K")
        self.assertEqual(plan.endpoint_path, "/images/generations")


if __name__ == "__main__":
    unittest.main()
