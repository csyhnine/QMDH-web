"""Tests for durable agent memory library helpers."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AgentMemoryEntry, User
from app.services.agent_memory_service import (
    PREFERENCE_MARKERS,
    CompactedMemoryContext,
    build_compacted_memory_context,
    classify_user_memory_signal,
    record_chat_turn_memory,
    store_memory_entry,
    tool_memory_forget,
    tool_memory_recall,
    tool_memory_store,
)


def test_preference_markers_cover_common_phrases() -> None:
    assert "记住" in PREFERENCE_MARKERS
    assert "偏好" in PREFERENCE_MARKERS


def test_compacted_memory_context_dataclass() -> None:
    bundle = CompactedMemoryContext(context="相关长期记忆", hit_count=2, session_summary_used=True)
    assert bundle.hit_count == 2
    assert bundle.session_summary_used is True


def test_classify_feedback_preference_thought_without_explicit_remember() -> None:
    assert classify_user_memory_signal("我喜欢横版构图，对比再强一点") == "preference"
    assert classify_user_memory_signal("这版太花了，换成更干净的排版") == "feedback"
    assert classify_user_memory_signal("我觉得我们组更适合冷色调海报") == "thought"
    assert classify_user_memory_signal("你好") is None
    assert classify_user_memory_signal("今天天气怎么样") is None


class MemoryLibraryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
        with self.SessionLocal() as db:
            db.add(User(id=7, name="designer.a", display_name="A", role="designer", password_hash="x"))
            db.add(User(id=8, name="designer.b", display_name="B", role="designer", password_hash="x"))
            db.commit()

    def tearDown(self) -> None:
        self.engine.dispose()

    def test_record_chat_route_writes_summary_and_signal(self) -> None:
        with self.SessionLocal() as db:
            record_chat_turn_memory(
                db,
                user_id=7,
                conversation_id=21,
                user_message="我习惯用 16:9，下次请默认这个比例",
                assistant_reply="好的，后续默认按 16:9。",
                route="chat",
            )
            db.commit()
            rows = list(db.scalars(select(AgentMemoryEntry).where(AgentMemoryEntry.user_id == 7)).all())
            types = {row.memory_type for row in rows}
            self.assertIn("summary", types)
            self.assertIn("preference", types)

    def test_store_dedupe_and_user_isolation(self) -> None:
        with self.SessionLocal() as db:
            first, status1 = store_memory_entry(db, user_id=7, content="喜欢冷色调海报", memory_type="preference")
            second, status2 = store_memory_entry(db, user_id=7, content="喜欢冷色调海报", memory_type="preference")
            other, _ = store_memory_entry(db, user_id=8, content="喜欢暖色调海报", memory_type="preference")
            db.commit()
            self.assertEqual(status1, "stored")
            self.assertEqual(status2, "duplicate")
            self.assertEqual(first.id, second.id)
            recalled = tool_memory_recall(db, user_id=7, query="冷色调", limit=5)
            ids = {item["id"] for item in recalled["memories"]}
            self.assertIn(first.id, ids)
            self.assertNotIn(other.id, ids)

    def test_layered_recall_prefers_long_term(self) -> None:
        with self.SessionLocal() as db:
            store_memory_entry(db, user_id=7, content="默认使用 16:9", memory_type="preference")
            record_chat_turn_memory(
                db,
                user_id=7,
                conversation_id=9,
                user_message="帮我写一句口号",
                assistant_reply="可以试试更简洁的品牌语。",
                route="chat",
            )
            db.commit()
            ctx = build_compacted_memory_context(db, user_id=7, conversation_id=9, query="比例")
            self.assertIn("长期记忆", ctx.context)
            self.assertIn("16:9", ctx.context)

    def test_memory_tools_forget_only_own(self) -> None:
        with self.SessionLocal() as db:
            entry, _ = store_memory_entry(db, user_id=7, content="事实一条", memory_type="fact")
            db.commit()
            denied = tool_memory_forget(db, user_id=8, memory_id=entry.id)
            self.assertFalse(denied["ok"])
            ok = tool_memory_forget(db, user_id=7, memory_id=entry.id)
            self.assertTrue(ok["ok"])
            remaining = db.get(AgentMemoryEntry, entry.id)
            self.assertIsNone(remaining)

    def test_tool_memory_store(self) -> None:
        with self.SessionLocal() as db:
            result = tool_memory_store(db, user_id=7, content="客户偏好竖版", memory_type="preference")
            self.assertTrue(result["ok"])
            self.assertEqual(result["status"], "stored")


if __name__ == "__main__":
    unittest.main()
