from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
import hashlib
import json
import math
import re
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ProviderPricingRule, ProviderProfile
from app.services.billing import CHAT_PRICING_METRICS

# Source: upstream Haodeya contract for qmdh / default group (2026-07-03).
CHAT_UNIT_SIZE = 1_000_000.0
PRICING_CURRENCY = "CNY"
PRICING_CATALOG_ID = "haodeya-qmdh-2026-07-03"

GROK_VIDEO_SKU_PRICES: dict[str, float] = {
    "x-ai/grok-imagine-video-i2v": 3.33,
    "x-ai/grok-imagine-video-ref": 3.33,
    "x-ai/grok-imagine-video-i2v-10s": 6.66,
    "x-ai/grok-imagine-video-ref-10s": 6.66,
}

HAPPYHORSE_VIDEO_SKU_PRICES: dict[str, float] = {
    "happyhorse-1.1-t2v-5s": 3.4,
    "happyhorse-1.1-i2v-5s": 3.4,
    "happyhorse-1.1-r2v-5s": 3.4,
    "happyhorse-1.1-t2v-10s": 6.8,
    "happyhorse-1.1-i2v-10s": 6.8,
    "happyhorse-1.1-r2v-10s": 6.8,
}

SEEDANCE2_VIDEO_SKU_PRICES: dict[str, float] = {
    "seedance-2-fast-720p-5s": 5.6,
    "seedance-2-fast-720p-10s": 11.2,
    "seedance-2-720p-5s": 7.0,
    "seedance-2-720p-10s": 14.0,
    "seedance-2-1080p-5s": 17.5,
    "seedance-2-1080p-10s": 35.0,
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
    "gpt-image-2-count": {
        "unit_price_1k": 1.62,
        "unit_price_2k": 2.67,
        "pricing_unit": "per_image",
    },
    "gpt-image-2-count-2k": {
        "unit_price_1k": 1.62,
        "unit_price_2k": 2.67,
        "pricing_unit": "per_image",
    },
    "gpt-image-2-1k": {
        "unit_price_1k": 1.62,
        "unit_price_2k": 2.67,
        "pricing_unit": "per_image",
    },
    "gpt-image-2-2k": {
        "unit_price_1k": 1.62,
        "unit_price_2k": 2.67,
        "pricing_unit": "per_image",
    },
    "gpt-image-2-4k": {
        "unit_price_1k": 1.62,
        "unit_price_2k": 2.67,
        "pricing_unit": "per_image",
    },
    "gpt-image-2.5-sunburst": {
        "unit_price_1k": 1.62,
        "unit_price_2k": 2.67,
        "pricing_unit": "per_image",
    },
    "wan2.7-image": {
        "unit_price_1k": 0.2,
        "unit_price_2k": 0.2,
        "pricing_unit": "per_image",
    },
    "wan2.7-image-pro": {
        "unit_price_1k": 0.5,
        "unit_price_2k": 0.5,
        "unit_price_4k": 0.5,
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
    samples: list[dict[str, Any]] = field(default_factory=list)
    dry_run: bool = False


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
    if "unit_price_4k" in image_pricing:
        adapter_config["unit_price_4k"] = float(image_pricing["unit_price_4k"])
    profile.adapter_config = adapter_config

    unit_price_2k = adapter_config.get("unit_price_2k", profile.unit_price)
    unit_price_4k = adapter_config.get("unit_price_4k")
    if unit_price_4k is not None:
        return (
            f"{profile.provider_name}:1k={profile.unit_price},2k={unit_price_2k},"
            f"4k={unit_price_4k} {PRICING_CURRENCY}"
        )
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


def _pricing_fingerprint(profile: ProviderProfile, rules: list[ProviderPricingRule]) -> str:
    def columns(row):
        return {column.name: getattr(row, column.name) for column in row.__table__.columns}
    def encode(value):
        if isinstance(value, datetime):
            return value.isoformat()
        raise TypeError("Unsupported pricing configuration field")
    raw = {"profile": columns(profile), "rules": [columns(rule) for rule in sorted(rules, key=lambda row: row.id)]}
    return hashlib.sha256(json.dumps(raw, sort_keys=True, default=encode, allow_nan=False).encode()).hexdigest()


def profile_pricing_fingerprint(db: Session, profile: ProviderProfile) -> str:
    with db.no_autoflush:
        rules = list(db.scalars(select(ProviderPricingRule).where(ProviderPricingRule.provider_profile_id == profile.id)))
        return _pricing_fingerprint(profile, rules)


def _confirmed_sync_plan(plan: dict | None, *, dry_run: bool) -> dict | None:
    if plan is None:
        if dry_run:
            return None
        raise ValueError("Pricing sync apply requires an explicitly confirmed contract plan")
    if (not isinstance(plan, dict) or type(plan.get("version")) is not int or plan["version"] != 1
            or plan.get("catalog_id") != PRICING_CATALOG_ID or plan.get("supplier") != "haodeya" or plan.get("currency") != "CNY"):
        raise ValueError("Unsupported pricing contract version, supplier, catalog or currency")
    endpoint = urlsplit(str(plan.get("endpoint") or ""))
    if not endpoint.scheme or not endpoint.netloc or not isinstance(plan.get("source"), str) or not plan["source"].strip():
        raise ValueError("Pricing contract requires an endpoint and confirmed source")
    if not isinstance(plan.get("profiles"), list):
        raise ValueError("Pricing contract requires exact profile entries")
    entries = {}
    for entry in plan["profiles"]:
        if (not isinstance(entry, dict) or type(entry.get("profile_id")) is not int or entry["profile_id"] <= 0
                or entry["profile_id"] in entries or not all(isinstance(entry.get(k), str) and entry[k].strip() for k in ("provider", "model"))
                or not isinstance(entry.get("fingerprint"), str) or re.fullmatch(r"[0-9a-f]{64}", entry["fingerprint"]) is None):
            raise ValueError("Pricing contract requires unique profile identity and approved fingerprint")
        retired = entry.get("deactivate_rule_ids", [])
        if not isinstance(retired, list) or any(type(value) is not int or value <= 0 for value in retired) or len(set(retired)) != len(retired):
            raise ValueError("Pricing contract requires exact distinct rule ids for deactivation")
        if "image_4k_quote" in entry:
            quote = entry["image_4k_quote"]
            value = quote.get("unit_price") if isinstance(quote, dict) else None
            try:
                valid_price = type(value) in (int, float) and math.isfinite(value) and value >= 0
            except OverflowError:
                valid_price = False
            if (not isinstance(quote, dict) or type(quote.get("version")) is not int or quote["version"] != 1 or not valid_price
                    or quote.get("currency") != "CNY" or quote.get("pricing_unit") != "per_image"
                    or not isinstance(quote.get("source"), str) or not quote["source"].strip()):
                raise ValueError("4K supplement requires an explicit finite CNY/per_image quote and source")
        entries[entry["profile_id"]] = entry
    return {**plan, "_entries": entries}


def _sync_endpoint_matches(actual: str, expected: str) -> bool:
    def parts(value):
        url = urlsplit(value)
        return url.scheme.lower(), url.netloc.lower(), url.path.rstrip("/"), url.query
    return parts(actual) == parts(expected)


def _video_sync_prices(model: str, entry: dict) -> dict | None:
    for family, catalog in (("grok", GROK_VIDEO_SKU_PRICES), ("happyhorse", HAPPYHORSE_VIDEO_SKU_PRICES), ("seedance", SEEDANCE2_VIDEO_SKU_PRICES)):
        if model not in catalog:
            continue
        short = model.removesuffix("-10s") if family == "grok" else re.sub(r"-(5|10)s$", "-5s", model)
        long = short + "-10s" if family == "grok" else short.removesuffix("-5s") + "-10s"
        return {"unit_price": catalog[model], "unit_price_1k": catalog[short], "unit_price_2k": catalog[long]}
    if model in {"grok-imagine-video", "haodeya_grok"} and entry.get("video_family") == "grok":
        return {"unit_price": HAODEYA_GROK_PROFILE_FALLBACK_PRICE, "unit_price_1k": 3.33, "unit_price_2k": 6.66}
    return None


def _sync_candidate(profile: ProviderProfile, rules: list[ProviderPricingRule], plan: dict | None) -> tuple[dict | None, str, dict]:
    fingerprint = _pricing_fingerprint(profile, rules)
    sample = {"profile_id": profile.id, "provider": profile.provider_name, "model": profile.model_name,
              "endpoint": profile.base_url, "fingerprint": fingerprint, "old_currency": profile.pricing_currency,
              "contract_id": plan["catalog_id"] if plan else None, "contract_source": plan["source"] if plan else None}
    if plan is None:
        return None, "contract_required", sample
    entry = plan["_entries"].get(profile.id)
    if entry is None:
        return None, "profile_not_approved", sample
    if entry["fingerprint"] != fingerprint:
        raise ValueError(f"Profile {profile.id} or its pricing rules changed; preview and confirm again")
    if entry["provider"] != profile.provider_name or entry["model"] != profile.model_name:
        return None, "profile_identity_mismatch", sample
    if not _sync_endpoint_matches(profile.base_url, plan["endpoint"]):
        return None, "contract_endpoint_mismatch", sample
    by_key = {(rule.provider_profile_id, rule.capability, rule.metric): rule for rule in rules}
    if len(by_key) != len(rules):
        return None, "ambiguous_duplicate_rules", sample
    model, capabilities = _normalize_model_name(profile.model_name), set(profile.capabilities or [])
    image = _image_pricing_for_model(model) if capabilities & {"image.generate", "image.edit"} else None
    video = _video_sync_prices(model, entry) if "video.generate" in capabilities else None
    chat = CHAT_MODEL_PRICES.get(model) if "chat.completions" in capabilities else None
    if sum(value is not None for value in (image, video, chat)) != 1:
        return None, "sku_or_capability_not_in_confirmed_catalog", sample
    desired = {}
    quote = entry.get("image_4k_quote")
    if quote:
        sample["image_4k_quote"] = dict(quote)
    if quote and image is None:
        return None, "four_k_quote_not_image", sample
    if image is not None or video is not None:
        config = dict(profile.adapter_config or {})
        if profile.pricing_currency != "CNY" and any(key.startswith("unit_price_") and key not in {"unit_price_1k", "unit_price_2k", "unit_price_4k"} for key in config):
            return None, "foreign_custom_tier_unconfirmed", sample
        if image is not None:
            rates = dict(image)
            if "unit_price_4k" in config and "unit_price_4k" not in rates and not quote and profile.pricing_currency == "CNY":
                sample["preserved_custom_four_k"] = config["unit_price_4k"]
            if quote and "unit_price_4k" in rates and abs(quote["unit_price"] - rates["unit_price_4k"]) >= 0.000001:
                return None, "four_k_catalog_quote_conflict", sample
            if quote:
                rates["unit_price_4k"] = quote["unit_price"]
            if "unit_price_4k" in config and "unit_price_4k" not in rates and profile.pricing_currency != "CNY":
                return None, "foreign_custom_four_k_quote_required", sample
            config.update({key: value for key, value in rates.items() if key.startswith("unit_price_")})
            desired = {"pricing_currency": "CNY", "pricing_unit": rates["pricing_unit"], "unit_price": rates["unit_price_1k"], "adapter_config": config}
        else:
            if "unit_price_4k" in config and profile.pricing_currency != "CNY":
                return None, "foreign_custom_video_tier_unconfirmed", sample
            config.update({key: value for key, value in video.items() if key != "unit_price"})
            desired = {"pricing_currency": "CNY", "pricing_unit": "per_video", "unit_price": video["unit_price"], "adapter_config": config}
    changes = {key: value for key, value in desired.items() if getattr(profile, key) != value}
    rule_updates = []
    if chat is not None:
        for metric, price in {**chat, "cached_input_tokens": 0.0}.items():
            rule = by_key.get((profile.id, "chat.completions", metric))
            if rule is None or (rule.unit_size, rule.unit_price, rule.currency, rule.is_active) != (CHAT_UNIT_SIZE, float(price), "CNY", True):
                rule_updates.append((metric, float(price)))
    owned = {rule.id: rule for rule in rules}
    deactivated = []
    for rule_id in entry.get("deactivate_rule_ids", []):
        if rule_id not in owned or owned[rule_id].capability != "chat.completions":
            raise ValueError("Deactivation must name a chat rule owned by the approved profile")
        rule = owned[rule_id]
        if chat is not None and rule.metric in CHAT_PRICING_METRICS:
            raise ValueError("Cannot deactivate a standard rule activated by the confirmed catalog")
        if rule.is_active:
            deactivated.append(rule)
    visible_changes = {key: value for key, value in changes.items() if key != "adapter_config"}
    if "adapter_config" in changes:
        visible_changes["adapter_prices"] = {key: value for key, value in changes["adapter_config"].items() if key.startswith("unit_price_")}
    sample.update(profile_changes=visible_changes, rule_updates=[{"metric": metric, "unit_price": price, "currency": "CNY"} for metric, price in rule_updates],
                  deactivate_rule_ids=[rule.id for rule in deactivated])
    if not changes and not rule_updates and not deactivated:
        return None, "unchanged", sample
    return {"changes": changes, "rule_updates": rule_updates, "by_key": by_key, "deactivated": deactivated}, "eligible", sample


def _apply_sync_candidate(db: Session, profile: ProviderProfile, candidate: dict, result: PricingSyncResult) -> None:
    for name, value in candidate["changes"].items():
        setattr(profile, name, value)
    if candidate["changes"]:
        result.updated_profiles.append(f"{profile.provider_name}:confirmed {PRICING_CATALOG_ID}")
    for metric, price in candidate["rule_updates"]:
        _upsert_chat_rule(db, profile=profile, metric=metric, unit_price=price, existing_rules=candidate["by_key"], updated_rules=result.updated_rules)
    for rule in candidate["deactivated"]:
        rule.is_active = False
        result.deactivated_rules.append(f"{profile.provider_name}:{rule.metric}")


def sync_haodeya_pricing(db: Session, *, confirmed_plan: dict | None = None, dry_run: bool = False) -> PricingSyncResult:
    plan = _confirmed_sync_plan(confirmed_plan, dry_run=dry_run)
    if not dry_run and (db.in_transaction() or db.new or db.dirty or db.deleted):
        raise ValueError("Pricing apply requires a fresh clean maintenance session")
    result = PricingSyncResult([], [], [], [], dry_run=dry_run)
    try:
        if not dry_run and db.get_bind().dialect.name == "sqlite":
            db.connection().exec_driver_sql("BEGIN IMMEDIATE")
        with db.no_autoflush:
            profiles_query = select(ProviderProfile).order_by(ProviderProfile.provider_name, ProviderProfile.id)
            rules_query = select(ProviderPricingRule).order_by(ProviderPricingRule.id)
            if not dry_run:
                profiles_query, rules_query = profiles_query.with_for_update(), rules_query.with_for_update()
            profiles, rules = list(db.scalars(profiles_query)), list(db.scalars(rules_query))
            if plan is not None and set(plan["_entries"]) - {profile.id for profile in profiles}:
                raise ValueError("An approved pricing profile no longer exists")
            prepared = []
            for profile in profiles:
                owned = [rule for rule in rules if rule.provider_profile_id == profile.id]
                candidate, reason, sample = _sync_candidate(profile, owned, plan)
                if candidate is None:
                    result.skipped_profiles.append(profile.provider_name)
                else:
                    prepared.append((profile, candidate))
                    reason = "would_update" if dry_run else "updated"
                result.samples.append({**sample, "reason": reason})
        if dry_run:
            # Describe the same actions without mutating ORM instances.
            for profile, candidate in prepared:
                if candidate["changes"]:
                    result.updated_profiles.append(f"{profile.provider_name}:confirmed {PRICING_CATALOG_ID}")
                result.updated_rules.extend(f"{profile.provider_name}:{metric}={price}" for metric, price in candidate["rule_updates"])
                result.deactivated_rules.extend(f"{profile.provider_name}:{rule.metric}" for rule in candidate["deactivated"])
        else:
            for profile, candidate in prepared:
                _apply_sync_candidate(db, profile, candidate, result)
            db.commit()
        return result
    except Exception:
        if not dry_run:
            db.rollback()
        raise
