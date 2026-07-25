import unittest

from app.core.config import ImageProviderProfile
from app.services.task_executor import _openai_image_request_body, _wan_image_size, _wan_pixel_size_for_aspect


class WanImageSizeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.profile = ImageProviderProfile(
            provider_name="haodeya_wan2.7-image-pro",
            api_key="test-key",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="wan2.7-image-pro",
            timeout_seconds=30,
            strategies={"image.generate": "openai_images"},
            adapter_config={"provider_flavor": "haodeya_wan_image"},
        )

    def test_literal_tier_for_smart_or_empty_aspect(self) -> None:
        self.assertEqual(_wan_image_size(self.profile, {"resolution": "4k"}), "4K")
        self.assertEqual(
            _wan_image_size(self.profile, {"aspect_ratio": "智能", "resolution": "2k"}),
            "2K",
        )

    def test_concrete_aspect_uses_pixel_size(self) -> None:
        self.assertEqual(_wan_pixel_size_for_aspect("16:9", "4k"), "4096x2304")
        self.assertEqual(
            _wan_image_size(self.profile, {"aspect_ratio": "16:9", "resolution": "4k"}),
            "4096x2304",
        )

    def test_follow_source_keeps_literal_and_caps_4k(self) -> None:
        size = _wan_image_size(
            self.profile,
            {
                "aspect_ratio": "遵循原图",
                "resolution": "4k",
                "reference_image": "data:image/png;base64,xx",
            },
        )
        self.assertEqual(size, "2K")

    def test_openai_images_body_uses_wan_size(self) -> None:
        body = _openai_image_request_body(
            profile=self.profile,
            payload={"prompt": "a cat", "aspect_ratio": "16:9", "resolution": "2k", "image_count": 1},
            prompt="a cat",
        )
        self.assertEqual(body["size"], "2048x1152")
        self.assertEqual(body["model"], "wan2.7-image-pro")


if __name__ == "__main__":
    unittest.main()
