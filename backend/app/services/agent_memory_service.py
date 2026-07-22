"""Cross-conversation durable memory library + compaction helpers.

Per-user isolation is mandatory: every read/write/search filters by user_id.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AgentMemoryEntry

MEMORY_SEARCH_LIMIT = 12
MEMORY_CONTEXT_LIMIT = 8
SESSION_SUMMARY_REF = "session_summary"
LONG_TERM_TYPES = frozenset({"preference", "feedback", "thought", "fact"})
TURN_SUMMARY_TYPES = frozenset({"summary"})

# Kept for backward-compatible imports / tests; extraction no longer requires these alone.
PREFERENCE_MARKERS = ("记住", "偏好", "以后", "默认", "我喜欢", "我常用")

_GREETING_ONLY = re.compile(
    r"^(你好|您好|嗨|哈喽|hello|hi|hey|早上好|中午好|晚上好|谢谢|感谢|收到|好的|嗯|哦)[\s!！。.~～]*$",
    re.IGNORECASE,
)

_EXPLICIT_REMEMBER = (
    "记住",
    "记一下",
    "别忘了",
    "请记住",
    "帮我记",
)

_PREFERENCE_SIGNALS = (
    "偏好",
    "我喜欢",
    "我不喜欢",
    "我更喜欢",
    "我常用",
    "我习惯",
    "默认用",
    "默认是",
    "以后都",
    "以后用",
    "下次请",
    "下次都",
    "一般用",
    "通常用",
    "倾向",
    "风格",
    "比例用",
    "用 16",
    "用16",
    "不要用",
    "别用",
)

_FEEDBACK_SIGNALS = (
    "太",
    "不好",
    "不行",
    "不对",
    "不准",
    "不够",
    "太多",
    "太少",
    "太长",
    "太短",
    "太乱",
    "更像",
    "更好",
    "改成",
    "换成",
    "换一个",
    "重来",
    "别再",
    "不要再",
    "别这样",
    "这样不好",
    "反馈",
    "不满意",
    "满意",
    "有用",
    "没用",
    "更清楚",
    "太啰嗦",
    "太简洁",
)

_THOUGHT_SIGNALS = (
    "我觉得",
    "我认为",
    "我想",
    "我希望",
    "我打算",
    "我是",
    "我在",
    "我们组",
    "我们团队",
    "我的项目",
    "我这边",
    "个人觉得",
    "依我看",
    "对我来说",
)

_TYPE_WEIGHT = {
    "preference": 100,
    "fact": 90,
    "feedback": 80,
    "thought": 70,
    "summary": 10,
}


@dataclass(frozen=True)
class CompactedMemoryContext:
    context: str
    hit_count: int
    session_summary_used: bool


def _is_session_summary(entry: AgentMemoryEntry) -> bool:
    return entry.memory_type == "summary" and entry.source_turn_ref.endswith(f":{SESSION_SUMMARY_REF}")


def _normalize_for_dedupe(text: str) -> str:
    return re.sub(r"\s+", "", (text or "").strip().lower())


def add_memory_entry(
    db: Session,
    *,
    user_id: int,
    content: str,
    memory_type: str = "summary",
    conversation_id: int | None = None,
    source_turn_ref: str = "",
    is_paused: bool = False,
) -> AgentMemoryEntry:
    cleaned = content.strip()
    if not cleaned:
        raise ValueError("content is required")
    entry = AgentMemoryEntry(
        user_id=user_id,
        conversation_id=conversation_id,
        memory_type=memory_type,
        content=cleaned[:4000],
        source_turn_ref=(source_turn_ref or "")[:120],
        is_paused=is_paused,
    )
    db.add(entry)
    db.flush()
    try:
        from app.integrations.search.agent_memory_index import index_agent_memory_entry

        index_agent_memory_entry(entry)
    except Exception:
        pass
    return entry


def store_memory_entry(
    db: Session,
    *,
    user_id: int,
    content: str,
    memory_type: str = "fact",
    conversation_id: int | None = None,
    source_turn_ref: str = "",
) -> tuple[AgentMemoryEntry | None, str]:
    """Store a durable memory with near-duplicate skip. Returns (entry|None, status)."""
    cleaned = content.strip()
    if not cleaned:
        return None, "empty"
    cleaned_type = (memory_type or "fact").strip().lower() or "fact"
    if cleaned_type not in LONG_TERM_TYPES and cleaned_type != "summary":
        cleaned_type = "fact"

    needle = _normalize_for_dedupe(cleaned)
    recent = list_memory_entries(db, user_id=user_id, include_paused=False, limit=40)
    for row in recent:
        existing = _normalize_for_dedupe(row.content)
        if not existing:
            continue
        if existing == needle or (len(needle) >= 12 and (needle in existing or existing in needle)):
            return row, "duplicate"

    entry = add_memory_entry(
        db,
        user_id=user_id,
        content=cleaned,
        memory_type=cleaned_type,
        conversation_id=conversation_id,
        source_turn_ref=source_turn_ref or "manual_store",
    )
    return entry, "stored"


def list_memory_entries(
    db: Session,
    *,
    user_id: int,
    include_paused: bool = True,
    limit: int = 50,
) -> list[AgentMemoryEntry]:
    stmt = (
        select(AgentMemoryEntry)
        .where(AgentMemoryEntry.user_id == user_id)
        .order_by(AgentMemoryEntry.created_at.desc(), AgentMemoryEntry.id.desc())
        .limit(max(1, min(limit, 100)))
    )
    if not include_paused:
        stmt = stmt.where(AgentMemoryEntry.is_paused == False)  # noqa: E712
    return list(db.scalars(stmt).all())


def set_memory_paused(db: Session, *, user_id: int, memory_id: int, paused: bool) -> AgentMemoryEntry | None:
    entry = db.get(AgentMemoryEntry, memory_id)
    if entry is None or entry.user_id != user_id:
        return None
    entry.is_paused = paused
    db.flush()
    try:
        from app.integrations.search.agent_memory_index import delete_agent_memory_entry, index_agent_memory_entry

        if paused:
            delete_agent_memory_entry(memory_id)
        else:
            index_agent_memory_entry(entry)
    except Exception:
        pass
    return entry


def delete_memory_entry(db: Session, *, user_id: int, memory_id: int) -> bool:
    entry = db.get(AgentMemoryEntry, memory_id)
    if entry is None or entry.user_id != user_id:
        return False
    db.delete(entry)
    db.flush()
    try:
        from app.integrations.search.agent_memory_index import delete_agent_memory_entry

        delete_agent_memory_entry(memory_id)
    except Exception:
        pass
    return True


def _rank_memory_entries(entries: list[AgentMemoryEntry], *, query: str) -> list[AgentMemoryEntry]:
    tokens = [t for t in re.split(r"[\s,，。！？、]+", (query or "").strip().lower()) if len(t) >= 2]

    def score(entry: AgentMemoryEntry) -> tuple[int, int]:
        weight = _TYPE_WEIGHT.get(entry.memory_type, 20)
        if _is_session_summary(entry):
            weight = 40
        elif entry.memory_type == "summary":
            weight = 10
        content = (entry.content or "").lower()
        hit = sum(3 if token in content else 0 for token in tokens)
        return (weight + hit, entry.id or 0)

    return sorted(entries, key=score, reverse=True)


def search_memory_entries(
    db: Session,
    *,
    user_id: int,
    query: str = "",
    limit: int = MEMORY_SEARCH_LIMIT,
    long_term_only: bool = False,
) -> list[AgentMemoryEntry]:
    cleaned_query = query.strip()
    limit = max(1, min(limit, 50))

    if cleaned_query and settings.meilisearch_enabled:
        try:
            from app.integrations.search.agent_memory_index import search_agent_memory_entry_ids

            meili_ids = search_agent_memory_entry_ids(
                user_id=user_id,
                query=cleaned_query,
                limit=limit * 2,
            )
            if meili_ids:
                rows = db.scalars(
                    select(AgentMemoryEntry).where(
                        AgentMemoryEntry.id.in_(meili_ids),
                        AgentMemoryEntry.user_id == user_id,
                        AgentMemoryEntry.is_paused == False,  # noqa: E712
                    )
                ).all()
                by_id = {row.id: row for row in rows}
                ordered = [by_id[item_id] for item_id in meili_ids if item_id in by_id]
                if long_term_only:
                    ordered = [row for row in ordered if row.memory_type in LONG_TERM_TYPES or _is_session_summary(row)]
                if ordered:
                    return ordered[:limit]
        except Exception:
            pass

    stmt = (
        select(AgentMemoryEntry)
        .where(
            AgentMemoryEntry.user_id == user_id,
            AgentMemoryEntry.is_paused == False,  # noqa: E712
        )
        .order_by(AgentMemoryEntry.created_at.desc(), AgentMemoryEntry.id.desc())
        .limit(80)
    )
    if long_term_only:
        stmt = stmt.where(AgentMemoryEntry.memory_type.in_(tuple(LONG_TERM_TYPES | {"summary"})))
    if cleaned_query:
        pattern = f"%{cleaned_query[:120]}%"
        stmt = stmt.where(AgentMemoryEntry.content.ilike(pattern))

    rows = list(db.scalars(stmt).all())
    if long_term_only:
        rows = [row for row in rows if row.memory_type in LONG_TERM_TYPES or _is_session_summary(row)]
    ranked = _rank_memory_entries(rows, query=cleaned_query)
    return ranked[:limit]


def get_conversation_session_summary(db: Session, *, user_id: int, conversation_id: int) -> AgentMemoryEntry | None:
    return db.scalar(
        select(AgentMemoryEntry)
        .where(
            AgentMemoryEntry.user_id == user_id,
            AgentMemoryEntry.conversation_id == conversation_id,
            AgentMemoryEntry.memory_type == "summary",
            AgentMemoryEntry.source_turn_ref == f"conv:{conversation_id}:{SESSION_SUMMARY_REF}",
            AgentMemoryEntry.is_paused == False,  # noqa: E712
        )
        .order_by(AgentMemoryEntry.created_at.desc(), AgentMemoryEntry.id.desc())
    )


def upsert_conversation_session_summary(
    db: Session,
    *,
    user_id: int,
    conversation_id: int,
    user_message: str,
    assistant_reply: str,
    route: str,
) -> AgentMemoryEntry:
    existing = get_conversation_session_summary(db, user_id=user_id, conversation_id=conversation_id)
    snippet = f"[{route}] 用户:{user_message.strip()[:160]} | 助手:{assistant_reply.strip()[:280]}"
    if existing is None:
        return add_memory_entry(
            db,
            user_id=user_id,
            conversation_id=conversation_id,
            memory_type="summary",
            content=snippet[:1200],
            source_turn_ref=f"conv:{conversation_id}:{SESSION_SUMMARY_REF}",
        )

    merged = f"{existing.content}\n{snippet}".strip()
    existing.content = merged[-4000:]
    db.flush()
    try:
        from app.integrations.search.agent_memory_index import index_agent_memory_entry

        index_agent_memory_entry(existing)
    except Exception:
        pass
    return existing


def build_compacted_memory_context(
    db: Session,
    *,
    user_id: int,
    conversation_id: int,
    query: str,
) -> CompactedMemoryContext:
    """Layered auto-recall: long-term first, session summary second, turn summaries last."""
    parts: list[str] = []
    hit_count = 0

    long_term = search_memory_entries(
        db,
        user_id=user_id,
        query=query,
        limit=MEMORY_CONTEXT_LIMIT,
        long_term_only=True,
    )
    # If query misses, still surface recent durable preferences/facts for this user.
    if not long_term:
        long_term = search_memory_entries(
            db,
            user_id=user_id,
            limit=MEMORY_CONTEXT_LIMIT,
            long_term_only=True,
        )

    durable_lines: list[str] = []
    for entry in long_term:
        if _is_session_summary(entry):
            continue
        if entry.memory_type not in LONG_TERM_TYPES:
            continue
        durable_lines.append(f"- [{entry.memory_type}] #{entry.id} {entry.content[:500]}")
    if durable_lines:
        parts.append("长期记忆（按用户隔离，仅本人）：\n" + "\n".join(durable_lines[:6]))
        hit_count += len(durable_lines[:6])

    session_summary = get_conversation_session_summary(db, user_id=user_id, conversation_id=conversation_id)
    session_summary_used = bool(session_summary and session_summary.content.strip())
    if session_summary_used and session_summary is not None:
        parts.append(f"当前会话摘要：\n{session_summary.content.strip()[:1000]}")

    # Turn-level summaries only as light fallback when durable memory is thin.
    if hit_count < 2:
        fallback = search_memory_entries(db, user_id=user_id, query=query, limit=4)
        turn_lines: list[str] = []
        for entry in fallback:
            if _is_session_summary(entry) or entry.memory_type in LONG_TERM_TYPES:
                continue
            if entry.memory_type != "summary":
                continue
            turn_lines.append(f"- {entry.content[:220]}")
        if turn_lines:
            parts.append("近期对话摘要（低权重）：\n" + "\n".join(turn_lines[:2]))
            hit_count += len(turn_lines[:2])

    if not parts:
        return CompactedMemoryContext(context="", hit_count=0, session_summary_used=False)
    header = "以下为该设计师的私有记忆库召回结果，请在回复中尊重其中的偏好与反馈。"
    return CompactedMemoryContext(
        context=header + "\n\n" + "\n\n".join(parts),
        hit_count=hit_count,
        session_summary_used=session_summary_used,
    )


def classify_user_memory_signal(user_message: str) -> str | None:
    """Return durable memory type for feedback / preference / personal thought, else None."""
    text = (user_message or "").strip()
    if len(text) < 4:
        return None
    if _GREETING_ONLY.match(text):
        return None

    lowered = text.lower()
    if any(marker in text for marker in _EXPLICIT_REMEMBER):
        return "preference"
    if any(marker in text or marker.lower() in lowered for marker in _PREFERENCE_SIGNALS):
        return "preference"
    if any(marker in text for marker in _THOUGHT_SIGNALS):
        return "thought"
    if any(marker in text for marker in _FEEDBACK_SIGNALS) and len(text) >= 6:
        return "feedback"
    return None


def extract_durable_user_memory(
    db: Session,
    *,
    user_id: int,
    user_message: str,
    conversation_id: int,
) -> AgentMemoryEntry | None:
    memory_type = classify_user_memory_signal(user_message)
    if memory_type is None:
        return None
    text = user_message.strip()
    entry, status = store_memory_entry(
        db,
        user_id=user_id,
        content=text[:1000],
        memory_type=memory_type,
        conversation_id=conversation_id,
        source_turn_ref=f"conv:{conversation_id}:{memory_type}",
    )
    if status == "duplicate":
        return entry
    return entry


def extract_preference_memory(
    db: Session,
    *,
    user_id: int,
    user_message: str,
    conversation_id: int,
) -> AgentMemoryEntry | None:
    """Backward-compatible alias for durable signal extraction."""
    return extract_durable_user_memory(
        db,
        user_id=user_id,
        user_message=user_message,
        conversation_id=conversation_id,
    )


def write_turn_memory(
    db: Session,
    *,
    user_id: int,
    conversation_id: int,
    user_message: str,
    assistant_reply: str,
    route: str,
) -> AgentMemoryEntry | None:
    user_part = user_message.strip()[:240]
    reply_part = assistant_reply.strip()[:480]
    if not user_part and not reply_part:
        return None

    upsert_conversation_session_summary(
        db,
        user_id=user_id,
        conversation_id=conversation_id,
        user_message=user_message,
        assistant_reply=assistant_reply,
        route=route,
    )

    summary = f"用户：{user_part}；助手：{reply_part}"
    return add_memory_entry(
        db,
        user_id=user_id,
        conversation_id=conversation_id,
        memory_type="summary",
        content=summary,
        source_turn_ref=f"conv:{conversation_id}:{route}",
    )


def record_chat_turn_memory(
    db: Session,
    *,
    user_id: int | None,
    conversation_id: int,
    user_message: str,
    assistant_reply: str,
    route: str,
) -> None:
    """Shared write path for normal Chat and design-assistant harness."""
    if user_id is None:
        return
    reply = (assistant_reply or "").strip()
    if not reply or reply.startswith("【错误】") or reply.startswith("助手未返回"):
        return
    extract_durable_user_memory(
        db,
        user_id=user_id,
        user_message=user_message,
        conversation_id=conversation_id,
    )
    write_turn_memory(
        db,
        user_id=user_id,
        conversation_id=conversation_id,
        user_message=user_message,
        assistant_reply=reply,
        route=route,
    )


def write_hitl_confirmation_memory(
    db: Session,
    *,
    user_id: int,
    conversation_id: int,
    proposal_id: str,
    task_id: int,
    workflow_key: str,
) -> AgentMemoryEntry:
    content = f"用户已确认 {workflow_key} 任务 proposal={proposal_id} task_id={task_id}"
    entry, _status = store_memory_entry(
        db,
        user_id=user_id,
        content=content,
        memory_type="fact",
        conversation_id=conversation_id,
        source_turn_ref=f"conv:{conversation_id}:hitl:{proposal_id}",
    )
    assert entry is not None
    return entry


# --- Chat tool helpers (user_id scoped) ---


def tool_memory_recall(db: Session, *, user_id: int | None, query: str, limit: int = 5) -> dict[str, object]:
    if user_id is None:
        return {"ok": False, "error": "authentication required"}
    rows = search_memory_entries(db, user_id=user_id, query=query, limit=limit)
    return {
        "ok": True,
        "count": len(rows),
        "memories": [
            {
                "id": row.id,
                "memory_type": row.memory_type,
                "content": row.content[:800],
                "source_turn_ref": row.source_turn_ref,
            }
            for row in rows
        ],
    }


def tool_memory_store(
    db: Session,
    *,
    user_id: int | None,
    content: str,
    memory_type: str = "fact",
    conversation_id: int | None = None,
) -> dict[str, object]:
    if user_id is None:
        return {"ok": False, "error": "authentication required"}
    entry, status = store_memory_entry(
        db,
        user_id=user_id,
        content=content,
        memory_type=memory_type,
        conversation_id=conversation_id,
        source_turn_ref="tool:memory_store",
    )
    if entry is None:
        return {"ok": False, "error": "content is required", "status": status}
    return {
        "ok": True,
        "status": status,
        "id": entry.id,
        "memory_type": entry.memory_type,
        "content": entry.content[:400],
    }


def tool_memory_forget(db: Session, *, user_id: int | None, memory_id: int) -> dict[str, object]:
    if user_id is None:
        return {"ok": False, "error": "authentication required"}
    deleted = delete_memory_entry(db, user_id=user_id, memory_id=memory_id)
    if not deleted:
        return {"ok": False, "error": "memory not found or not owned by current user"}
    return {"ok": True, "deleted_id": memory_id}
