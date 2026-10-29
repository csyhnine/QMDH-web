"""Chat context window packing and incremental history summarization."""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from copy import deepcopy
from types import SimpleNamespace
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import set_committed_value

from app.core.config import settings
from app.models import ChatMessage, Conversation, ProviderProfile, User
from app.services.chat_message_content import build_provider_messages
from app.services.chat_service import ChatProviderConfig, complete_chat_once
from app.services.chat_compaction_completion_service import (
    CONTEXT_FIELDS, ChatContextUnavailable, begin_compaction, fail_compaction,
    finish_compaction, persist_context_stats,
)

logger = logging.getLogger(__name__)

_CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]")
_MODEL_WINDOW_HINTS: list[tuple[tuple[str, ...], int]] = [
    (("gpt-4.1", "gpt-4o", "o3", "o4", "claude-sonnet-4", "claude-opus-4", "gemini-2.5", "gemini-2.0"), 128_000),
    (("gpt-4-turbo", "gpt-4-1106", "claude-3", "deepseek"), 128_000),
    (("gpt-3.5", "qwen2.5-7b", "qwen-turbo"), 16_000),
    (("32k",), 32_000),
    (("8k",), 8_000),
]


@dataclass(frozen=True)
class PackedChatContext:
    api_messages: list[dict[str, object]]
    used_summary: bool
    summarized: bool
    estimated_tokens: int
    context_window_tokens: int
    input_budget_tokens: int

    @property
    def usage_percent(self) -> int:
        if self.input_budget_tokens <= 0:
            return 0
        return min(100, max(0, round(100 * self.estimated_tokens / self.input_budget_tokens)))

    def context_payload(self) -> dict[str, object]:
        return {
            "tokens": self.estimated_tokens,
            "window_tokens": self.context_window_tokens,
            "budget_tokens": self.input_budget_tokens,
            "usage_percent": self.usage_percent,
            "compressed": self.used_summary,
            "just_compressed": self.summarized,
        }


@dataclass(frozen=True)
class ConversationContextStats:
    tokens: int
    window_tokens: int
    budget_tokens: int
    usage_percent: int
    compressed: bool

    def as_dict(self) -> dict[str, object]:
        return {
            "tokens": self.tokens,
            "window_tokens": self.window_tokens,
            "budget_tokens": self.budget_tokens,
            "usage_percent": self.usage_percent,
            "compressed": self.compressed,
        }


@dataclass(frozen=True)
class ContextBreakdown:
    summary_tokens: int
    recent_tokens: int
    uncovered_tokens: int
    packed_tokens: int
    total_estimated_tokens: int
    window_tokens: int
    budget_tokens: int
    usage_percent: int
    compressed: bool
    summary_until_message_id: int | None
    message_count_total: int
    message_count_recent: int
    message_count_uncovered: int
    message_count_covered: int
    will_compress_soon: bool

    def as_dict(self) -> dict[str, object]:
        return {
            "summary_tokens": self.summary_tokens,
            "recent_tokens": self.recent_tokens,
            "uncovered_tokens": self.uncovered_tokens,
            "packed_tokens": self.packed_tokens,
            "total_estimated_tokens": self.total_estimated_tokens,
            "window_tokens": self.window_tokens,
            "budget_tokens": self.budget_tokens,
            "usage_percent": self.usage_percent,
            "compressed": self.compressed,
            "summary_until_message_id": self.summary_until_message_id,
            "message_count_total": self.message_count_total,
            "message_count_recent": self.message_count_recent,
            "message_count_uncovered": self.message_count_uncovered,
            "message_count_covered": self.message_count_covered,
            "will_compress_soon": self.will_compress_soon,
        }


def estimate_text_tokens(text: str) -> int:
    if not text:
        return 0
    cjk = len(_CJK_RE.findall(text))
    other = max(len(text) - cjk, 0)
    # CJK denser than Latin; keep a small floor for short strings.
    return max(1, int(cjk / 1.5 + other / 4.0))


def message_context_tokens(message: ChatMessage) -> int:
    stored = int(message.estimated_input_tokens or 0)
    if stored > 0:
        return stored
    return estimate_message_tokens(message)


def apply_message_input_tokens(message: ChatMessage) -> int:
    tokens = estimate_message_tokens(message)
    message.estimated_input_tokens = max(tokens, 0)
    return message.estimated_input_tokens


def estimate_message_tokens(message: ChatMessage) -> int:
    tokens = estimate_text_tokens(str(message.content or "")) + 4  # role overhead
    attachments = [item for item in (message.attachments_json or []) if isinstance(item, dict)]
    image_tokens = int(settings.chat_image_token_estimate or 765)
    for item in attachments:
        kind = str(item.get("kind") or "").strip().lower()
        if kind == "image":
            tokens += image_tokens
        else:
            # Extracted file text is rebuilt at pack time; use a conservative placeholder.
            tokens += 1_500
    return tokens


def resolve_context_window(provider: ProviderProfile | ChatProviderConfig | None) -> int:
    default_window = max(int(settings.chat_default_context_window_tokens or 128_000), 1_024)
    if provider is None:
        return default_window

    adapter_config: dict = {}
    model_name = ""
    if isinstance(provider, ProviderProfile):
        adapter_config = provider.adapter_config if isinstance(provider.adapter_config, dict) else {}
        model_name = str(provider.model_name or "").strip().lower()
    else:
        model_name = str(provider.model_name or "").strip().lower()

    raw = adapter_config.get("context_window") or adapter_config.get("context_window_tokens")
    if raw is not None:
        try:
            value = int(raw)
            if value > 0:
                return max(value, 1_024)
        except (TypeError, ValueError):
            pass

    for needles, window in _MODEL_WINDOW_HINTS:
        if any(needle in model_name for needle in needles):
            return window
    return default_window


def input_token_budget(context_window: int) -> int:
    reserve = max(int(settings.chat_completion_reserve_tokens or 4_096), 64)
    reserve = min(reserve, max(context_window // 4, 64))
    return max(context_window - reserve, 256)


def summary_token_budget() -> int:
    return max(int(settings.chat_summary_budget_tokens or 2_048), 256)


def _summary_system_message(summary: str) -> dict[str, object]:
    body = summary.strip()
    return {
        "role": "system",
        "content": (
            "以下是本会话早期对话的压缩摘要，请在后续回答中保持一致，"
            f"不要声称未看到这些信息：\n{body}"
        ),
    }


def _select_recent_messages(
    messages: list[ChatMessage],
    *,
    token_budget: int,
) -> list[ChatMessage]:
    if not messages:
        return []
    min_recent = max(int(settings.chat_min_recent_messages or 4), 1)
    selected: list[ChatMessage] = []
    used = 0
    for message in reversed(messages):
        cost = estimate_message_tokens(message)
        if selected and used + cost > token_budget and len(selected) >= min_recent:
            break
        selected.append(message)
        used += cost
        if used >= token_budget and len(selected) >= min_recent:
            break
    selected.reverse()
    # Prefer starting on a user turn when possible.
    while len(selected) > min_recent and selected and selected[0].role == "assistant":
        selected = selected[1:]
    return selected


def _messages_to_digest(messages: list[ChatMessage]) -> str:
    lines: list[str] = []
    for message in messages:
        role = message.role or "user"
        text = str(message.content or "").strip()
        attachments = [item for item in (message.attachments_json or []) if isinstance(item, dict)]
        if attachments:
            names = ", ".join(
                str(item.get("file_name") or item.get("storage_path") or "附件").strip()
                for item in attachments
            )
            text = f"{text}\n[附件: {names}]".strip() if text else f"[附件: {names}]"
        if not text:
            continue
        if len(text) > 1_200:
            text = f"{text[:1_200].rstrip()}…"
        lines.append(f"{role}: {text}")
    return "\n".join(lines)


async def summarize_chat_history(
    *,
    provider: ChatProviderConfig,
    existing_summary: str,
    messages_to_compress: list[ChatMessage],
) -> tuple[str, dict[str, object]]:
    digest = _messages_to_digest(messages_to_compress)
    if not digest.strip():
        return existing_summary.strip(), {}

    prompt_messages: list[dict[str, object]] = [
        {
            "role": "system",
            "content": (
                "你是对话记忆压缩器。请把给定历史压缩为精炼中文摘要，"
                "保留：用户意图、已确认约定、关键事实、未决问题、风格/项目偏好。"
                "不要编造；不要输出客套话；控制在 800 字以内。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"【已有摘要】\n{(existing_summary or '（无）').strip()}\n\n"
                f"【新增待压缩片段】\n{digest}\n\n"
                "请输出合并后的完整摘要："
            ),
        },
    ]
    text, usage_payload = await complete_chat_once(provider, prompt_messages, max_tokens=900)
    return text.strip(), usage_payload


def _trim_api_messages_to_budget(
    api_messages: list[dict[str, object]],
    *,
    budget: int,
) -> list[dict[str, object]]:
    def message_cost(item: dict[str, object]) -> int:
        content = item.get("content")
        if isinstance(content, str):
            return estimate_text_tokens(content) + 4
        if isinstance(content, list):
            total = 4
            for part in content:
                if not isinstance(part, dict):
                    continue
                if part.get("type") == "text":
                    total += estimate_text_tokens(str(part.get("text") or ""))
                elif part.get("type") == "image_url":
                    total += int(settings.chat_image_token_estimate or 765)
            return total
        return 4

    if not api_messages:
        return []

    # Keep leading system summary if present; trim from the oldest non-system messages.
    leading: list[dict[str, object]] = []
    rest = list(api_messages)
    if rest and rest[0].get("role") == "system":
        leading = [rest.pop(0)]

    while rest:
        total = sum(message_cost(item) for item in leading + rest)
        if total <= budget:
            break
        if len(rest) <= max(int(settings.chat_min_recent_messages or 4), 1):
            break
        # Drop oldest; if next would start mid-assistant turn, drop that too.
        rest.pop(0)
        while rest and rest[0].get("role") == "assistant" and len(rest) > 1:
            rest.pop(0)
    return leading + rest


def _summary_tokens(summary: str) -> int:
    body = summary.strip()
    if not body:
        return 0
    return estimate_text_tokens(body) + 4


def _split_context_messages(
    conversation: Conversation,
    messages: list[ChatMessage],
    *,
    provider_profile: ProviderProfile | ChatProviderConfig | None = None,
) -> tuple[list[ChatMessage], list[ChatMessage], list[ChatMessage], int, int]:
    context_window = resolve_context_window(provider_profile)
    budget = input_token_budget(context_window)
    summary_budget = summary_token_budget()
    recent_budget = max(budget - summary_budget, budget // 2)

    ordered = sorted(messages, key=lambda item: (item.created_at, item.id or 0))
    recent = _select_recent_messages(ordered, token_budget=recent_budget)
    recent_ids = {message.id for message in recent if message.id is not None}
    older = [message for message in ordered if message.id not in recent_ids]

    until_id = conversation.context_summary_until_message_id
    uncovered = [
        message
        for message in older
        if until_id is None or (message.id is not None and message.id > until_id)
    ]
    if until_id is None:
        covered_count = 0
    else:
        covered_count = sum(
            1
            for message in ordered
            if message.id is not None and message.id <= until_id
        )
    return recent, uncovered, ordered, context_window, covered_count


def compute_context_breakdown(
    conversation: Conversation,
    messages: list[ChatMessage],
    *,
    provider_profile: ProviderProfile | ChatProviderConfig | None = None,
    packed_tokens: int | None = None,
) -> ContextBreakdown:
    """Structured context stats for UI/admin without calling the LLM."""
    recent, uncovered, ordered, context_window, covered_count = _split_context_messages(
        conversation,
        messages,
        provider_profile=provider_profile,
    )
    budget = input_token_budget(context_window)
    summary = (conversation.context_summary or "").strip()
    summary_tokens = _summary_tokens(summary)
    recent_tokens = sum(message_context_tokens(message) for message in recent)
    uncovered_tokens = sum(message_context_tokens(message) for message in uncovered)
    total_estimated = min(budget, summary_tokens + recent_tokens + uncovered_tokens)
    projected = recent_tokens + uncovered_tokens + summary_tokens

    trigger_ratio = float(settings.chat_summary_trigger_ratio or 0.75)
    trigger_ratio = min(max(trigger_ratio, 0.45), 0.98)
    trigger_budget = int(budget * trigger_ratio)
    summary_budget = summary_token_budget()
    will_compress_soon = bool(
        uncovered
        and (
            projected > trigger_budget
            or uncovered_tokens > summary_budget
            or len(uncovered) >= 6
        )
    )

    usage_basis = packed_tokens if packed_tokens is not None and packed_tokens > 0 else total_estimated
    percent = 0 if budget <= 0 else min(100, max(0, round(100 * usage_basis / budget)))

    return ContextBreakdown(
        summary_tokens=summary_tokens,
        recent_tokens=recent_tokens,
        uncovered_tokens=uncovered_tokens,
        packed_tokens=max(int(packed_tokens or 0), 0),
        total_estimated_tokens=total_estimated,
        window_tokens=context_window,
        budget_tokens=budget,
        usage_percent=percent,
        compressed=bool(summary),
        summary_until_message_id=conversation.context_summary_until_message_id,
        message_count_total=len(ordered),
        message_count_recent=len(recent),
        message_count_uncovered=len(uncovered),
        message_count_covered=covered_count,
        will_compress_soon=will_compress_soon,
    )


def persist_conversation_context_stats(
    conversation: Conversation,
    breakdown: ContextBreakdown,
) -> None:
    conversation.context_summary_tokens = breakdown.summary_tokens
    conversation.context_recent_tokens = breakdown.recent_tokens
    conversation.context_uncovered_tokens = breakdown.uncovered_tokens
    conversation.context_packed_tokens = breakdown.packed_tokens
    conversation.context_stats_updated_at = datetime.now(timezone.utc)


def estimate_conversation_context(
    conversation: Conversation,
    messages: list[ChatMessage],
    *,
    provider_profile: ProviderProfile | ChatProviderConfig | None = None,
) -> ConversationContextStats:
    """Cheap estimate for UI (no LLM). Uses summary + recent-ish raw history."""
    packed_tokens = int(conversation.context_packed_tokens or 0) or None
    breakdown = compute_context_breakdown(
        conversation,
        messages,
        provider_profile=provider_profile,
        packed_tokens=packed_tokens,
    )
    return ConversationContextStats(
        tokens=breakdown.total_estimated_tokens,
        window_tokens=breakdown.window_tokens,
        budget_tokens=breakdown.budget_tokens,
        usage_percent=breakdown.usage_percent,
        compressed=breakdown.compressed,
    )


async def pack_chat_context(
    db: Session,
    conversation: Conversation,
    messages: list[ChatMessage],
    provider_config: ChatProviderConfig,
    *,
    provider_profile: ProviderProfile | None = None,
    allow_summarize: bool = True,
    on_status: object | None = None,
    memory_context: str = "",
) -> PackedChatContext:
    """Build provider messages that fit the model context window, summarizing older turns when needed.

    `on_status` may be an async callable receiving status labels like \"compressing\".
    `memory_context` is per-user durable memory recall injected as a system note.
    """
    # Snapshot before awaiting a model: rollback/expiry must not erase inputs or
    # turn fallback/logging into another access through a failed Session.
    conversation_id, user_id = conversation.id, conversation.user_id
    state = SimpleNamespace(context_summary=conversation.context_summary or "",
                            context_summary_until_message_id=conversation.context_summary_until_message_id)
    messages = [SimpleNamespace(id=m.id, role=m.role, content=m.content, created_at=m.created_at,
                attachments_json=deepcopy(m.attachments_json or []), token_count=m.token_count,
                estimated_input_tokens=m.estimated_input_tokens) for m in messages]
    profile = None if provider_profile is None else ProviderProfile(
        id=provider_profile.id, provider_name=provider_profile.provider_name,
        model_name=provider_profile.model_name, adapter_config=deepcopy(provider_profile.adapter_config or {}))
    context_window = resolve_context_window(profile or provider_config)
    budget = input_token_budget(context_window)
    summary_budget = summary_token_budget()
    trigger_ratio = float(settings.chat_summary_trigger_ratio or 0.75)
    trigger_ratio = min(max(trigger_ratio, 0.45), 0.98)
    trigger_budget = int(budget * trigger_ratio)

    ordered = sorted(messages, key=lambda item: (item.created_at, item.id or 0))
    recent_budget = max(budget - summary_budget, budget // 2)
    recent = _select_recent_messages(ordered, token_budget=recent_budget)
    recent_ids = {message.id for message in recent if message.id is not None}
    older = [message for message in ordered if message.id not in recent_ids]

    until_id = state.context_summary_until_message_id
    existing_summary = state.context_summary.strip()
    uncovered = [
        message
        for message in older
        if until_id is None or (message.id is not None and message.id > until_id)
    ]

    summarized = False
    used_summary = bool(existing_summary)

    older_tokens = sum(estimate_message_tokens(message) for message in uncovered)
    recent_tokens = sum(estimate_message_tokens(message) for message in recent)
    projected = recent_tokens + older_tokens + (estimate_text_tokens(existing_summary) if existing_summary else 0)

    # Codex-style earlier compact: lower turn threshold + token pressure
    should_summarize = bool(
        allow_summarize
        and uncovered
        and (projected > trigger_budget or older_tokens > summary_budget or len(uncovered) >= 6)
    )

    if should_summarize:
        if callable(on_status):
            maybe = on_status("正在压缩早期对话…")
            if hasattr(maybe, "__await__"):
                await maybe  # type: ignore[misc]
        try:
            target_until = max(message.id for message in uncovered if message.id is not None)
            base_summary, base_until = state.context_summary, state.context_summary_until_message_id
            receipt_id = begin_compaction(
                db, conversation_id=conversation_id, user_id=user_id,
                provider_id=profile.id if profile is not None else None,
                provider_name=profile.provider_name if profile is not None else "",
                model_name=profile.model_name if profile is not None else provider_config.model_name,
                until_message_id=target_until,
            )
            try:
                new_summary, compact_usage = await summarize_chat_history(
                    provider=provider_config, existing_summary=existing_summary, messages_to_compress=uncovered,
                )
            except BaseException:
                fail_compaction(db, receipt_id)
                raise
            completed = finish_compaction(
                db, receipt_id, new_summary, compact_usage,
                base_summary=base_summary, base_until=base_until,
            )
            for key, value in completed["context"].items():
                setattr(state, key, value)
            existing_summary = (state.context_summary or "").strip()
            used_summary = bool(existing_summary)
            summarized = completed["details"]["summary_status"] == "stored"
        except ChatContextUnavailable:
            db.rollback()
            raise
        except Exception:
            # Roll back before any fallback work. Logs use only cached scalars.
            db.rollback()
            logger.warning(
                "chat context summarization unavailable; falling back to window trim",
                extra={"conversation_id": conversation_id},
            )
        except BaseException:
            db.rollback()
            raise

    api_messages: list[dict[str, object]] = []
    memory_note = (memory_context or "").strip()
    if memory_note:
        api_messages.append(
            {
                "role": "system",
                "content": memory_note[:3500],
            }
        )
    if existing_summary:
        api_messages.append(_summary_system_message(existing_summary))
        used_summary = True
    stage_callback = on_status if callable(on_status) else None
    api_messages.extend(build_provider_messages(recent, on_stage=stage_callback))
    api_messages = _trim_api_messages_to_budget(api_messages, budget=budget)

    estimated = 0
    for item in api_messages:
        content = item.get("content")
        if isinstance(content, str):
            estimated += estimate_text_tokens(content) + 4
        elif isinstance(content, list):
            estimated += 4
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    estimated += estimate_text_tokens(str(part.get("text") or ""))
                elif isinstance(part, dict) and part.get("type") == "image_url":
                    estimated += int(settings.chat_image_token_estimate or 765)

    if not db.is_active:
        db.rollback()
    breakdown = compute_context_breakdown(
        state, ordered, provider_profile=profile or provider_config, packed_tokens=estimated,
    )
    persist_conversation_context_stats(state, breakdown)
    context = persist_context_stats(
        db, conversation_id=conversation_id, user_id=user_id,
        expected_summary=state.context_summary or "", expected_until=state.context_summary_until_message_id,
        stats={key: getattr(state, key) for key in CONTEXT_FIELDS[3:]},
    )
    for key, value in context.items():
        set_committed_value(conversation, key, value)

    return PackedChatContext(
        api_messages=api_messages,
        used_summary=used_summary,
        summarized=summarized,
        estimated_tokens=estimated,
        context_window_tokens=context_window,
        input_budget_tokens=budget,
    )
