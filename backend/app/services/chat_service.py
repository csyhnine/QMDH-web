"""Chat service: OpenAI-compatible streaming client."""
from __future__ import annotations

import json
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
from app.models import ChatMessage, Conversation, ProviderProfile


@dataclass(frozen=True)
class ChatProviderConfig:
    api_key: str
    base_url: str
    model_name: str


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
        p
        for p in profiles
        if "chat.completions" in (p.capabilities or []) and provider_profile_has_usable_api_key(p)
    ]


def build_chat_messages(db: Session, conversation_id: int, new_content: str) -> list[dict]:
    """Load last 50 messages from conversation and append new user message."""
    messages = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
    ).all()

    # Take last 50 messages for context
    recent = messages[-50:] if len(messages) > 50 else messages

    result = [{"role": m.role, "content": m.content} for m in recent]
    result.append({"role": "user", "content": new_content})
    return result


async def stream_chat_completion(
    provider: ChatProviderConfig,
    messages: list[dict],
) -> AsyncGenerator[str, None]:
    """
    Call OpenAI-compatible chat/completions endpoint with streaming.
    Yields SSE-formatted strings: 'data: {"delta": "..."}\n\n'
    """
    # Decrypt API key
    api_key = decrypt_value_or_raise(provider.api_key)

    base_url = provider.base_url.rstrip("/")
    url = f"{base_url}/chat/completions"

    payload = {
        "model": provider.model_name,
        "messages": messages,
        "stream": True,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    full_content = ""

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST", url, json=payload, headers=headers
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    error_msg = f"模型服务返回错误: {response.status_code}"
                    try:
                        error_data = json.loads(body)
                        if "error" in error_data:
                            error_msg = error_data["error"].get("message", error_msg)
                    except (json.JSONDecodeError, KeyError):
                        pass
                    yield f"data: {json.dumps({'error': error_msg})}\n\n"
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
                            full_content += content
                            yield f"data: {json.dumps({'delta': content})}\n\n"
                    except (json.JSONDecodeError, IndexError, KeyError):
                        continue

    except httpx.TimeoutException:
        yield f"data: {json.dumps({'error': '模型服务响应超时'})}\n\n"
    except httpx.ConnectError:
        yield f"data: {json.dumps({'error': '无法连接模型服务'})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': f'请求失败: {str(e)}'})}\n\n"

    yield "data: [DONE]\n\n"

    # Return full content for persistence (caller reads this via attribute)
    # We use a trick: yield a special marker that the caller can detect
    # Actually, we'll handle persistence in the router instead
