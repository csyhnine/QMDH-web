import struct
import unittest
from unittest.mock import patch

from app.services.image_aspect_ratio import (
    GEMINI_IMAGE_ASPECT_RATIOS,
    GPT_IMAGE_ASPECT_RATIOS,
    nearest_aspect_ratio,
    openai_pixel_size_for_aspect_ratio,
    pixel_size_from_reference_images,
    resolve_image_aspect_ratio,
    resolve_size_aspect_for_reference,
)


class ImageAspectRatioTests(unittest.TestCase):
    def test_nearest_aspect_ratio_picks_closest_option(self) -> None:
        self.assertEqual(nearest_aspect_ratio(1.78, GPT_IMAGE_ASPECT_RATIOS), "16:9")
        self.assertEqual(nearest_aspect_ratio(0.75, GPT_IMAGE_ASPECT_RATIOS), "3:4")

    def test_match_ratio_without_reference_defaults_to_fallback(self) -> None:
        resolved = resolve_image_aspect_ratio(
            "匹配比例",
            provider_name="openrouter_gpt_image",
            model_name="openai/gpt-5.4-image-2",
            reference_images=[],
            default="1:1",
        )
        self.assertEqual(resolved, "1:1")

    def test_match_ratio_ignores_reference_dimensions(self) -> None:
        with patch(
            "app.services.image_aspect_ratio.dimensions_from_reference_images",
            return_value=(1920, 1080),
        ):
            resolved = resolve_image_aspect_ratio(
                "匹配比例",
                provider_name="openrouter_gemini_image",
                model_name="google/gemini-3.1-flash-image-preview",
                reference_images=["/media/references/sample.png"],
            )
        self.assertEqual(resolved, "1:1")

    def test_legacy_smart_ratio_label_still_resolves(self) -> None:
        resolved = resolve_image_aspect_ratio(
            "智能",
            provider_name="openrouter_gpt_image",
            model_name="openai/gpt-5.4-image-2",
            reference_images=[],
            default="1:1",
        )
        self.assertEqual(resolved, "1:1")

    def test_empty_aspect_ratio_does_not_infer_in_generic_resolver(self) -> None:
        with patch(
            "app.services.image_aspect_ratio.dimensions_from_reference_images",
            return_value=(1920, 1080),
        ):
            resolved = resolve_image_aspect_ratio(
                "",
                provider_name="openrouter_gemini_image",
                model_name="google/gemini-3.1-flash-image-preview",
                reference_images=["/media/references/sample.png"],
            )

        self.assertEqual(resolved, "1:1")

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

    def test_follow_source_label_does_not_infer_in_generic_resolver(self) -> None:
        with patch(
            "app.services.image_aspect_ratio.dimensions_from_reference_images",
            return_value=(1920, 1080),
        ):
            resolved = resolve_image_aspect_ratio(
                "遵循原图",
                provider_name="gpt-image-2-count",
                model_name="gpt-image-2-count",
                reference_images=["/media/references/wide.png"],
            )
        self.assertEqual(resolved, "1:1")

    def test_resolve_size_aspect_for_reference_prefers_dimensions_when_follow_source(self) -> None:
        with patch(
            "app.services.image_aspect_ratio.dimensions_from_reference_images",
            return_value=(1920, 1080),
        ):
            resolved = resolve_size_aspect_for_reference(
                "遵循原图",
                provider_name="gpt-image-2-count",
                model_name="gpt-image-2-count",
                reference_images=["/media/references/wide.png"],
                follow_source=True,
            )
        self.assertEqual(resolved, "16:9")

    def test_resolve_size_aspect_for_reference_does_not_override_explicit_ratio(self) -> None:
        with patch(
            "app.services.image_aspect_ratio.dimensions_from_reference_images",
            return_value=(1920, 1080),
        ):
            resolved = resolve_size_aspect_for_reference(
                "1:1",
                provider_name="gpt-image-2-count",
                model_name="gpt-image-2-count",
                reference_images=["/media/references/wide.png"],
                follow_source=True,
            )
        self.assertEqual(resolved, "1:1")

    def test_openai_pixel_size_maps_landscape_ratio(self) -> None:
        self.assertEqual(openai_pixel_size_for_aspect_ratio("16:9"), "1536x1024")
        self.assertEqual(openai_pixel_size_for_aspect_ratio("unknown"), "1024x1024")

    def test_pixel_size_from_reference_images_returns_exact_dimensions(self) -> None:
        with patch(
            "app.services.image_aspect_ratio.dimensions_from_reference_images",
            return_value=(1024, 768),
        ):
            self.assertEqual(
                pixel_size_from_reference_images(["/media/references/facade.png"]),
                "1024x768",
            )
