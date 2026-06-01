from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timezone
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ProviderPricingRule, UsageLedger, User

SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")
CHAT_PRICING_METRICS = {"input_tokens", "output_tokens", "cached_input_tokens"}


@dataclass(frozen=True)
class ChatUsageBreakdown:
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    input_tokens: int
    output_tokens: int
    cached_input_tokens: int
    uncached_input_tokens: int
    usage_payload: dict[str, Any]


def _safe_int(value: object) -> int:
    try:
        return max(int(value or 0), 0)
    except (TypeError, ValueError):
        return 0


def normalize_chat_usage(raw_usage: object) -> ChatUsageBreakdown:
    payload = raw_usage if isinstance(raw_usage, dict) else {}
    prompt_tokens = _safe_int(payload.get("prompt_tokens"))
    completion_tokens = _safe_int(payload.get("completion_tokens"))
    total_tokens = _safe_int(payload.get("total_tokens"))
    input_tokens = _safe_int(payload.get("input_tokens"))
    output_tokens = _safe_int(payload.get("output_tokens"))
    cached_input_tokens = _safe_int(payload.get("cached_input_tokens"))

    if input_tokens == 0:
        input_tokens = prompt_tokens
    if output_tokens == 0:
        output_tokens = completion_tokens
    if total_tokens == 0:
        total_tokens = input_tokens + output_tokens

    uncached_input_tokens = max(input_tokens - cached_input_tokens, 0)
    return ChatUsageBreakdown(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cached_input_tokens=cached_input_tokens,
        uncached_input_tokens=uncached_input_tokens,
        usage_payload=dict(payload),
    )


def calculate_chat_billing(
    db: Session,
    *,
    provider_profile_id: int | None,
    usage: ChatUsageBreakdown,
) -> dict[str, Any]:
    if provider_profile_id is None:
        return {
            "cost": 0.0,
            "currency": "CNY",
            "pricing_unit": "chat_tokens",
            "billable_units": 0.0,
            "source": "missing_provider_profile",
            "rule_count": 0,
        }

    rules = db.scalars(
        select(ProviderPricingRule)
        .where(
            ProviderPricingRule.provider_profile_id == provider_profile_id,
            ProviderPricingRule.capability == "chat.completions",
            ProviderPricingRule.metric.in_(CHAT_PRICING_METRICS),
            ProviderPricingRule.is_active.is_(True),
        )
        .order_by(ProviderPricingRule.id.asc())
    ).all()

    if not rules:
        return {
            "cost": 0.0,
            "currency": "CNY",
            "pricing_unit": "chat_tokens",
            "billable_units": 0.0,
            "source": "unpriced_chat",
            "rule_count": 0,
        }

    cost = 0.0
    currency = (rules[0].currency or "CNY").upper()
    billable_units = 0.0
    applied_rules: list[dict[str, Any]] = []

    for rule in rules:
        unit_size = float(rule.unit_size or 1.0) or 1.0
        if rule.metric == "input_tokens":
            amount = usage.uncached_input_tokens
        elif rule.metric == "output_tokens":
            amount = usage.output_tokens
        else:
            amount = usage.cached_input_tokens
        billable_units += float(amount)
        rule_cost = round((float(amount) / unit_size) * float(rule.unit_price or 0.0), 6)
        cost += rule_cost
        applied_rules.append(
            {
                "metric": rule.metric,
                "unit_size": unit_size,
                "unit_price": float(rule.unit_price or 0.0),
                "currency": currency,
                "billable_amount": amount,
                "cost": round(rule_cost, 6),
            }
        )

    return {
        "cost": round(cost, 4),
        "currency": currency,
        "pricing_unit": "chat_tokens",
        "billable_units": round(billable_units, 4),
        "source": "provider_pricing_rules",
        "rule_count": len(applied_rules),
        "rules": applied_rules,
    }


def _current_month_start_utc(now: datetime | None = None) -> datetime:
    current = now.astimezone(SHANGHAI_TZ) if now else datetime.now(SHANGHAI_TZ)
    month_start_local = current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return datetime.combine(month_start_local.date(), time.min, tzinfo=SHANGHAI_TZ).astimezone(timezone.utc)


def current_month_cost_for_user(
    db: Session,
    *,
    user_id: int,
    now: datetime | None = None,
) -> float:
    since = _current_month_start_utc(now)
    entries = db.scalars(
        select(UsageLedger).where(
            UsageLedger.user_id == user_id,
            UsageLedger.entry_type.in_(("task.finalized", "chat.message.completed")),
            UsageLedger.recorded_at >= since,
        )
    ).all()
    return round(sum(float(entry.cost or 0.0) for entry in entries), 4)


def enforce_user_quota(db: Session, *, user: User, now: datetime | None = None) -> None:
    billing_status = (user.billing_status or "active").strip().lower()
    quota_policy = (user.quota_policy or "soft_warn").strip().lower()
    quota_limit = user.monthly_quota

    if billing_status == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="当前账号已被停用计费，请联系管理员恢复后再继续使用。",
        )

    if quota_policy != "hard_block" or quota_limit is None:
        return

    used_cost = current_month_cost_for_user(db, user_id=user.id, now=now)
    if used_cost >= float(quota_limit):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"当前账号本月额度已用尽（已用 {used_cost:.2f} / 上限 {float(quota_limit):.2f}），请联系管理员。",
        )
