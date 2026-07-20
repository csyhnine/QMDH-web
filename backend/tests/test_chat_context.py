import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.database import Base
from app.models import ChatMessage, Conversation, User
from app.services.chat_context import (
    estimate_message_tokens,
    estimate_text_tokens,
    pack_chat_context,
    resolve_context_window,
)
from app.services.chat_service import ChatProviderConfig


class ChatContextUnitTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
        self.db = self.SessionLocal()
        user = User(name="designer", display_name="Designer", role="designer", is_active=True)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        self.user_id = user.id
        self.provider = ChatProviderConfig(
            api_key="plain-key",
            base_url="https://example.test/v1",
            model_name="test-local-chat",
            display_name="Local",
            timeout_seconds=30.0,
        )

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _conversation(self) -> Conversation:
        conversation = Conversation(user_id=self.user_id, title="测试会话")
        self.db.add(conversation)
        self.db.commit()
        self.db.refresh(conversation)
        return conversation

    def _add_message(self, conversation_id: int, role: str, content: str) -> ChatMessage:
        message = ChatMessage(conversation_id=conversation_id, role=role, content=content)
        self.db.add(message)
        self.db.commit()
        self.db.refresh(message)
        return message

    def test_estimate_text_tokens_cjk_and_latin(self) -> None:
        self.assertGreater(estimate_text_tokens("你好世界"), 0)
        self.assertGreater(estimate_text_tokens("hello world"), 0)
        self.assertGreaterEqual(estimate_text_tokens("中文ABC"), 2)

    def test_estimate_message_tokens_counts_images(self) -> None:
        message = ChatMessage(
            conversation_id=1,
            role="user",
            content="看图",
            attachments_json=[{"kind": "image", "storage_path": "a.png", "file_name": "a.png"}],
        )
        self.assertGreaterEqual(estimate_message_tokens(message), settings.chat_image_token_estimate)

    def test_resolve_context_window_defaults(self) -> None:
        self.assertEqual(resolve_context_window(self.provider), settings.chat_default_context_window_tokens)
        hinted = ChatProviderConfig(
            api_key="k",
            base_url="https://example.test/v1",
            model_name="gpt-4o-mini",
            display_name="GPT",
        )
        self.assertEqual(resolve_context_window(hinted), 128_000)

    async def test_short_conversation_skips_summary(self) -> None:
        conversation = self._conversation()
        self._add_message(conversation.id, "user", "你好")
        self._add_message(conversation.id, "assistant", "你好，有什么可以帮你？")
        self._add_message(conversation.id, "user", "继续")
        messages = self.db.query(ChatMessage).order_by(ChatMessage.id.asc()).all()

        with patch("app.services.chat_context.summarize_chat_history", new_callable=AsyncMock) as summarize:
            packed = await pack_chat_context(
                self.db,
                conversation,
                messages,
                self.provider,
                allow_summarize=True,
            )
            summarize.assert_not_called()

        self.assertFalse(packed.summarized)
        self.assertFalse(packed.used_summary)
        self.assertEqual(len(packed.api_messages), 3)
        self.assertEqual((conversation.context_summary or "").strip(), "")

    async def test_over_window_summarizes_and_persists(self) -> None:
        conversation = self._conversation()
        for index in range(12):
            self._add_message(conversation.id, "user", f"用户轮次 {index} " + ("需求细节" * 40))
            self._add_message(conversation.id, "assistant", f"助手轮次 {index} " + ("回复内容" * 40))
        messages = self.db.query(ChatMessage).order_by(ChatMessage.id.asc()).all()

        with (
            patch.object(settings, "chat_default_context_window_tokens", 1_800),
            patch.object(settings, "chat_completion_reserve_tokens", 300),
            patch.object(settings, "chat_summary_budget_tokens", 350),
            patch.object(settings, "chat_min_recent_messages", 2),
            patch.object(settings, "chat_summary_trigger_ratio", 0.55),
            patch(
                "app.services.chat_context.summarize_chat_history",
                new_callable=AsyncMock,
                return_value="用户讨论了建筑效果图与风格偏好。",
            ) as summarize,
        ):
            packed = await pack_chat_context(
                self.db,
                conversation,
                messages,
                self.provider,
                allow_summarize=True,
            )
            summarize.assert_called_once()

        self.db.refresh(conversation)
        self.assertTrue(packed.summarized)
        self.assertTrue(packed.used_summary)
        self.assertTrue(conversation.context_summary.startswith("用户讨论了"))
        self.assertIsNotNone(conversation.context_summary_until_message_id)
        self.assertEqual(packed.api_messages[0]["role"], "system")
        self.assertIn("压缩摘要", str(packed.api_messages[0]["content"]))

    async def test_incremental_summary_only_compresses_uncovered(self) -> None:
        conversation = self._conversation()
        early = []
        for index in range(6):
            early.append(self._add_message(conversation.id, "user", f"早期 {index} " + ("内容" * 30)))
            early.append(self._add_message(conversation.id, "assistant", f"早期答 {index} " + ("内容" * 30)))
        conversation.context_summary = "已有早期摘要"
        conversation.context_summary_until_message_id = early[-1].id
        conversation.context_summary_updated_at = datetime.now(timezone.utc)
        self.db.commit()

        for index in range(10):
            self._add_message(conversation.id, "user", f"新增 {index} " + ("细节" * 50))
            self._add_message(conversation.id, "assistant", f"新增答 {index} " + ("细节" * 50))
        messages = self.db.query(ChatMessage).order_by(ChatMessage.id.asc()).all()

        with (
            patch.object(settings, "chat_default_context_window_tokens", 1_600),
            patch.object(settings, "chat_completion_reserve_tokens", 250),
            patch.object(settings, "chat_summary_budget_tokens", 300),
            patch.object(settings, "chat_min_recent_messages", 2),
            patch.object(settings, "chat_summary_trigger_ratio", 0.5),
            patch(
                "app.services.chat_context.summarize_chat_history",
                new_callable=AsyncMock,
                return_value="合并后的摘要",
            ) as summarize,
        ):
            await pack_chat_context(
                self.db,
                conversation,
                messages,
                self.provider,
                allow_summarize=True,
            )
            summarize.assert_called_once()
            compressed = summarize.await_args.kwargs["messages_to_compress"]
            self.assertTrue(all(message.id > early[-1].id for message in compressed))
            self.assertEqual(summarize.await_args.kwargs["existing_summary"], "已有早期摘要")
            self.assertGreater(len(compressed), 0)

        self.db.refresh(conversation)
        self.assertEqual(conversation.context_summary, "合并后的摘要")

    async def test_summary_failure_falls_back_to_trim(self) -> None:
        conversation = self._conversation()
        for index in range(10):
            self._add_message(conversation.id, "user", f"用户 {index} " + ("长文本" * 50))
            self._add_message(conversation.id, "assistant", f"助手 {index} " + ("长文本" * 50))
        messages = self.db.query(ChatMessage).order_by(ChatMessage.id.asc()).all()

        with (
            patch.object(settings, "chat_default_context_window_tokens", 1_600),
            patch.object(settings, "chat_completion_reserve_tokens", 250),
            patch.object(settings, "chat_summary_budget_tokens", 300),
            patch.object(settings, "chat_min_recent_messages", 2),
            patch.object(settings, "chat_summary_trigger_ratio", 0.5),
            patch(
                "app.services.chat_context.summarize_chat_history",
                new_callable=AsyncMock,
                side_effect=RuntimeError("upstream down"),
            ),
        ):
            packed = await pack_chat_context(
                self.db,
                conversation,
                messages,
                self.provider,
                allow_summarize=True,
            )

        self.db.refresh(conversation)
        self.assertFalse(packed.summarized)
        self.assertEqual((conversation.context_summary or "").strip(), "")
        self.assertGreaterEqual(len(packed.api_messages), 1)
        self.assertLess(len(packed.api_messages), len(messages))


if __name__ == "__main__":
    unittest.main()
