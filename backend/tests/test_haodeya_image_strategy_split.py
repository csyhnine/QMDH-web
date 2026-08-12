import unittest

from app.services.provider_strategy import (
    CHAT_MODALITIES_IMAGE_STRATEGY,
    HAODEYA_ASYNC_IMAGE_STRATEGY,
    HAODEYA_SYNC_IMAGE_STRATEGY,
    default_strategy_for_capability,
    profile_prefers_chat_modalities_image,
    profile_prefers_haodeya_async_image,
    profile_prefers_haodeya_sync_image,
)


class HaodeyaImageStrategySplitTests(unittest.TestCase):
    def test_count_sku_prefers_sync_not_async_or_chat(self) -> None:
        self.assertTrue(
            profile_prefers_haodeya_sync_image(
                provider_name="gpt-image-2-count",
                model_name="gpt-image-2-count",
                base_url="https://newapi.haodeya.xyz/v1",
            )
        )
        self.assertFalse(
            profile_prefers_haodeya_async_image(
                provider_name="gpt-image-2-count",
                model_name="gpt-image-2-count",
                base_url="https://newapi.haodeya.xyz/v1",
            )
        )
        self.assertFalse(
            profile_prefers_chat_modalities_image(
                provider_name="gpt-image-2-count",
                model_name="gpt-image-2-count",
                base_url="https://newapi.haodeya.xyz/v1",
            )
        )
        self.assertEqual(
            default_strategy_for_capability(
                capability="image.generate",
                provider_name="gpt-image-2-count",
                model_name="gpt-image-2-count",
                base_url="https://newapi.haodeya.xyz/v1",
            ),
            HAODEYA_SYNC_IMAGE_STRATEGY,
        )

    def test_plain_gpt_image_on_haodeya_still_chat_modalities(self) -> None:
        self.assertFalse(
            profile_prefers_haodeya_async_image(
                provider_name="haodeya_gpt_image",
                model_name="gpt-image-2",
                base_url="https://newapi.haodeya.xyz/v1",
            )
        )
        self.assertFalse(
            profile_prefers_haodeya_sync_image(
                provider_name="haodeya_gpt_image",
                model_name="gpt-image-2",
                base_url="https://newapi.haodeya.xyz/v1",
            )
        )
        self.assertTrue(
            profile_prefers_chat_modalities_image(
                provider_name="haodeya_gpt_image",
                model_name="gpt-image-2",
                base_url="https://newapi.haodeya.xyz/v1",
            )
        )
        self.assertEqual(
            default_strategy_for_capability(
                capability="image.generate",
                provider_name="haodeya_gpt_image",
                model_name="gpt-image-2",
                base_url="https://newapi.haodeya.xyz/v1",
            ),
            CHAT_MODALITIES_IMAGE_STRATEGY,
        )

    def test_vip_still_async(self) -> None:
        self.assertEqual(
            default_strategy_for_capability(
                capability="image.generate",
                provider_name="gpt-image-2-vip",
                model_name="gpt-image-2-vip",
                base_url="https://newapi.haodeya.xyz/v1",
            ),
            HAODEYA_ASYNC_IMAGE_STRATEGY,
        )
        self.assertFalse(
            profile_prefers_haodeya_sync_image(
                provider_name="gpt-image-2-vip",
                model_name="gpt-image-2-vip",
                base_url="https://newapi.haodeya.xyz/v1",
            )
        )


if __name__ == "__main__":
    unittest.main()
