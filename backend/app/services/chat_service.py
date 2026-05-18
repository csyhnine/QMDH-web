"""Chat service: OpenAI-compatible streaming client."""
from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncGenerator
from dataclasses import dataclass

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.encryption import (
    EncryptedValueDecodeError,
    EncryptionKeyUnavailableError,
    decrypt_value_or_raise,
)
from app.models import ChatMessage, ProviderProfile

logger = logging.getLogger(__name__)
_HTML_ERROR_PATTERN = re.compile(r"<!doctype html|<html\b", re.IGNORECASE)


@dataclass(frozen=True)
class ChatProviderConfig:
    api_key: str
    base_url: str
    model_name: str


def _sanitize_error_text(raw: object, *, limit: int = 320) -> str:
    text = " ".join(str(raw or "").replace("\r", " ").replace("\n", " ").split()).strip()
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1].rstrip()}…"


def chat_error_payload(*, code: str, summary: str, detail: str, status_code: int | None = None) -> dict[str, object]:
    payload: dict[str, object] = {
        "code": code,
        "summary": summary,
        "detail": detail,
    }
    if status_code is not None:
        payload["status_code"] = status_code
    return payload


def format_chat_error_message(payload: dict[str, object]) -> str:
    summary = str(payload.get("summary") or "对话失败，请稍后重试。").strip()
    detail = str(payload.get("detail") or "").strip()
    code = str(payload.get("code") or "").strip()
    sections = [summary]
    if detail and detail != summary:
        sections.append(f"排查线索：{detail}")
    if code:
        sections.append(f"错误码：{code}")
    return "\n".join(sections)


def provider_profile_has_usable_api_key(profile: ProviderProfile) -> bool:
    try:
        return bool(decrypt_value_or_raise(profile.api_key))
    except (EncryptionKeyUnavailableError, EncryptedValueDecodeError):
        return False


def snapshot_chat_provider_config(profile: ProviderProfile) -> ChatProviderConfig:
    return ChatProviderConfig(
        api_key=profile.api_key,
        base_url=profile.base_url,
        model_name=profile.model_name,
    )


def get_chat_models(db: Session) -> list[ProviderProfile]:
    """Return enabled provider profiles with chat.completions capability."""
    profiles = db.scalars(
        select(ProviderProfile).where(ProviderProfile.enabled == True)  # noqa: E712
    ).all()
    return [
        profile
        for profile in profiles
        if "chat.completions" in (profile.capabilities or []) and provider_profile_has_usable_api_key(profile)
    ]


def build_chat_messages(db: Session, conversation_id: int, new_content: str) -> list[dict]:
    """Load last 50 messages from conversation and append new user message."""
    messages = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
    ).all()

    recent = messages[-50:] if len(messages) > 50 else messages
    result = [{"role": message.role, "content": message.content} for message in recent]
    result.append({"role": "user", "content": new_content})
    return result


async def stream_chat_completion(
    provider: ChatProviderConfig,
    messages: list[dict],
) -> AsyncGenerator[str, None]:
    """Call an OpenAI-compatible /chat/completions endpoint with SSE streaming."""
    api_key = decrypt_value_or_raise(provider.api_key)

    url = f"{provider.base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": provider.model_name,
        "messages": messages,
        "stream": True,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                if response.status_code != 200:
                    raw_body = await response.aread()
                    body_text = _sanitize_error_text(raw_body.decode("utf-8", errors="ignore"), limit=380)
                    upstream_is_html = bool(_HTML_ERROR_PATTERN.search(body_text))

                    summary = f"对话失败：上游模型服务返回 HTTP {response.status_code}。"
                    detail = body_text or f"Upstream returned HTTP {response.status_code}."
                    code = f"chat_upstream_http_{response.status_code}"

                    try:
                        error_data = json.loads(raw_body)
                        if isinstance(error_data, dict) and isinstance(error_data.get("error"), dict):
                            detail = _sanitize_error_text(error_data["error"].get("message", detail), limit=380)
                    except (json.JSONDecodeError, TypeError):
                        pass

                    if response.status_code in {401, 403}:
                        summary = "对话失败：当前 Chat 模型拒绝了 API Key 或权限。"
                    elif response.status_code == 404:
                        summary = "对话失败：当前 Chat 接口地址或模型名称不存在。"
                        if upstream_is_html:
                            detail = "上游返回了 HTML 错误页，通常意味着 base_url 或接口路径配置错误。"
                    elif response.status_code == 429:
                        summary = "对话失败：上游 Chat 服务触发了限流。"
                    elif response.status_code >= 500:
                        summary = "对话失败：上游 Chat 服务当前异常。"

                    logger.warning(
                        "chat completion upstream error",
                        extra={
                            "status_code": response.status_code,
                            "model_name": provider.model_name,
                            "error_code": code,
                        },
                    )
                    yield f"data: {json.dumps({'error': chat_error_payload(code=code, summary=summary, detail=detail, status_code=response.status_code)})}\n\n"
                    return

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield f"data: {json.dumps({'delta': content})}\n\n"
                    except (json.JSONDecodeError, IndexError, KeyError, TypeError):
                        continue

    except httpx.TimeoutException:
        yield f"data: {json.dumps({'error': chat_error_payload(code='chat_upstream_timeout', summary='对话失败：上游 Chat 服务响应超时。', detail='The upstream chat completion request timed out.')})}\n\n"
    except httpx.ConnectError:
        yield f"data: {json.dumps({'error': chat_error_payload(code='chat_upstream_connect_error', summary='对话失败：无法连接上游 Chat 服务。', detail='The upstream chat completion endpoint could not be reached.')})}\n\n"
    except Exception as exc:
        logger.exception("chat completion failed")
        yield f"data: {json.dumps({'error': chat_error_payload(code='chat_stream_error', summary='对话失败：请求过程中出现异常。', detail=_sanitize_error_text(str(exc), limit=380))})}\n\n"

    yield "data: [DONE]\n\n"
