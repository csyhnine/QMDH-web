"""Persistent agent memory search, compaction, and evidence writes."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AgentMemoryEntry, AgentPersona

MEMORY_SEARCH_LIMIT = 12
MEMORY_CONTEXT_LIMIT = 8
SESSION_SUMMARY_REF = "session_summary"


@dataclass(frozen=True)
class CompactedMemoryContext:
    context: str
    hit_count: int
    session_summary_used: bool


def add_memory_entry(
    db: Session,
    *,
    user_id: int,
    content: str,
    memory_type: str = "summary",
    persona_id: int | None = None,
    conversation_id: int | None = None,
    source_turn_ref: str = "",
) -> AgentMemoryEntry:
    cleaned = content.strip()
    if not cleaned:
        raise ValueError("content is required")
    entry = AgentMemoryEntry(
        user_id=user_id,
        persona_id=persona_id,
        conversation_id=conversation_id,
        memory_type=memory_type,
        content=cleaned[:4000],
        source_turn_ref=(source_turn_ref or "")[:120],
    )
    db.add(entry)
    db.flush()
    from app.integrations.search.agent_memory_index import index_agent_memory_entry

    index_agent_memory_entry(entry)
    return entry


def search_memory_entries(
    db: Session,
    *,
    user_id: int,
    query: str = "",
    persona_id: int | None = None,
    include_user_scope: bool = True,
    limit: int = MEMORY_SEARCH_LIMIT,
) -> list[AgentMemoryEntry]:
    stmt = (
        select(AgentMemoryEntry)
        .where(AgentMemoryEntry.user_id == user_id)
        .order_by(AgentMemoryEntry.created_at.desc(), AgentMemoryEntry.id.desc())
        .limit(max(1, min(limit, 50)))
    )

    scope_filters = []
    if persona_id is not None:
        scope_filters.append(AgentMemoryEntry.persona_id == persona_id)
    if include_user_scope:
        scope_filters.append(AgentMemoryEntry.persona_id.is_(None))
    if scope_filters:
        stmt = stmt.where(or_(*scope_filters))

    cleaned_query = query.strip()
    if cleaned_query and settings.meilisearch_enabled:
        from app.integrations.search.agent_memory_index import search_agent_memory_entry_ids

        meili_ids = search_agent_memory_entry_ids(
            user_id=user_id,
            query=cleaned_query,
            persona_id=persona_id,
            limit=limit,
        )
        if meili_ids:
            rows = db.scalars(select(AgentMemoryEntry).where(AgentMemoryEntry.id.in_(meili_ids))).all()
            by_id = {row.id: row for row in rows}
            ordered = [by_id[item_id] for item_id in meili_ids if item_id in by_id]
            if ordered:
                return ordered

    if cleaned_query:
        pattern = f"%{cleaned_query[:120]}%"
        stmt = stmt.where(AgentMemoryEntry.content.ilike(pattern))

    return list(db.scalars(stmt).all())


def get_conversation_session_summary(db: Session, *, user_id: int, conversation_id: int) -> AgentMemoryEntry | None:
    return db.scalar(
        select(AgentMemoryEntry)
        .where(
            AgentMemoryEntry.user_id == user_id,
            AgentMemoryEntry.conversation_id == conversation_id,
            AgentMemoryEntry.memory_type == "summary",
            AgentMemoryEntry.source_turn_ref == f"conv:{conversation_id}:{SESSION_SUMMARY_REF}",
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
    return existing


def build_memory_context(
    db: Session,
    *,
    user_id: int,
    query: str,
    persona_id: int | None = None,
) -> str:
    entries = search_memory_entries(
        db,
        user_id=user_id,
        query=query,
        persona_id=persona_id,
        include_user_scope=True,
        limit=MEMORY_CONTEXT_LIMIT,
    )
    if not entries:
        recent = search_memory_entries(
            db,
            user_id=user_id,
            persona_id=persona_id,
            include_user_scope=True,
            limit=MEMORY_CONTEXT_LIMIT,
        )
        entries = recent

    if not entries:
        return ""

    lines: list[str] = []
    for entry in entries:
        prefix = entry.memory_type
        if entry.persona_id is not None:
            persona = db.get(AgentPersona, entry.persona_id)
            if persona is not None:
                prefix = f"{persona.key}:{entry.memory_type}"
        lines.append(f"- [{prefix}] {entry.content[:500]}")
    return "相关长期记忆：\n" + "\n".join(lines)


def build_compacted_memory_context(
    db: Session,
    *,
    user_id: int,
    conversation_id: int,
    query: str,
) -> CompactedMemoryContext:
    parts: list[str] = []
    session_summary = get_conversation_session_summary(db, user_id=user_id, conversation_id=conversation_id)
    session_summary_used = session_summary is not None
    if session_summary is not None and session_summary.content.strip():
        parts.append(f"当前会话摘要：\n{session_summary.content.strip()[:1200]}")

    retrieved = search_memory_entries(
        db,
        user_id=user_id,
        query=query,
        include_user_scope=True,
        limit=MEMORY_CONTEXT_LIMIT,
    )
    if not retrieved:
        retrieved = search_memory_entries(
            db,
            user_id=user_id,
            include_user_scope=True,
            limit=MEMORY_CONTEXT_LIMIT,
        )

    hit_count = len(retrieved)
    if retrieved:
        lines: list[str] = []
        for entry in retrieved:
            if session_summary is not None and entry.id == session_summary.id:
                continue
            prefix = entry.memory_type
            if entry.persona_id is not None:
                persona = db.get(AgentPersona, entry.persona_id)
                if persona is not None:
                    prefix = f"{persona.key}:{entry.memory_type}"
            lines.append(f"- [{prefix}] {entry.content[:500]}")
        if lines:
            parts.append("相关长期记忆：\n" + "\n".join(lines))

    if not parts:
        return CompactedMemoryContext(context="", hit_count=0, session_summary_used=False)
    return CompactedMemoryContext(
        context="\n\n".join(parts),
        hit_count=hit_count,
        session_summary_used=session_summary_used,
    )


def write_tool_evidence_memory(
    db: Session,
    *,
    user_id: int,
    conversation_id: int,
    persona_id: int | None,
    tool_name: str,
    summary: str,
) -> AgentMemoryEntry | None:
    cleaned = summary.strip()
    if not cleaned:
        return None
    return add_memory_entry(
        db,
        user_id=user_id,
        persona_id=persona_id,
        conversation_id=conversation_id,
        memory_type="fact",
        content=f"{tool_name}: {cleaned[:800]}",
        source_turn_ref=f"conv:{conversation_id}:tool:{tool_name}",
    )


def write_turn_memory(
    db: Session,
    *,
    user_id: int,
    conversation_id: int,
    user_message: str,
    assistant_reply: str,
    route: str,
    persona_id: int | None = None,
) -> AgentMemoryEntry | None:
    user_part = user_message.strip()[:240]
    reply_part = assistant_reply.strip()[:480]
    if not user_part and not reply_part:
        return None

    summary = f"用户：{user_part}；助手：{reply_part}"
    memory_type = "delegation" if route in {"research", "studio", "research_then_studio"} else "summary"
    return add_memory_entry(
        db,
        user_id=user_id,
        persona_id=persona_id,
        conversation_id=conversation_id,
        memory_type=memory_type,
        content=summary,
        source_turn_ref=f"conv:{conversation_id}:{route}",
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
    return add_memory_entry(
        db,
        user_id=user_id,
        conversation_id=conversation_id,
        memory_type="fact",
        content=content,
        source_turn_ref=f"conv:{conversation_id}:hitl:{proposal_id}",
    )


def extract_preference_memory(
    db: Session,
    *,
    user_id: int,
    user_message: str,
    conversation_id: int,
) -> AgentMemoryEntry | None:
    text = user_message.strip()
    markers = ("记住", "偏好", "以后", "默认", "我喜欢", "我常用")
    if not any(marker in text for marker in markers):
        return None
    return add_memory_entry(
        db,
        user_id=user_id,
        conversation_id=conversation_id,
        memory_type="preference",
        content=text[:1000],
        source_turn_ref=f"conv:{conversation_id}:preference",
    )
