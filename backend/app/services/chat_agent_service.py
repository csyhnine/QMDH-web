"""Chat agent mode: PydanticAI tools + SSE streaming wrapper."""

from __future__ import annotations

import json
import re
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any

from app.integrations.studio_agent.agent import ChatAgentToolCall, StudioAgentReply
from app.models import ChatMessage

_SSE_CHUNK_SIZE = 24
_AGENT_META_PATTERN = re.compile(r"\n\n<!-- qmdh-agent-meta:(\{.*?\}) -->\s*$", re.DOTALL)


@dataclass(frozen=True)
class ParsedAgentMessageMeta:
    visible_content: str
    tool_calls: tuple[ChatAgentToolCall, ...]
    task_proposals: tuple[dict[str, object], ...]
    thinking_steps: tuple[dict[str, object], ...]
    policy_version: str | None


def format_agent_thinking_sse() -> str:
    """Early SSE heartbeat while PydanticAI agent runs synchronously."""
    return f"data: {json.dumps({'status': 'thinking'}, ensure_ascii=False)}\n\n"


def format_agent_thinking_step_sse(step: dict[str, object]) -> str:
    return f"data: {json.dumps({'thinking_step': step}, ensure_ascii=False)}\n\n"


def format_agent_policy_sse(*, policy_version: str, release_display_name: str | None = None) -> str:
    payload: dict[str, Any] = {"policy_version": policy_version}
    if release_display_name:
        payload["release_display_name"] = release_display_name
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def embed_agent_message_meta(
    content: str,
    *,
    tool_calls: tuple[ChatAgentToolCall, ...] | list[ChatAgentToolCall],
    task_proposals: tuple[dict[str, object], ...] | list[dict[str, object]] | None = None,
    thinking_steps: tuple[dict[str, object], ...] | list[dict[str, object]] | None = None,
    policy_version: str,
) -> str:
    """Append invisible HTML comment so tool history survives reload without migration."""
    body = content.strip()
    meta: dict[str, object] = {
        "tool_calls": [{"name": call.name, "summary": call.summary} for call in tool_calls],
        "policy_version": policy_version,
    }
    if task_proposals:
        meta["task_proposals"] = [dict(item) for item in task_proposals]
    if thinking_steps:
        meta["thinking_steps"] = [dict(item) for item in thinking_steps]
    return f"{body}\n\n<!-- qmdh-agent-meta:{json.dumps(meta, ensure_ascii=False)} -->"


def parse_agent_message_meta(content: str) -> ParsedAgentMessageMeta:
    match = _AGENT_META_PATTERN.search(content or "")
    if not match:
        return ParsedAgentMessageMeta(
            visible_content=(content or "").strip(),
            tool_calls=(),
            task_proposals=(),
            thinking_steps=(),
            policy_version=None,
        )

    visible = _AGENT_META_PATTERN.sub("", content or "").strip()
    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError:
        return ParsedAgentMessageMeta(
            visible_content=visible,
            tool_calls=(),
            task_proposals=(),
            thinking_steps=(),
            policy_version=None,
        )

    tool_calls: list[ChatAgentToolCall] = []
    raw_calls = payload.get("tool_calls")
    if isinstance(raw_calls, list):
        for item in raw_calls:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            summary = str(item.get("summary") or "").strip()
            if name:
                tool_calls.append(ChatAgentToolCall(name=name, summary=summary or "已完成"))

    task_proposals: list[dict[str, object]] = []
    raw_proposals = payload.get("task_proposals")
    if isinstance(raw_proposals, list):
        for item in raw_proposals:
            if isinstance(item, dict) and item.get("proposal_id"):
                task_proposals.append(dict(item))

    thinking_steps: list[dict[str, object]] = []
    raw_thinking = payload.get("thinking_steps")
    if isinstance(raw_thinking, list):
        for item in raw_thinking:
            if isinstance(item, dict) and item.get("key"):
                thinking_steps.append(dict(item))

    policy_version = str(payload.get("policy_version") or "").strip() or None
    return ParsedAgentMessageMeta(
        visible_content=visible,
        tool_calls=tuple(tool_calls),
        task_proposals=tuple(task_proposals),
        thinking_steps=tuple(thinking_steps),
        policy_version=policy_version,
    )


def build_chat_agent_message(
    recent_messages: list[ChatMessage],
    new_content: str,
    *,
    attachment_names: list[str] | None = None,
) -> str:
    """Build a multi-turn prompt for the agent from recent conversation turns."""
    lines: list[str] = []
    for message in recent_messages[-10:]:
        if message.role not in {"user", "assistant"}:
            continue
        parsed = parse_agent_message_meta(message.content or "")
        text = parsed.visible_content.strip()
        if not text:
            continue
        role_label = "用户" if message.role == "user" else "助手"
        lines.append(f"{role_label}: {text[:800]}")

    user_line = new_content.strip()
    if attachment_names:
        joined = "、".join(attachment_names[:4])
        user_line = f"{user_line}\n[附件: {joined}]" if user_line else f"[附件: {joined}]"
    lines.append(f"用户: {user_line}")
    return "\n".join(lines)


def _split_stream_chunks(text: str) -> list[str]:
    normalized = text.strip()
    if not normalized:
        return []

    chunks: list[str] = []
    for paragraph in re.split(r"(\n\n+)", normalized):
        if not paragraph:
            continue
        if paragraph.startswith("\n"):
            chunks.append(paragraph)
            continue
        for index in range(0, len(paragraph), _SSE_CHUNK_SIZE):
            chunks.append(paragraph[index : index + _SSE_CHUNK_SIZE])
    return chunks


async def stream_chat_agent_sse(reply: StudioAgentReply) -> AsyncGenerator[str, None]:
    """Emit policy, tool_calls / tool_result, proposals, then text deltas."""
    yield format_agent_policy_sse(policy_version=reply.policy_version)

    if reply.task_proposals:
        yield f"data: {json.dumps({'task_proposals': list(reply.task_proposals)}, ensure_ascii=False)}\n\n"

    if reply.tool_calls:
        payload = {
            "tool_calls": [
                {"name": call.name, "summary": call.summary}
                for call in reply.tool_calls
            ]
        }
        yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
        for call in reply.tool_calls:
            yield f"data: {json.dumps({'tool_result': {'name': call.name, 'summary': call.summary}}, ensure_ascii=False)}\n\n"

    for chunk in _split_stream_chunks(reply.text):
        yield f"data: {json.dumps({'delta': chunk}, ensure_ascii=False)}\n\n"

    yield "data: [DONE]\n\n"
