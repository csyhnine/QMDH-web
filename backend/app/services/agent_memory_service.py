"""Cross-conversation durable memory library + compaction helpers.

Per-user isolation is mandatory: every read/write/search filters by user_id.

Write policy (2026-07-26):
- Do NOT store a turn-level summary row for every successful chat turn.
- Keep one rolling session summary per conversation; periodically compact it.
- Long-term rows only for clear durable signals, stored as short distilled facts.
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
LONG_TERM_TYPES = frozenset({"preference", "feedback", "thought", "fact", "experience"})
TURN_SUMMARY_TYPES = frozenset({"summary"})

SESSION_RECENT_TURNS = 3
SESSION_COMPACT_TURN_THRESHOLD = 5
SESSION_COMPACT_CHAR_THRESHOLD = 1400
SESSION_SUMMARY_MAX_CHARS = 2000
DURABLE_FACT_MAX_CHARS = 160

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
    "默认这个",
    "以后都",
    "以后用",
    "下次请",
    "下次都",
    "一般用",
    "通常用",
    "倾向",
    "比例用",
    "用 16",
    "用16",
    "不要用",
    "别用",
)

# Avoid bare "太" / "改成" / "换成" — they match almost every revision request.
_FEEDBACK_SIGNALS = (
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
    "太花",
    "太暗",
    "太亮",
    "太啰嗦",
    "太简洁",
    "更像",
    "重来",
    "别再",
    "不要再",
    "别这样",
    "这样不好",
    "反馈",
    "不满意",
    "没用",
    "更清楚",
)

# Avoid "我想/我是/我在/我希望" — too common in ordinary requests.
_THOUGHT_SIGNALS = (
    "我觉得",
    "我认为",
    "个人觉得",
    "依我看",
    "对我来说",
    "我们组",
    "我们团队",
    "我的项目",
    "我这边",
)

# Project experience: need an anchor (project/client) + durable outcome, or a direct phrase.
_EXPERIENCE_DIRECT = (
    "项目经验",
    "客户要求",
    "甲方要求",
    "业主要求",
    "客户说",
    "甲方说",
    "业主说",
    "客户反馈",
    "甲方反馈",
    "业主反馈",
    "客户定了",
    "甲方定了",
    "业主定了",
)

_EXPERIENCE_ANCHORS = (
    "这个项目",
    "本项目",
    "该项目",
    "上次项目",
    "项目上",
    "项目里",
    "项目中",
    "甲方",
    "客户",
    "业主",
)

_EXPERIENCE_OUTCOMES = (
    "要求",
    "否了",
    "否定",
    "定稿",
    "定了",
    "拍板",
    "选用",
    "用了",
    "采用",
    "有效",
    "效果好",
    "效果不好",
    "踩坑",
    "踩过",
    "约束",
    "口径",
    "不要用",
    "别再用",
    "交付",
    "汇报",
    "评审",
    "通过了",
    "没过",
    "被拒",
    "被否",
)

_GENERIC_PROJECT_PREFIXES = frozenset({"这个", "本", "该", "上次", "当前", "我们", "其", "某", "一个", "新"})

_TYPE_WEIGHT = {
    "preference": 100,
    "experience": 95,
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


def _session_turn_lines(content: str) -> list[str]:
    return [ln.strip() for ln in (content or "").splitlines() if ln.strip().startswith("[")]


def _extract_user_snippet_from_turn(turn_line: str) -> str:
    match = re.search(r"用户:(.+?)(?:\s*\|\s*助手:|$)", turn_line)
    if match:
        return match.group(1).strip()[:100]
    return turn_line.strip()[:100]


def compact_session_summary_content(content: str) -> str:
    """Fold older turn snippets into short bullets; keep only recent raw turns."""
    lines = [ln.strip() for ln in (content or "").splitlines() if ln.strip()]
    if not lines:
        return ""

    bullets: list[str] = []
    turns: list[str] = []
    mode = "auto"
    for ln in lines:
        if ln in {"要点", "要点："} or ln.startswith("要点："):
            mode = "bullets"
            rest = ln[3:].lstrip("：: ").strip() if ln.startswith("要点") else ""
            if rest:
                bullets.append(rest[:100])
            continue
        if ln in {"近几轮", "近几轮："} or ln.startswith("近几轮："):
            mode = "turns"
            continue
        if ln.startswith("- "):
            bullets.append(ln[2:].strip()[:100])
            mode = "bullets"
            continue
        if ln.startswith("["):
            turns.append(ln)
            mode = "turns"
            continue
        if mode == "bullets":
            bullets.append(ln[:100])

    if len(turns) > SESSION_RECENT_TURNS:
        older, recent = turns[:-SESSION_RECENT_TURNS], turns[-SESSION_RECENT_TURNS:]
    else:
        older, recent = [], turns

    for turn in older:
        snippet = _extract_user_snippet_from_turn(turn)
        if not snippet:
            continue
        normalized = _normalize_for_dedupe(snippet)
        if any(_normalize_for_dedupe(item) == normalized for item in bullets):
            continue
        bullets.append(snippet)

    bullets = [item for item in bullets if item][-8:]
    parts: list[str] = []
    if bullets:
        parts.append("要点：\n" + "\n".join(f"- {item}" for item in bullets))
    if recent:
        parts.append("近几轮：\n" + "\n".join(recent))
    return "\n".join(parts)[-SESSION_SUMMARY_MAX_CHARS:]


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
    # Keep snippets short: session summary is a rolling digest, not a transcript archive.
    snippet = f"[{route}] 用户:{user_message.strip()[:120]} | 助手:{assistant_reply.strip()[:120]}"
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
    turn_count = len(_session_turn_lines(merged))
    if turn_count >= SESSION_COMPACT_TURN_THRESHOLD or len(merged) >= SESSION_COMPACT_CHAR_THRESHOLD:
        merged = compact_session_summary_content(merged)
    else:
        merged = merged[-SESSION_SUMMARY_MAX_CHARS:]
    existing.content = merged
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
    """Layered auto-recall: long-term first, session summary second.

    Legacy turn-level summary rows may still exist and are only used as a light fallback.
    """
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

    # Legacy turn-level summaries only as light fallback when durable memory is thin.
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


def extract_project_label(text: str) -> str | None:
    """Best-effort project name from free text (no schema project_code yet)."""
    raw = (text or "").strip()
    if not raw:
        return None
    quoted = re.search(r"[《「\"']([^《」\"']{1,30})[》」\"']", raw)
    if quoted:
        name = quoted.group(1).strip()
        if len(name) >= 2:
            return name[:30]
    named = re.search(r"([\u4e00-\u9fffA-Za-z0-9_-]{1,20})项目", raw)
    if named:
        name = named.group(1).strip()
        if name not in _GENERIC_PROJECT_PREFIXES and len(name) >= 2:
            return name[:30]
    return None


def looks_like_project_experience(text: str) -> bool:
    cleaned = (text or "").strip()
    if len(cleaned) < 8:
        return False
    if any(marker in cleaned for marker in _EXPERIENCE_DIRECT):
        return True
    has_anchor = any(marker in cleaned for marker in _EXPERIENCE_ANCHORS)
    has_named = bool(re.search(r"[\u4e00-\u9fffA-Za-z0-9_-]{2,20}项目", cleaned))
    has_outcome = any(marker in cleaned for marker in _EXPERIENCE_OUTCOMES)
    if (has_anchor or has_named) and has_outcome and len(cleaned) >= 10:
        return True
    return False


def classify_user_memory_signal(user_message: str) -> str | None:
    """Return durable memory type for preference / experience / feedback / thought, else None."""
    text = (user_message or "").strip()
    if len(text) < 4:
        return None
    if _GREETING_ONLY.match(text):
        return None

    # Project experience before generic preference so "这个项目默认…" lands as experience.
    if looks_like_project_experience(text):
        return "experience"

    lowered = text.lower()
    if any(marker in text for marker in _EXPLICIT_REMEMBER):
        return "preference"
    if any(marker in text or marker.lower() in lowered for marker in _PREFERENCE_SIGNALS):
        return "preference"
    if any(marker in text for marker in _THOUGHT_SIGNALS) and len(text) >= 8:
        return "thought"
    if any(marker in text for marker in _FEEDBACK_SIGNALS) and len(text) >= 8:
        return "feedback"
    return None


def distill_durable_memory_fact(user_message: str, memory_type: str) -> str | None:
    """Turn a raw user utterance into a short durable fact sentence."""
    text = (user_message or "").strip()
    if not text:
        return None

    for marker in ("请记住", "帮我记一下", "帮我记", "记一下", "别忘了", "记住"):
        idx = text.find(marker)
        if idx >= 0:
            rest = text[idx + len(marker) :].lstrip(" ：:，,。.；;")
            if rest:
                text = rest
            break

    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"(谢谢|感谢|拜托了?|好吗|可以吗|行吗)[\s!！?？。.~～]*$", "", text).strip()
    text = text.strip(" ，,；;。.")
    if len(text) < 4:
        return None

    if memory_type == "experience":
        label = extract_project_label(user_message)
        if label and f"【{label}】" not in text:
            # Keep label visible even when the body already mentions it mid-sentence.
            text = f"【{label}】{text}"

    if len(text) > DURABLE_FACT_MAX_CHARS:
        cut = text[:DURABLE_FACT_MAX_CHARS]
        for sep in ("。", "！", "？", "；", ".", "!", "?", ";", "，", ","):
            pos = cut.rfind(sep)
            if pos >= 40:
                cut = cut[:pos].rstrip(" ，,")
                break
        text = cut.strip()

    if len(text) < 4:
        return None
    return text[:DURABLE_FACT_MAX_CHARS]


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
    distilled = distill_durable_memory_fact(user_message, memory_type)
    if distilled is None:
        return None
    entry, status = store_memory_entry(
        db,
        user_id=user_id,
        content=distilled,
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
    """Update the single session summary only — no per-turn summary rows."""
    user_part = user_message.strip()
    reply_part = assistant_reply.strip()
    if not user_part and not reply_part:
        return None

    return upsert_conversation_session_summary(
        db,
        user_id=user_id,
        conversation_id=conversation_id,
        user_message=user_message,
        assistant_reply=assistant_reply,
        route=route,
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
    distilled = distill_durable_memory_fact(content, memory_type) or content.strip()[:DURABLE_FACT_MAX_CHARS]
    entry, status = store_memory_entry(
        db,
        user_id=user_id,
        content=distilled,
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


@dataclass(frozen=True)
class LegacyMemoryScrubStats:
    scanned: int = 0
    deleted_turn_summaries: int = 0
    deleted_noise_durable: int = 0
    distilled_durable: int = 0
    compacted_sessions: int = 0
    unchanged: int = 0


def _is_protected_fact(entry: AgentMemoryEntry) -> bool:
    ref = (entry.source_turn_ref or "").lower()
    content = (entry.content or "").strip()
    if ref.startswith("tool:") or ":hitl:" in ref or ref.endswith(":hitl") or "hitl" in ref:
        return True
    if content.startswith("用户已确认"):
        return True
    return False


def scrub_legacy_agent_memories(
    db: Session,
    *,
    dry_run: bool = True,
    user_id: int | None = None,
) -> LegacyMemoryScrubStats:
    """One-shot cleanup for memories written under the old raw-extract policy.

    - Delete per-turn ``summary`` rows (keep only ``session_summary``).
    - Drop durable preference/feedback/thought rows that fail the tightened classifier.
    - Distill remaining durable rows into short facts.
    - Compact oversized session summaries.
    """
    stmt = select(AgentMemoryEntry).order_by(AgentMemoryEntry.id.asc())
    if user_id is not None:
        stmt = stmt.where(AgentMemoryEntry.user_id == user_id)
    rows = list(db.scalars(stmt).all())

    deleted_turn = 0
    deleted_noise = 0
    distilled = 0
    compacted = 0
    unchanged = 0
    to_delete: list[AgentMemoryEntry] = []

    for entry in rows:
        if entry.memory_type == "summary":
            if _is_session_summary(entry):
                compacted_text = compact_session_summary_content(entry.content or "")
                if compacted_text and compacted_text != (entry.content or "").strip():
                    compacted += 1
                    if not dry_run:
                        entry.content = compacted_text
                        try:
                            from app.integrations.search.agent_memory_index import index_agent_memory_entry

                            index_agent_memory_entry(entry)
                        except Exception:
                            pass
                else:
                    unchanged += 1
                continue

            deleted_turn += 1
            to_delete.append(entry)
            continue

        if entry.memory_type in {"preference", "feedback", "thought", "experience"}:
            signal = classify_user_memory_signal(entry.content or "")
            if signal is None:
                deleted_noise += 1
                to_delete.append(entry)
                continue
            fact = distill_durable_memory_fact(entry.content or "", signal)
            if fact is None:
                deleted_noise += 1
                to_delete.append(entry)
                continue
            changed = fact != (entry.content or "").strip() or signal != entry.memory_type
            if changed:
                distilled += 1
                if not dry_run:
                    entry.memory_type = signal
                    entry.content = fact
                    try:
                        from app.integrations.search.agent_memory_index import index_agent_memory_entry

                        index_agent_memory_entry(entry)
                    except Exception:
                        pass
            else:
                unchanged += 1
            continue

        if entry.memory_type == "fact":
            if _is_protected_fact(entry):
                fact = distill_durable_memory_fact(entry.content or "", "fact")
                if fact and fact != (entry.content or "").strip() and len(entry.content or "") > DURABLE_FACT_MAX_CHARS:
                    distilled += 1
                    if not dry_run:
                        entry.content = fact
                        try:
                            from app.integrations.search.agent_memory_index import index_agent_memory_entry

                            index_agent_memory_entry(entry)
                        except Exception:
                            pass
                else:
                    unchanged += 1
                continue
            # Unscoped facts: keep only if they still look durable after distill.
            fact = distill_durable_memory_fact(entry.content or "", "fact")
            if fact is None or len(fact) < 4:
                deleted_noise += 1
                to_delete.append(entry)
                continue
            if fact != (entry.content or "").strip():
                distilled += 1
                if not dry_run:
                    entry.content = fact
                    try:
                        from app.integrations.search.agent_memory_index import index_agent_memory_entry

                        index_agent_memory_entry(entry)
                    except Exception:
                        pass
            else:
                unchanged += 1
            continue

        unchanged += 1

    if not dry_run:
        for entry in to_delete:
            memory_id = entry.id
            db.delete(entry)
            try:
                from app.integrations.search.agent_memory_index import delete_agent_memory_entry

                if memory_id is not None:
                    delete_agent_memory_entry(memory_id)
            except Exception:
                pass
        db.flush()

    return LegacyMemoryScrubStats(
        scanned=len(rows),
        deleted_turn_summaries=deleted_turn,
        deleted_noise_durable=deleted_noise,
        distilled_durable=distilled,
        compacted_sessions=compacted,
        unchanged=unchanged,
    )
