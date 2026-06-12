import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.encryption import encrypt_value
from app.database import Base
from app.models import ProviderPricingRule, ProviderProfile
from app.services.haodeya_pricing import (
    calculate_grok_video_billing,
    sync_haodeya_pricing,
)


class HaodeyaPricingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def test_grok_sku_billing_uses_upstream_prices(self) -> None:
        billing = calculate_grok_video_billing(sku="x-ai/grok-imagine-video-ref-10s")
        self.assertEqual(billing["cost"], 6.74)
        self.assertEqual(billing["currency"], "CNY")
        self.assertEqual(billing["source"], "haodeya_grok_sku")

    def test_sync_haodeya_pricing_updates_profiles_and_chat_rules(self) -> None:
        with self.SessionLocal() as db:
            db.add(
                ProviderProfile(
                    provider_name="openai_gpt-5.4",
                    api_key=encrypt_value("test-key"),
                    base_url="https://newapi.haodeya.xyz/v1",
                    model_name="openai/gpt-5.4",
                    adapter_kind="openai_compatible",
                    capabilities=["chat.completions"],
                    pricing_currency="USD",
                    pricing_unit="per_image",
                    unit_price=0.0,
                    enabled=True,
                )
            )
            db.add(
                ProviderProfile(
                    provider_name="google_gemini-3.1-flash-image-preview",
                    api_key=encrypt_value("test-key"),
                    base_url="https://newapi.haodeya.xyz/v1",
                    model_name="google/gemini-3.1-flash-image-preview",
                    adapter_kind="openai_compatible",
                    capabilities=["image.generate"],
                    pricing_currency="USD",
                    pricing_unit="per_image",
                    unit_price=0.0966,
                    enabled=True,
                )
            )
            db.add(
                ProviderProfile(
                    provider_name="haodeya_grok",
                    api_key=encrypt_value("test-key"),
                    base_url="https://newapi.haodeya.xyz/v1",
                    model_name="grok-imagine-video",
                    adapter_kind="haodeya_grok",
                    capabilities=["video.generate"],
                    pricing_currency="CNY",
                    pricing_unit="per_video",
                    unit_price=99.0,
                    enabled=True,
                )
            )
            db.commit()

            result = sync_haodeya_pricing(db)
            chat_profile = db.scalar(
                select(ProviderProfile).where(ProviderProfile.provider_name == "openai_gpt-5.4")
            )
            image_profile = db.scalar(
                select(ProviderProfile).where(
                    ProviderProfile.provider_name == "google_gemini-3.1-flash-image-preview"
                )
            )
            grok_profile = db.scalar(select(ProviderProfile).where(ProviderProfile.provider_name == "haodeya_grok"))
            chat_rules = db.scalars(
                select(ProviderPricingRule).where(
                    ProviderPricingRule.provider_profile_id == chat_profile.id,
                    ProviderPricingRule.is_active.is_(True),
                )
            ).all()

        self.assertEqual(image_profile.pricing_currency, "CNY")
        self.assertEqual(image_profile.unit_price, 0.67)
        self.assertEqual(grok_profile.unit_price, 3.35)
        self.assertIn("openai_gpt-5.4:input_tokens=23.8", result.updated_rules)
        self.assertIn("openai_gpt-5.4:output_tokens=142.8", result.updated_rules)
        self.assertEqual(
            sorted((rule.metric, rule.unit_price, rule.currency) for rule in chat_rules),
            [
                ("cached_input_tokens", 0.0, "CNY"),
                ("input_tokens", 23.8, "CNY"),
                ("output_tokens", 142.8, "CNY"),
            ],
        )


if __name__ == "__main__":
    unittest.main()
