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
    compact_session_summary_content,
    distill_durable_memory_fact,
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
    # Broad revision chatter should not become durable memory.
    assert classify_user_memory_signal("改成红色") is None
    assert classify_user_memory_signal("太棒了") is None
    assert classify_user_memory_signal("我想生成一张图") is None


def test_classify_and_distill_project_experience() -> None:
    assert (
        classify_user_memory_signal("滨江项目甲方要求外立面偏暖色，玻璃幕墙先别上")
        == "experience"
    )
    assert classify_user_memory_signal("这个项目定稿用横版 16:9 汇报") == "experience"
    assert classify_user_memory_signal("客户要求夜景少用冷蓝光") == "experience"
    assert classify_user_memory_signal("帮我写一句口号") is None
    fact = distill_durable_memory_fact("滨江项目甲方要求外立面偏暖色，玻璃幕墙先别上", "experience")
    assert fact is not None
    assert fact.startswith("【滨江】")
    assert "暖色" in fact
    assert len(fact) <= 160


def test_distill_strips_remember_prefix_and_politeness() -> None:
    fact = distill_durable_memory_fact("请记住以后默认用 16:9，谢谢", "preference")
    assert fact is not None
    assert "记住" not in fact
    assert "谢谢" not in fact
    assert "16:9" in fact
    assert len(fact) <= 160


def test_compact_session_summary_folds_older_turns() -> None:
    raw = "\n".join(
        [
            "[chat] 用户:第一轮需求很长很长 | 助手:回复一",
            "[chat] 用户:第二轮继续 | 助手:回复二",
            "[chat] 用户:第三轮继续 | 助手:回复三",
            "[chat] 用户:第四轮继续 | 助手:回复四",
            "[chat] 用户:第五轮继续 | 助手:回复五",
        ]
    )
    compacted = compact_session_summary_content(raw)
    assert "要点：" in compacted
    assert "近几轮：" in compacted
    assert "第一轮需求很长很长" in compacted
    assert compacted.count("[chat]") <= 3


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

    def test_record_chat_route_writes_session_summary_and_distilled_signal(self) -> None:
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
            summaries = [row for row in rows if row.memory_type == "summary"]
            self.assertEqual(len(summaries), 1)
            self.assertTrue(summaries[0].source_turn_ref.endswith(":session_summary"))
            prefs = [row for row in rows if row.memory_type == "preference"]
            self.assertEqual(len(prefs), 1)
            self.assertLessEqual(len(prefs[0].content), 160)
            self.assertIn("16:9", prefs[0].content)

    def test_ordinary_turn_does_not_create_per_turn_summary_or_durable(self) -> None:
        with self.SessionLocal() as db:
            record_chat_turn_memory(
                db,
                user_id=7,
                conversation_id=22,
                user_message="帮我写一句口号",
                assistant_reply="可以试试更简洁的品牌语。",
                route="chat",
            )
            db.commit()
            rows = list(db.scalars(select(AgentMemoryEntry).where(AgentMemoryEntry.user_id == 7)).all())
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].memory_type, "summary")
            self.assertTrue(rows[0].source_turn_ref.endswith(":session_summary"))

    def test_session_summary_compacts_after_many_turns(self) -> None:
        with self.SessionLocal() as db:
            for index in range(6):
                record_chat_turn_memory(
                    db,
                    user_id=7,
                    conversation_id=30,
                    user_message=f"第{index}轮普通请求内容",
                    assistant_reply=f"第{index}轮助手回复",
                    route="chat",
                )
            db.commit()
            rows = list(db.scalars(select(AgentMemoryEntry).where(AgentMemoryEntry.user_id == 7)).all())
            self.assertEqual(len(rows), 1)
            content = rows[0].content
            self.assertIn("要点：", content)
            self.assertIn("近几轮：", content)

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
            self.assertTrue(ctx.session_summary_used)

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

    def test_record_writes_project_experience(self) -> None:
        with self.SessionLocal() as db:
            record_chat_turn_memory(
                db,
                user_id=7,
                conversation_id=41,
                user_message="滨江项目甲方要求外立面偏暖色，玻璃幕墙方案被否了",
                assistant_reply="已记下该项目约束。",
                route="chat",
            )
            db.commit()
            rows = list(db.scalars(select(AgentMemoryEntry).where(AgentMemoryEntry.user_id == 7)).all())
            experiences = [row for row in rows if row.memory_type == "experience"]
            self.assertEqual(len(experiences), 1)
            self.assertTrue(experiences[0].content.startswith("【滨江】"))
            self.assertIn("暖色", experiences[0].content)

    def test_scrub_legacy_deletes_turn_summaries_and_noise(self) -> None:
        from app.services.agent_memory_service import add_memory_entry, scrub_legacy_agent_memories

        with self.SessionLocal() as db:
            add_memory_entry(
                db,
                user_id=7,
                conversation_id=1,
                memory_type="summary",
                content="用户：帮我写口号；助手：好的",
                source_turn_ref="conv:1:chat",
            )
            add_memory_entry(
                db,
                user_id=7,
                conversation_id=1,
                memory_type="summary",
                content="[chat] 用户:保留会话 | 助手:ok",
                source_turn_ref="conv:1:session_summary",
            )
            add_memory_entry(
                db,
                user_id=7,
                memory_type="feedback",
                content="改成红色",
                source_turn_ref="conv:1:feedback",
            )
            add_memory_entry(
                db,
                user_id=7,
                memory_type="preference",
                content="请记住以后默认用 16:9，谢谢",
                source_turn_ref="conv:1:preference",
            )
            db.commit()

            dry = scrub_legacy_agent_memories(db, dry_run=True, user_id=7)
            self.assertEqual(dry.deleted_turn_summaries, 1)
            self.assertEqual(dry.deleted_noise_durable, 1)
            self.assertEqual(dry.distilled_durable, 1)
            self.assertEqual(len(list(db.scalars(select(AgentMemoryEntry).where(AgentMemoryEntry.user_id == 7)))), 4)

            applied = scrub_legacy_agent_memories(db, dry_run=False, user_id=7)
            db.commit()
            self.assertEqual(applied.deleted_turn_summaries, 1)
            rows = list(db.scalars(select(AgentMemoryEntry).where(AgentMemoryEntry.user_id == 7)).all())
            self.assertEqual(len(rows), 2)
            prefs = [row for row in rows if row.memory_type == "preference"]
            self.assertEqual(len(prefs), 1)
            self.assertNotIn("记住", prefs[0].content)
            self.assertIn("16:9", prefs[0].content)


if __name__ == "__main__":
    unittest.main()
