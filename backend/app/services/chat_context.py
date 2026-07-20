"""Chat context window packing and incremental history summarization."""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import ChatMessage, Conversation, ProviderProfile
from app.services.chat_message_content import build_provider_messages
from app.services.chat_service import ChatProviderConfig, complete_chat_once

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


def estimate_text_tokens(text: str) -> int:
    if not text:
        return 0
    cjk = len(_CJK_RE.findall(text))
    other = max(len(text) - cjk, 0)
    # CJK denser than Latin; keep a small floor for short strings.
    return max(1, int(cjk / 1.5 + other / 4.0))


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
) -> str:
    digest = _messages_to_digest(messages_to_compress)
    if not digest.strip():
        return existing_summary.strip()

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
    return (await complete_chat_once(provider, prompt_messages, max_tokens=900)).strip()


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


def estimate_conversation_context(
    conversation: Conversation,
    messages: list[ChatMessage],
    *,
    provider_profile: ProviderProfile | ChatProviderConfig | None = None,
) -> ConversationContextStats:
    """Cheap estimate for UI (no LLM). Uses summary + recent-ish raw history."""
    context_window = resolve_context_window(provider_profile)
    budget = input_token_budget(context_window)
    summary = (conversation.context_summary or "").strip()
    summary_tokens = estimate_text_tokens(summary) + (4 if summary else 0)
    until_id = conversation.context_summary_until_message_id
    ordered = sorted(messages, key=lambda item: (item.created_at, item.id or 0))
    visible = [
        message
        for message in ordered
        if until_id is None or message.id is None or message.id > until_id
    ]
    # Cap estimate scan to last 80 visible messages for list performance.
    visible = visible[-80:]
    message_tokens = sum(estimate_message_tokens(message) for message in visible)
    estimated = min(budget, summary_tokens + message_tokens)
    percent = 0 if budget <= 0 else min(100, max(0, round(100 * estimated / budget)))
    return ConversationContextStats(
        tokens=estimated,
        window_tokens=context_window,
        budget_tokens=budget,
        usage_percent=percent,
        compressed=bool(summary),
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
) -> PackedChatContext:
    """Build provider messages that fit the model context window, summarizing older turns when needed.

    `on_status` may be an async callable receiving status labels like \"compressing\".
    """
    context_window = resolve_context_window(provider_profile or provider_config)
    budget = input_token_budget(context_window)
    summary_budget = summary_token_budget()
    trigger_ratio = float(settings.chat_summary_trigger_ratio or 0.85)
    trigger_ratio = min(max(trigger_ratio, 0.5), 0.98)
    trigger_budget = int(budget * trigger_ratio)

    ordered = sorted(messages, key=lambda item: (item.created_at, item.id or 0))
    recent_budget = max(budget - summary_budget, budget // 2)
    recent = _select_recent_messages(ordered, token_budget=recent_budget)
    recent_ids = {message.id for message in recent if message.id is not None}
    older = [message for message in ordered if message.id not in recent_ids]

    until_id = conversation.context_summary_until_message_id
    existing_summary = (conversation.context_summary or "").strip()
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

    should_summarize = bool(
        allow_summarize
        and uncovered
        and (projected > trigger_budget or older_tokens > summary_budget or len(uncovered) >= 8)
    )

    if should_summarize:
        if callable(on_status):
            maybe = on_status("compressing")
            if hasattr(maybe, "__await__"):
                await maybe  # type: ignore[misc]
        try:
            new_summary = await summarize_chat_history(
                provider=provider_config,
                existing_summary=existing_summary,
                messages_to_compress=uncovered,
            )
            if new_summary:
                conversation.context_summary = new_summary
                conversation.context_summary_until_message_id = max(
                    message.id for message in uncovered if message.id is not None
                )
                conversation.context_summary_updated_at = datetime.now(timezone.utc)
                db.add(conversation)
                db.commit()
                db.refresh(conversation)
                existing_summary = new_summary.strip()
                used_summary = True
                summarized = True
        except Exception:
            logger.warning(
                "chat context summarization failed; falling back to window trim",
                exc_info=True,
                extra={"conversation_id": conversation.id},
            )

    api_messages: list[dict[str, object]] = []
    if existing_summary:
        api_messages.append(_summary_system_message(existing_summary))
        used_summary = True
    api_messages.extend(build_provider_messages(recent))
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

    return PackedChatContext(
        api_messages=api_messages,
        used_summary=used_summary,
        summarized=summarized,
        estimated_tokens=estimated,
        context_window_tokens=context_window,
        input_budget_tokens=budget,
    )
