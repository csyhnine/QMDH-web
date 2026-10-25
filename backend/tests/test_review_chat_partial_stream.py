"""R12 ordinary stream closure: real ORM/ledger/telemetry, no app startup or sockets."""
import ast
import asyncio
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import selectors
from tempfile import TemporaryDirectory
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import anyio
from anyio import CancelScope
from fastapi import HTTPException
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import AuthUserProfile
from app.models import AuditLog, ChatMessage, ChatTurnTelemetry, Conversation, ProviderPricingRule, ProviderProfile, UsageLedger, User
from app.services.billing import normalize_chat_usage
from app.services.chat_context import apply_message_input_tokens
from app.services.chat_telemetry_service import ChatTurnTracker, begin_chat_turn, resolve_outcome_from_error_code
from app.services.usage_ledger import record_chat_usage_ledger
from tests.test_review_partial_image_progress import BACKEND, load


class TimerOnlySelector(selectors.BaseSelector):
    """No descriptor I/O; only asyncio timers/tasks are permitted in this fixture."""
    def register(self, *args, **kwargs):
        raise AssertionError("R12 fixture must not register I/O")

    def unregister(self, *args, **kwargs):
        raise AssertionError("R12 fixture must not unregister I/O")

    def select(self, timeout=None):
        if timeout:
            time.sleep(min(timeout, 0.01))
        return []

    def get_map(self):
        return {}


class TimerOnlyLoop(asyncio.SelectorEventLoop):
    def __init__(self):
        super().__init__(selector=TimerOnlySelector())

    def _make_self_pipe(self):
        pass

    def _close_self_pipe(self):
        pass

    def _write_to_self(self):
        pass


def sse(**payload):
    return "data: " + json.dumps(payload, ensure_ascii=False) + "\n\n"


class ChatPartialStreamTests(unittest.TestCase):
    def setUp(self):
        root = Path(self.enterContext(TemporaryDirectory(prefix="r12-offline-")))
        self.engine = create_engine("sqlite:///" + str(root / "chat.db"))
        self.addCleanup(self.engine.dispose)
        event.listen(self.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        tables = set()

        def include(table):
            if table in tables:
                return
            tables.add(table)
            for key in table.foreign_keys:
                include(key.column.table)

        for model in (AuditLog, ChatMessage, ChatTurnTelemetry, UsageLedger, ProviderPricingRule):
            include(model.__table__)
        ChatMessage.metadata.create_all(self.engine, tables=list(tables))
        self.sessions = sessionmaker(self.engine)
        self.db = self.sessions()
        self.addCleanup(self.db.close)
        user = User(name="r12-user", role="user")
        provider = ProviderProfile(provider_name="r12-provider", model_name="r12-model", api_key="unused", base_url="https://fixture.invalid")
        self.db.add_all([user, provider])
        self.db.flush()
        conversation = Conversation(user_id=user.id, title="r12", model_provider_id=provider.id)
        self.db.add(conversation)
        self.db.flush()
        message = ChatMessage(conversation_id=conversation.id, role="user", content="question")
        self.db.add(message)
        self.db.add_all([ProviderPricingRule(provider_profile_id=provider.id, capability="chat.completions", metric=metric, unit_size=1, unit_price=price, currency="CNY") for metric, price in [("input_tokens", 1.0), ("output_tokens", 2.0)]])
        self.db.commit()
        turn = begin_chat_turn(self.db, conversation_id=conversation.id, user_id=user.id, user_message_id=message.id, provider_name=provider.provider_name, model_name=provider.model_name, content_length=8, attachments=[], correlation_id="r12-offline")
        self.turn_id = turn.id
        self.finalizations = []
        owner = self

        class Tracker(ChatTurnTracker):
            def finalize(self, db, **kwargs):
                owner.finalizations.append(kwargs)
                return super().finalize(db, **kwargs)

        self.actions = []
        self.stream_calls = 0
        self.pack_error = None
        self.ready = None
        self.persist_deadlines = []
        self.memory = Mock()

        async def pack(*args, **kwargs):
            if self.pack_error:
                raise self.pack_error
            return SimpleNamespace(api_messages=[{"role": "user", "content": "question"}], context_payload=lambda: {"tokens": 12, "usage_percent": 1})

        async def stream(*args):
            self.stream_calls += 1
            for action in self.actions:
                if action == "block":
                    self.ready.set()
                    await asyncio.Event().wait()
                elif isinstance(action, BaseException):
                    raise action
                else:
                    yield action

        self.ns = {
            "__name__": __name__, "asyncio": asyncio, "CancelScope": CancelScope, "json": json,
            "datetime": datetime, "timezone": timezone, "logging": logging, "logger": logging.getLogger(__name__),
            "Session": Session, "ChatMessage": ChatMessage, "Conversation": Conversation, "ProviderProfile": ProviderProfile,
            "AuthUserProfile": AuthUserProfile, "ChatTurnTracker": ChatTurnTracker, "HTTPException": HTTPException,
            "apply_message_input_tokens": apply_message_input_tokens, "record_chat_usage_ledger": record_chat_usage_ledger,
            "record_chat_turn_memory": self.memory, "normalize_chat_usage": normalize_chat_usage,
            "resolve_outcome_from_error_code": resolve_outcome_from_error_code,
            "db": self.db, "conversation_id": conversation.id, "provider_profile_id": provider.id,
            "provider_name": provider.provider_name, "provider_model_name": provider.model_name,
            "auth_user": AuthUserProfile(name=user.name, role="user", token="unused", user_id=user.id),
            "content": "question", "all_messages": [message], "provider_config": object(),
            "turn_tracker": Tracker(turn_id=turn.id), "telemetry_finalized": {"done": False},
            "get_correlation_id": lambda: "r12-offline", "build_compacted_memory_context": lambda *a, **kw: SimpleNamespace(context=""),
            "pack_chat_context": pack, "stream_chat_completion": stream,
        }
        load("app/services/chat_service.py", self.ns, functions=["chat_error_payload", "format_chat_error_message", "_sanitize_error_text"])
        load("app/routers/chat.py", self.ns, functions=["_persist_chat_assistant_reply", "_finish_chat_turn_telemetry", "_chat_status_sse", "_chat_error_sse"])
        original_persist = self.ns["_persist_chat_assistant_reply"]

        def observe_persist(*args, **kwargs):
            self.persist_deadlines.append(anyio.current_effective_deadline())
            return original_persist(*args, **kwargs)

        self.ns["_persist_chat_assistant_reply"] = observe_persist
        source = BACKEND / "app/routers/chat.py"
        tree = ast.parse(source.read_text(encoding="utf-8"))
        route = next(node for node in tree.body if isinstance(node, ast.AsyncFunctionDef) and node.name == "send_message")
        start = next(i for i, node in enumerate(route.body) if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == "full_content_parts")
        end = next(i for i, node in enumerate(route.body) if isinstance(node, ast.AsyncFunctionDef) and node.name == "generate")
        factory = ast.parse("def make_generator():\n    packed_context_tokens = 0\n    packed_context_usage_percent = 0\n").body[0]
        factory.body += route.body[start:end + 1] + ast.parse("return generate()").body
        exec(compile(ast.fix_missing_locations(ast.Module(body=[factory], type_ignores=[])), str(source), "exec"), self.ns)

    def run_async(self, coro):
        with asyncio.Runner(loop_factory=TimerOnlyLoop) as runner:
            return runner.run(coro)

    async def drain(self, generator):
        return [chunk async for chunk in generator]

    def usage(self):
        return sse(usage={"prompt_tokens": 7, "completion_tokens": 3, "total_tokens": 10})

    def snapshot(self):
        # A fresh session models history reload, rather than trusting the writer's identity map.
        with self.sessions() as db:
            return list(db.scalars(select(ChatMessage).where(ChatMessage.role == "assistant"))), list(db.scalars(select(UsageLedger))), db.get(ChatTurnTelemetry, self.turn_id)

    def assert_terminal(self, *, partial=True, code="chat_stream_error", outcome="stream_error", known_usage=True):
        messages, ledgers, turn = self.snapshot()
        self.assertEqual(len(messages), 1)
        text = messages[0].content
        if partial:
            self.assertTrue(text.startswith("已收到的文字\n\n"), text)
        self.assertIn("错误码：" + code, text)
        self.assertNotIn("raw-private-detail", text)
        self.assertEqual((turn.outcome, turn.error_code, turn.assistant_message_id), (outcome, code, messages[0].id))
        self.assertEqual(len(self.finalizations), 1)
        self.assertEqual(len(self.persist_deadlines), 1)
        receipts = list(self.db.scalars(select(AuditLog).where(AuditLog.event_type == "chat.reply.call")))
        self.assertEqual(len(receipts), 1)
        self.assertEqual(receipts[0].details["usage_known"], known_usage)
        self.assertEqual(receipts[0].details["message_id"], messages[0].id)
        self.assertEqual(len(ledgers), 1 if known_usage else 0)
        if known_usage:
            self.assertEqual((ledgers[0].prompt_tokens, ledgers[0].completion_tokens, ledgers[0].total_tokens), (7, 3, 10))
            self.assertEqual(ledgers[0].cost, 13)
            self.assertEqual((ledgers[0].source_table, ledgers[0].source_id), ("chat_reply_calls", receipts[0].id))
        self.memory.assert_not_called()
        self.assertEqual(self.stream_calls, 1)

    def test_partial_then_exception_preserves_history_usage_and_failed_terminal(self):
        self.actions = [sse(delta="已收到的文字"), self.usage(), RuntimeError("raw-private-detail")]
        chunks = self.run_async(self.drain(self.ns["make_generator"]()))
        self.assert_terminal()
        self.assertTrue(any('"error"' in chunk for chunk in chunks))
        self.assertNotIn("raw-private-detail", "".join(chunks))

    def test_task_cancellation_preserves_partial_once_and_propagates_cancel(self):
        async def scenario():
            self.ready = asyncio.Event()
            worker = asyncio.create_task(self.drain(self.ns["make_generator"]()))
            await self.ready.wait()
            worker.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await worker
        self.actions = [sse(delta="已收到的文字"), self.usage(), "block"]
        self.run_async(scenario())
        self.assert_terminal(code="chat_stream_interrupted", outcome="interrupted")

    def test_active_anyio_cancel_scope_shields_persistence_and_finalizes_once(self):
        async def scenario():
            self.ready = asyncio.Event()
            with CancelScope() as scope:
                async def cancel_after_delta():
                    await self.ready.wait()
                    scope.cancel()
                canceller = asyncio.create_task(cancel_after_delta())
                try:
                    await self.drain(self.ns["make_generator"]())
                finally:
                    self.assertTrue(scope.cancel_called)
            await canceller
            self.assertTrue(scope.cancelled_caught)
        self.actions = [sse(delta="已收到的文字"), self.usage(), "block"]
        self.run_async(scenario())
        self.assert_terminal(code="chat_stream_interrupted", outcome="interrupted")
        self.assertEqual(self.persist_deadlines, [float("inf")])

    def test_partial_timeout_event_takes_precedence_over_text_and_does_not_record_memory(self):
        self.actions = [sse(delta="已收到的文字"), self.usage(), sse(error={"code": "chat_upstream_timeout", "summary": "对话失败：上游超时。", "detail": "raw-private-detail"}), "data: [DONE]\n\n"]
        self.run_async(self.drain(self.ns["make_generator"]()))
        self.assert_terminal(code="chat_upstream_timeout", outcome="upstream_error")

    def test_zero_delta_error_preserves_error_classification_without_inventing_usage(self):
        self.actions = [sse(error={"code": "chat_upstream_error", "summary": "对话失败：上游失败。", "detail": "raw-private-detail"})]
        self.run_async(self.drain(self.ns["make_generator"]()))
        self.assert_terminal(partial=False, code="chat_upstream_error", outcome="upstream_error", known_usage=False)

    def test_normal_completion_and_finally_keep_one_success_message_ledger_and_memory(self):
        self.actions = [sse(delta="完整"), sse(delta="回复"), self.usage(), "data: [DONE]\n\n"]
        generator = self.ns["make_generator"]()
        async def scenario():
            await self.drain(generator)
            await generator.aclose()
        self.run_async(scenario())
        messages, ledgers, turn = self.snapshot()
        self.assertEqual([m.content for m in messages], ["完整回复"])
        self.assertEqual((turn.outcome, turn.error_code, turn.assistant_message_id), ("success", "", messages[0].id))
        self.assertEqual(len(self.finalizations), 1)
        self.assertEqual(len(self.persist_deadlines), 1)
        self.assertEqual(len(ledgers), 1)
        self.assertEqual(ledgers[0].total_tokens, 10)
        self.assertEqual(ledgers[0].cost, 13)
        self.memory.assert_called_once()

    def test_empty_normal_end_is_interrupted_without_success_or_memory(self):
        self.actions = ["data: [DONE]\n\n"]
        self.run_async(self.drain(self.ns["make_generator"]()))
        self.assert_terminal(partial=False, code="chat_stream_interrupted", outcome="interrupted", known_usage=False)

    def test_generator_aclose_after_delta_saves_partial_and_does_not_yield_during_cleanup(self):
        self.actions = [self.usage(), sse(delta="已收到的文字"), "block"]
        async def scenario():
            generator = self.ns["make_generator"]()
            async for chunk in generator:
                if '"delta"' in chunk:
                    break
            await generator.aclose()
            await generator.aclose()
        self.run_async(scenario())
        self.assert_terminal(code="chat_stream_interrupted", outcome="interrupted")

    def test_attachment_failure_keeps_existing_classification_and_sanitized_history(self):
        self.pack_error = HTTPException(422, "raw-private-detail")
        self.run_async(self.drain(self.ns["make_generator"]()))
        messages, ledgers, turn = self.snapshot()
        self.assertEqual((len(messages), len(ledgers), len(self.finalizations), len(self.persist_deadlines)), (1, 1, 1, 1))
        self.assertEqual((turn.outcome, turn.error_code), ("attachment_error", "chat_attachment_error"))
        self.assertNotIn("raw-private-detail", messages[0].content)
        self.assertEqual(self.stream_calls, 0)
        self.memory.assert_not_called()

    def test_ledger_error_after_message_commit_does_not_retry_or_duplicate_assistant(self):
        self.actions = [sse(delta="已收到的文字"), self.usage(), RuntimeError("stream failed")]
        from app.services import chat_reply_completion_service as completion
        self.enterContext(patch.object(completion, "record_chat_usage_ledger", side_effect=RuntimeError("synthetic ledger failure")))
        self.run_async(self.drain(self.ns["make_generator"]()))
        messages, ledgers, turn = self.snapshot()
        self.assertEqual(len(messages), 1)
        self.assertTrue(messages[0].content.startswith("已收到的文字\n\n"))
        self.assertEqual(ledgers, [])
        self.assertEqual(len(self.persist_deadlines), 1)
        self.assertEqual(len(self.finalizations), 1)
        self.assertEqual(turn.outcome, "stream_error")
        self.memory.assert_not_called()
