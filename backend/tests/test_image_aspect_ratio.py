import struct
import unittest
from unittest.mock import patch

from app.services.image_aspect_ratio import (
    GEMINI_IMAGE_ASPECT_RATIOS,
    GPT_IMAGE_ASPECT_RATIOS,
    nearest_aspect_ratio,
    resolve_image_aspect_ratio,
)


class ImageAspectRatioTests(unittest.TestCase):
    def test_nearest_aspect_ratio_picks_closest_option(self) -> None:
        self.assertEqual(nearest_aspect_ratio(1.78, GPT_IMAGE_ASPECT_RATIOS), "16:9")
        self.assertEqual(nearest_aspect_ratio(0.75, GPT_IMAGE_ASPECT_RATIOS), "3:4")

    def test_smart_ratio_without_reference_defaults_to_fallback(self) -> None:
        resolved = resolve_image_aspect_ratio(
            "智能",
            provider_name="openrouter_gpt_image",
            model_name="openai/gpt-5.4-image-2",
            reference_images=[],
            default="1:1",
        )
        self.assertEqual(resolved, "1:1")

    def test_smart_ratio_uses_reference_dimensions(self) -> None:
        png = bytearray(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
        png.extend(struct.pack(">II", 1920, 1080))
        png.extend(b"\x00" * 8)

        with patch(
            "app.services.image_aspect_ratio.dimensions_from_reference_images",
            return_value=(1920, 1080),
        ):
            resolved = resolve_image_aspect_ratio(
                "智能",
                provider_name="openrouter_gemini_image",
                model_name="google/gemini-3.1-flash-image-preview",
                reference_images=["/media/references/sample.png"],
            )

        self.assertEqual(resolved, "16:9")

    def test_unknown_ratio_snaps_to_nearest_allowed(self) -> None:
        resolved = resolve_image_aspect_ratio(
            "4:1",
            provider_name="openrouter_gpt_image",
            model_name="openai/gpt-5.4-image-2",
        )
        self.assertIn(resolved, GPT_IMAGE_ASPECT_RATIOS)
        self.assertEqual(resolved, "21:9")

    def test_gemini_allows_extra_ratios(self) -> None:
        resolved = resolve_image_aspect_ratio(
            "4:1",
            provider_name="nano_banana",
            model_name="google/gemini-image",
        )
        self.assertEqual(resolved, "4:1")
        self.assertIn(resolved, GEMINI_IMAGE_ASPECT_RATIOS)
