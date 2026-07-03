from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ProviderPricingRule, ProviderProfile
from app.services.billing import CHAT_PRICING_METRICS

# Source: upstream Haodeya contract for qmdh / default group (2026-07-03).
CHAT_UNIT_SIZE = 1_000_000.0
PRICING_CURRENCY = "CNY"

GROK_VIDEO_SKU_PRICES: dict[str, float] = {
    "x-ai/grok-imagine-video-i2v": 3.33,
    "x-ai/grok-imagine-video-ref": 3.33,
    "x-ai/grok-imagine-video-i2v-10s": 6.66,
    "x-ai/grok-imagine-video-ref-10s": 6.66,
}

IMAGE_MODEL_PRICES: dict[str, dict[str, Any]] = {
    "google/gemini-3.1-flash-image-preview": {
        "unit_price_1k": 0.67,
        "unit_price_2k": 0.95,
        "pricing_unit": "per_image",
    },
    "gemini-3.1-flash-image": {
        "unit_price_1k": 0.67,
        "unit_price_2k": 0.95,
        "pricing_unit": "per_image",
    },
    "openai/gpt-5.4-image-2": {
        "unit_price_1k": 1.62,
        "unit_price_2k": 2.67,
        "pricing_unit": "per_image",
    },
    "gpt-image-2": {
        "unit_price_1k": 1.62,
        "unit_price_2k": 2.67,
        "pricing_unit": "per_image",
    },
    "gpt-image-2-vip": {
        "unit_price_1k": 1.62,
        "unit_price_2k": 2.67,
        "pricing_unit": "per_image",
    },
}

CHAT_MODEL_PRICES: dict[str, dict[str, float]] = {
    "openai/gpt-5.4": {"input_tokens": 23.80, "output_tokens": 142.80},
    "deepseek-v4-flash": {"input_tokens": 0.94, "output_tokens": 1.87},
    "deepseek-v4-pro": {"input_tokens": 4.14, "output_tokens": 8.28},
    "moonshotai/kimi-k2.6:free": {"input_tokens": 0.0, "output_tokens": 0.0},
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": {
        "input_tokens": 0.0,
        "output_tokens": 0.0,
    },
}

HAODEYA_GROK_PROFILE_FALLBACK_PRICE = min(GROK_VIDEO_SKU_PRICES.values())


@dataclass(frozen=True)
class PricingSyncResult:
    updated_profiles: list[str]
    updated_rules: list[str]
    deactivated_rules: list[str]
    skipped_profiles: list[str]


def _grok_sku_duration_tier(sku: str) -> str:
    normalized = str(sku or "").strip()
    if normalized.endswith("-10s") or "10s" in normalized:
        return "10s"
    return "5s"


def grok_video_unit_price(sku: str, adapter_config: dict[str, Any] | None = None) -> float:
    normalized = str(sku or "").strip()
    config = adapter_config if isinstance(adapter_config, dict) else {}
    billing_tier = "2k" if _grok_sku_duration_tier(normalized) == "10s" else "1k"
    tier_key = f"unit_price_{billing_tier}"
    override = config.get(tier_key)
    if override is None:
        legacy_key = f"unit_price_{_grok_sku_duration_tier(normalized)}"
        override = config.get(legacy_key)
    if override is not None:
        return float(override)
    return float(GROK_VIDEO_SKU_PRICES.get(normalized, 0.0))


def calculate_grok_video_billing(
    *,
    sku: str,
    output_count: int = 1,
    adapter_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    unit_price = round(grok_video_unit_price(sku, adapter_config), 6)
    billable_units = max(int(output_count or 0), 1)
    return {
        "cost": round(unit_price * billable_units, 4),
        "currency": PRICING_CURRENCY,
        "pricing_unit": "per_video",
        "unit_price": unit_price,
        "billable_units": billable_units,
        "source": "haodeya_grok_sku",
        "video_sku": sku,
    }


def _normalize_model_name(value: str) -> str:
    return str(value or "").strip()


def _image_pricing_for_model(model_name: str) -> dict[str, Any] | None:
    normalized = _normalize_model_name(model_name)
    return IMAGE_MODEL_PRICES.get(normalized)


def _apply_image_profile_pricing(profile: ProviderProfile, image_pricing: dict[str, Any]) -> str:
    profile.pricing_currency = PRICING_CURRENCY
    profile.pricing_unit = str(image_pricing["pricing_unit"])
    unit_price_1k = float(image_pricing.get("unit_price_1k") or image_pricing.get("unit_price") or 0.0)
    profile.unit_price = unit_price_1k

    adapter_config = dict(profile.adapter_config or {})
    if "unit_price_1k" in image_pricing:
        adapter_config["unit_price_1k"] = float(image_pricing["unit_price_1k"])
    if "unit_price_2k" in image_pricing:
        adapter_config["unit_price_2k"] = float(image_pricing["unit_price_2k"])
    profile.adapter_config = adapter_config

    unit_price_2k = adapter_config.get("unit_price_2k", profile.unit_price)
    return f"{profile.provider_name}:1k={profile.unit_price},2k={unit_price_2k} {PRICING_CURRENCY}"


def _chat_rule_prices(model_name: str) -> dict[str, float] | None:
    normalized = _normalize_model_name(model_name)
    if normalized in CHAT_MODEL_PRICES:
        return CHAT_MODEL_PRICES[normalized]
    if normalized.endswith(":free"):
        return {"input_tokens": 0.0, "output_tokens": 0.0}
    return None


def _upsert_chat_rule(
    db: Session,
    *,
    profile: ProviderProfile,
    metric: str,
    unit_price: float,
    existing_rules: dict[tuple[int, str, str], ProviderPricingRule],
    updated_rules: list[str],
) -> None:
    key = (profile.id, "chat.completions", metric)
    rule = existing_rules.get(key)
    if rule is None:
        rule = ProviderPricingRule(
            provider_profile_id=profile.id,
            capability="chat.completions",
            metric=metric,
        )
        db.add(rule)
        existing_rules[key] = rule
    rule.unit_size = CHAT_UNIT_SIZE
    rule.unit_price = float(unit_price)
    rule.currency = PRICING_CURRENCY
    rule.is_active = True
    updated_rules.append(f"{profile.provider_name}:{metric}={unit_price}")


def sync_haodeya_pricing(db: Session) -> PricingSyncResult:
    updated_profiles: list[str] = []
    updated_rules: list[str] = []
    deactivated_rules: list[str] = []
    skipped_profiles: list[str] = []

    profiles = db.scalars(select(ProviderProfile).order_by(ProviderProfile.provider_name.asc())).all()
    rules = db.scalars(select(ProviderPricingRule).order_by(ProviderPricingRule.id.asc())).all()
    rules_by_key = {(rule.provider_profile_id, rule.capability, rule.metric): rule for rule in rules}

    for profile in profiles:
        model_name = _normalize_model_name(profile.model_name)
        provider_name = _normalize_model_name(profile.provider_name)
        changed = False

        if provider_name == "haodeya_grok" or model_name in GROK_VIDEO_SKU_PRICES or model_name in {
            "grok-imagine-video",
            "haodeya_grok",
        }:
            profile.pricing_currency = PRICING_CURRENCY
            profile.pricing_unit = "per_video"
            profile.unit_price = HAODEYA_GROK_PROFILE_FALLBACK_PRICE
            adapter_config = dict(profile.adapter_config or {})
            adapter_config["unit_price_1k"] = 3.33
            adapter_config["unit_price_2k"] = 6.66
            profile.adapter_config = adapter_config
            updated_profiles.append(f"{profile.provider_name}:5s=3.33,10s=6.66 {PRICING_CURRENCY}")
            changed = True

        image_pricing = _image_pricing_for_model(model_name)
        if image_pricing and "image.generate" in (profile.capabilities or []):
            updated_profiles.append(_apply_image_profile_pricing(profile, image_pricing))
            changed = True

        chat_prices = _chat_rule_prices(model_name)
        if chat_prices and "chat.completions" in (profile.capabilities or []):
            for metric in ("input_tokens", "output_tokens"):
                _upsert_chat_rule(
                    db,
                    profile=profile,
                    metric=metric,
                    unit_price=float(chat_prices[metric]),
                    existing_rules=rules_by_key,
                    updated_rules=updated_rules,
                )
            cached_key = (profile.id, "chat.completions", "cached_input_tokens")
            cached_rule = rules_by_key.get(cached_key)
            if cached_rule is None:
                cached_rule = ProviderPricingRule(
                    provider_profile_id=profile.id,
                    capability="chat.completions",
                    metric="cached_input_tokens",
                )
                db.add(cached_rule)
                rules_by_key[cached_key] = cached_rule
            cached_rule.unit_size = CHAT_UNIT_SIZE
            cached_rule.unit_price = 0.0
            cached_rule.currency = PRICING_CURRENCY
            cached_rule.is_active = True
            updated_rules.append(f"{profile.provider_name}:cached_input_tokens=0")
            changed = True

        for rule in list(profile.pricing_rules):
            if rule.capability == "chat.completions" and rule.metric not in CHAT_PRICING_METRICS:
                if rule.is_active:
                    rule.is_active = False
                    deactivated_rules.append(f"{profile.provider_name}:{rule.metric}")
                    changed = True
            if (
                rule.capability == "chat.completions"
                and chat_prices is None
                and "chat.completions" not in (profile.capabilities or [])
                and rule.is_active
            ):
                rule.is_active = False
                deactivated_rules.append(f"{profile.provider_name}:{rule.metric}")

        if not changed:
            skipped_profiles.append(profile.provider_name)

    db.commit()
    return PricingSyncResult(
        updated_profiles=updated_profiles,
        updated_rules=updated_rules,
        deactivated_rules=deactivated_rules,
        skipped_profiles=skipped_profiles,
    )
