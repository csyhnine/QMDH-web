"""Chat service: OpenAI-compatible streaming client."""
from __future__ import annotations

import asyncio
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
_USAGE_REJECTION_PATTERN = re.compile(
    r"include_usage|stream_options|unknown parameter|extra inputs",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ChatProviderConfig:
    api_key: str
    base_url: str
    model_name: str
    display_name: str = ""
    timeout_seconds: float = 120.0


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
        display_name=(profile.display_name or profile.model_name or profile.provider_name).strip(),
        model_name=profile.model_name,
        timeout_seconds=float(profile.timeout_seconds or 120.0),
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
    """Legacy helper kept for tests; prefers full history then appends the new user turn.

    Production send path uses `pack_chat_context` for token-window + summarization.
    """
    messages = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
    ).all()

    result = [{"role": message.role, "content": message.content} for message in messages]
    result.append({"role": "user", "content": new_content})
    return result


def _body_rejects_usage_stream(body_text: str) -> bool:
    return bool(_USAGE_REJECTION_PATTERN.search(body_text or ""))


def _extract_usage_payload(raw_usage: object) -> dict[str, int] | None:
    if not isinstance(raw_usage, dict):
        return None

    prompt_tokens = int(raw_usage.get("prompt_tokens") or 0)
    completion_tokens = int(raw_usage.get("completion_tokens") or 0)
    total_tokens = int(raw_usage.get("total_tokens") or 0)
    if total_tokens == 0:
        total_tokens = prompt_tokens + completion_tokens

    if prompt_tokens == 0 and completion_tokens == 0 and total_tokens == 0:
        return None

    return {
        "prompt_tokens": max(prompt_tokens, 0),
        "completion_tokens": max(completion_tokens, 0),
        "total_tokens": max(total_tokens, 0),
    }


def _upstream_error_event(
    *,
    response: httpx.Response,
    raw_body: bytes,
    model_name: str,
) -> str:
    body_text = _sanitize_error_text(raw_body.decode("utf-8", errors="ignore"), limit=380)
    upstream_is_html = bool(_HTML_ERROR_PATTERN.search(body_text))

    summary = f"对话失败：上游模型服务返回 HTTP {response.status_code}。"
    detail = body_text or f"Upstream returned HTTP {response.status_code}."
    code = f"chat_upstream_http_{response.status_code}"

    try:
        error_data = json.loads(raw_body)
        if isinstance(error_data, dict):
            if isinstance(error_data.get("error"), dict):
                detail = _sanitize_error_text(error_data["error"].get("message", detail), limit=380)
            elif error_data.get("detail"):
                detail = _sanitize_error_text(error_data.get("detail"), limit=380)
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
            "model_name": model_name,
            "error_code": code,
        },
    )
    return f"data: {json.dumps({'error': chat_error_payload(code=code, summary=summary, detail=detail, status_code=response.status_code)})}\n\n"


async def complete_chat_once(
    provider: ChatProviderConfig,
    messages: list[dict],
    *,
    max_tokens: int = 900,
) -> str:
    """Non-streaming chat completion used for context summarization."""
    api_key = decrypt_value_or_raise(provider.api_key)
    url = f"{provider.base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": provider.model_name,
        "messages": messages,
        "stream": False,
        "max_tokens": max(int(max_tokens or 900), 64),
        "temperature": 0.2,
    }
    timeout = max(float(provider.timeout_seconds or 120.0), 1.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, json=payload, headers=headers)
        if response.status_code != 200:
            detail = _sanitize_error_text(response.text, limit=380)
            raise RuntimeError(f"summarize upstream HTTP {response.status_code}: {detail}")
        data = response.json()
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError("summarize upstream returned unexpected payload") from exc
        text = str(content or "").strip()
        if not text:
            raise RuntimeError("summarize upstream returned empty content")
        return text


async def stream_chat_completion(
    provider: ChatProviderConfig,
    messages: list[dict],
) -> AsyncGenerator[str, None]:
    """Call an OpenAI-compatible /chat/completions endpoint with SSE streaming."""
    api_key = decrypt_value_or_raise(provider.api_key)

    url = f"{provider.base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=max(float(provider.timeout_seconds or 120.0), 1.0)) as client:
            for include_usage in (True, False):
                payload = {
                    "model": provider.model_name,
                    "messages": messages,
                    "stream": True,
                }
                if include_usage:
                    payload["stream_options"] = {"include_usage": True}

                async with client.stream("POST", url, json=payload, headers=headers) as response:
                    if response.status_code != 200:
                        raw_body = await response.aread()
                        body_text = _sanitize_error_text(raw_body.decode("utf-8", errors="ignore"), limit=380)
                        if include_usage and response.status_code == 400 and _body_rejects_usage_stream(body_text):
                            logger.info(
                                "chat completion retrying without stream usage",
                                extra={"model_name": provider.model_name, "status_code": response.status_code},
                            )
                            continue

                        yield _upstream_error_event(response=response, raw_body=raw_body, model_name=provider.model_name)
                        return

                    async for line in response.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data.strip() == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                        except json.JSONDecodeError:
                            continue

                        usage = _extract_usage_payload(chunk.get("usage"))
                        if usage:
                            yield f"data: {json.dumps({'usage': usage})}\n\n"

                        try:
                            choice = chunk.get("choices", [{}])[0] if isinstance(chunk.get("choices"), list) else {}
                            if not isinstance(choice, dict):
                                choice = {}
                            delta = choice.get("delta") if isinstance(choice.get("delta"), dict) else {}
                            content = delta.get("content") or ""
                            # Some OpenAI-compatible gateways emit a single full message instead of deltas.
                            if not content:
                                message = choice.get("message") if isinstance(choice.get("message"), dict) else {}
                                content = message.get("content") or ""
                            if not content and isinstance(chunk.get("content"), str):
                                content = chunk.get("content") or ""
                        except (IndexError, KeyError, TypeError):
                            content = ""
                        if content:
                            # Split oversized single-frame payloads so the UI can still paint incrementally.
                            text = str(content)
                            if len(text) > 24:
                                step = max(8, len(text) // 24)
                                for index in range(0, len(text), step):
                                    piece = text[index : index + step]
                                    if piece:
                                        yield f"data: {json.dumps({'delta': piece}, ensure_ascii=False)}\n\n"
                                        await asyncio.sleep(0)
                            else:
                                yield f"data: {json.dumps({'delta': text}, ensure_ascii=False)}\n\n"
                                await asyncio.sleep(0)
                    break

    except httpx.TimeoutException:
        yield f"data: {json.dumps({'error': chat_error_payload(code='chat_upstream_timeout', summary='对话失败：上游 Chat 服务响应超时。', detail='The upstream chat completion request timed out.')})}\n\n"
    except httpx.ConnectError:
        yield f"data: {json.dumps({'error': chat_error_payload(code='chat_upstream_connect_error', summary='对话失败：无法连接上游 Chat 服务。', detail='The upstream chat completion endpoint could not be reached.')})}\n\n"
    except Exception as exc:
        logger.exception("chat completion failed")
        yield f"data: {json.dumps({'error': chat_error_payload(code='chat_stream_error', summary='对话失败：请求过程中出现异常。', detail=_sanitize_error_text(str(exc), limit=380))})}\n\n"

    yield "data: [DONE]\n\n"
