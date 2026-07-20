import json
import unittest

from app.integrations.studio_agent.agent import ChatAgentToolCall, StudioAgentReply
from app.models import ChatMessage
from app.services.chat_agent_service import (
    build_chat_agent_message,
    embed_agent_message_meta,
    format_agent_thinking_sse,
    format_agent_thinking_step_sse,
    parse_agent_message_meta,
    stream_chat_agent_sse,
)


class ChatAgentServiceTests(unittest.IsolatedAsyncioTestCase):
    def test_build_chat_agent_message_strips_agent_meta(self) -> None:
        recent = [
            ChatMessage(
                conversation_id=1,
                role="assistant",
                content=embed_agent_message_meta(
                    "我先帮你搜索共享模板。",
                    tool_calls=(ChatAgentToolCall(name="search_shared_templates", summary="找到 2 个共享模板"),),
                    policy_version="qmdh-chat-prod",
                ),
            ),
        ]
        message = build_chat_agent_message(recent, "继续推荐两个案例")
        self.assertIn("助手: 我先帮你搜索共享模板。", message)
        self.assertNotIn("qmdh-agent-meta", message)

    def test_embed_and_parse_agent_message_meta(self) -> None:
        stored = embed_agent_message_meta(
            "回复正文",
            tool_calls=(ChatAgentToolCall(name="search_inspiration_posts", summary="找到 3 条灵感"),),
            thinking_steps=(
                {"key": "agent_plan", "label": "分析需求", "detail": "已完成规划", "status": "done"},
            ),
            policy_version="qmdh-chat-prod",
        )
        parsed = parse_agent_message_meta(stored)
        self.assertEqual(parsed.visible_content, "回复正文")
        self.assertEqual(parsed.policy_version, "qmdh-chat-prod")
        self.assertEqual(parsed.tool_calls[0].name, "search_inspiration_posts")
        self.assertEqual(parsed.thinking_steps[0]["key"], "agent_plan")

    def test_format_agent_thinking_step_sse(self) -> None:
        payload = json.loads(
            format_agent_thinking_step_sse(
                {"key": "search_shared_templates", "label": "搜索共享模板", "detail": "正在调用…", "status": "running"}
            )[6:].strip()
        )
        self.assertEqual(payload["thinking_step"]["key"], "search_shared_templates")

    def test_build_chat_agent_message_includes_recent_turns(self) -> None:
        recent = [
            ChatMessage(conversation_id=1, role="user", content="找商业综合体模板"),
            ChatMessage(conversation_id=1, role="assistant", content="我先帮你搜索共享模板。"),
        ]
        message = build_chat_agent_message(recent, "再推荐两个玻璃幕墙案例", attachment_names=["ref.png"])
        self.assertIn("用户: 找商业综合体模板", message)
        self.assertIn("助手: 我先帮你搜索共享模板。", message)
        self.assertIn("用户: 再推荐两个玻璃幕墙案例", message)
        self.assertIn("[附件: ref.png]", message)

    def test_format_agent_thinking_sse(self) -> None:
        payload = json.loads(format_agent_thinking_sse()[6:].strip())
        self.assertEqual(payload["status"], "thinking")

    async def test_stream_chat_agent_sse_emits_policy_tool_calls_and_deltas(self) -> None:
        reply = StudioAgentReply(
            text="这里是助手回复。",
            provider_name="demo",
            model_name="demo-model",
            tool_calls=(ChatAgentToolCall(name="search_shared_templates", summary="找到 2 个共享模板"),),
            policy_version="qmdh-chat-prod",
        )
        chunks: list[str] = []
        async for chunk in stream_chat_agent_sse(reply):
            chunks.append(chunk)

        self.assertTrue(any("[DONE]" in chunk for chunk in chunks))
        payloads = [json.loads(chunk[6:].strip()) for chunk in chunks if chunk.startswith("data: ") and "[DONE]" not in chunk]
        self.assertEqual(payloads[0]["policy_version"], "qmdh-chat-prod")
        self.assertEqual(payloads[1]["tool_calls"][0]["name"], "search_shared_templates")
        self.assertIn("delta", payloads[-1])
        self.assertEqual("".join(item.get("delta", "") for item in payloads if "delta" in item), reply.text)
