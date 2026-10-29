"""R86a: actual harness/Agent stream AST, real temporary SQLite constraints.

No SDK/provider, startup, business database, search or tool execution. Memory
writer substitutes insert into the actual memory table; the transaction is real.
"""
import ast
import asyncio
from dataclasses import dataclass, field
import json
from pathlib import Path
import selectors
from tempfile import TemporaryDirectory
import time
from types import ModuleType, SimpleNamespace
from typing import Callable
import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

import sqlalchemy as sa
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session, sessionmaker

from app.models import AgentMemoryEntry, ChatMessage, Conversation, User

BACKEND = Path(__file__).resolve().parents[1]


class TimerOnlySelector(selectors.BaseSelector):
    """R12 fixture pattern: no descriptor or socket I/O in the event loop."""
    def register(self, *args, **kwargs):
        raise AssertionError("R86 fixture must not register I/O")

    def unregister(self, *args, **kwargs):
        raise AssertionError("R86 fixture must not unregister I/O")

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


def definitions(relative, names, namespace):
    path = BACKEND / relative
    source = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    selected = [n for n in source.body if isinstance(n, (ast.ClassDef, ast.FunctionDef)) and n.name in names]
    assert {n.name for n in selected} == set(names)
    future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
    tree = ast.fix_missing_locations(ast.Module(body=[future, *selected], type_ignores=[]))
    exec(compile(tree, str(path), "exec"), namespace)


class AgentMemoryCompletionTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory(prefix="r86a-offline-")))
        self.engine = sa.create_engine("sqlite:///" + (self.root / "completion.db").as_posix(), connect_args={"timeout": 0.1})
        self.addCleanup(self.engine.dispose)
        sa.event.listen(self.engine, "connect", lambda c, _: c.execute("PRAGMA foreign_keys=ON"))
        tables = set()
        def include(table):
            if table in tables:
                return
            tables.add(table)
            for key in table.foreign_keys:
                include(key.column.table)
        for model in (AgentMemoryEntry, ChatMessage):
            include(model.__table__)
        AgentMemoryEntry.metadata.create_all(self.engine, tables=list(tables))
        guard_meta = sa.MetaData()
        self.guard = sa.Table("r86_guard", guard_meta, sa.Column("id", sa.Integer, primary_key=True))
        guard_meta.create_all(self.engine)
        with self.engine.begin() as c:
            c.execute(self.guard.insert().values(id=1))
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)
        self.db = self.sessions()
        self.addCleanup(self.db.close)
        self.user = User(name="r86-synthetic", role="designer", project_codes=[])
        self.db.add(self.user)
        self.db.flush()
        self.conv = Conversation(user_id=self.user.id, title="synthetic")
        self.db.add(self.conv)
        self.db.commit()
        self.conv_id, self.user_id = self.conv.id, self.user.id
        self.module = ModuleType("r86a_actual_harness")
        self.enterContext(patch.dict("sys.modules", {self.module.__name__: self.module}))
        namespace = self.module.__dict__
        namespace.update(dataclass=dataclass, field=field, Callable=Callable, Session=Session,
                         select=sa.select, Connection=Connection, uuid4=uuid4,
                         ChatMessage=ChatMessage, Conversation=Conversation)
        reply_namespace = {"__name__": self.module.__name__, "dataclass": dataclass}
        definitions("app/integrations/studio_agent/agent.py",
                    {"StudioAgentReply", "ChatAgentToolCall", "ChatAgentThinkingStep"}, reply_namespace)
        namespace.update({k: reply_namespace[k] for k in ("StudioAgentReply", "ChatAgentThinkingStep")})
        self.reply = reply_namespace["StudioAgentReply"](
            text="synthetic completed reply", provider_name="offline", model_name="synthetic-model",
            prompt_tokens=90, completion_tokens=30, total_tokens=120, cached_input_tokens=15,
            usage_payload={"source": "synthetic", "prompt_tokens": 90, "completion_tokens": 30,
                           "total_tokens": 120, "cached_input_tokens": 15},
            tool_calls=(reply_namespace["ChatAgentToolCall"]("accepted_fixture", "synthetic"),),
            task_proposals=({"proposal_id": "synthetic-accepted"},))
        namespace["resolve_effective_chat_policy"] = Mock(return_value=SimpleNamespace(policy_version="fixture", chat_tool_allowlist=()))
        namespace["build_compacted_memory_context"] = Mock(return_value=SimpleNamespace(context="", hit_count=0, session_summary_used=False))
        namespace["build_chat_agent_message"] = Mock(return_value="synthetic prompt")
        self.model = namespace["run_studio_agent"] = Mock(return_value=self.reply)
        self.memory_sessions = []
        self.memory_fault = None
        def write_memory(db, **kwargs):
            self.memory_sessions.append(db)
            if kwargs["user_id"] is None:
                return
            row = AgentMemoryEntry(user_id=kwargs["user_id"], conversation_id=kwargs["conversation_id"],
                                   memory_type="summary", content="synthetic memory", source_turn_ref="r86-fixture")
            db.add(row)
            if self.memory_fault:
                self.memory_fault(db, row)
            db.flush()
        namespace["record_chat_turn_memory"] = self.writer = Mock(side_effect=write_memory)
        tools = ModuleType("app.integrations.studio_agent.tools")
        tools.StudioToolContext = SimpleNamespace
        tools.allowlist_needs_generation_models = Mock(return_value=False)
        tools.format_enabled_generation_models_note = Mock(side_effect=AssertionError("generation hints not requested"))
        self.enterContext(patch.dict("sys.modules", {tools.__name__: tools}))
        # F73 isolates the memory boundary; F74 exercises the real receipt layer.
        completion = ModuleType("app.services.chat_agent_completion_service")
        completion.start_agent_call = Mock(return_value=1)
        completion.fail_agent_call = Mock()
        completion.complete_agent_call = Mock(return_value={})
        self.enterContext(patch.dict("sys.modules", {completion.__name__: completion}))
        path = BACKEND / "app/services/agent_harness_service.py"
        names = {n.name for n in ast.parse(path.read_text(encoding="utf-8")).body
                 if isinstance(n, (ast.ClassDef, ast.FunctionDef))}
        definitions("app/services/agent_harness_service.py", names, namespace)

    def run_harness(self, **kwargs):
        values = dict(recent_messages=[], new_content="synthetic user input", user_name="synthetic",
                      user_id=self.user_id, conversation_id=self.conv_id, provider_id=None, policy_version=None)
        values.update(kwargs)
        return self.module.run_chat_agent_harness(self.db, **values)

    def count(self, model):
        with self.sessions() as db:
            return db.scalar(sa.select(sa.func.count()).select_from(model))

    def assert_completed(self, result):
        self.assertIs(result.reply, self.reply)
        self.assertEqual((result.reply.prompt_tokens, result.reply.completion_tokens,
                          result.reply.total_tokens, result.reply.cached_input_tokens), (90, 30, 120, 15))
        self.assertEqual(result.reply.usage_payload, self.reply.usage_payload)
        self.assertEqual(self.model.call_count, 1)

    def test_healthy_completion_keeps_reply_usage_and_one_memory(self):
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual(self.count(AgentMemoryEntry), 1)

    def test_memory_flush_failure_preserves_completed_reply_and_usage(self):
        self.memory_fault = lambda db, row: setattr(row, "conversation_id", 999999)
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual(result.memory_status, "failed")
        self.assertEqual(result.delivery_status, "ready")
        self.assertEqual(self.count(AgentMemoryEntry), 0)
        self.assertTrue(self.db.is_active)

    def test_memory_commit_failure_does_not_commit_or_rollback_caller(self):
        self.user.name = "uncommitted caller change"
        def fail_commit(db, row):
            sa.event.listen(db, "before_commit", lambda session: session.execute(self.guard.insert().values(id=1)), once=True)
        self.memory_fault = fail_commit
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual(result.memory_status, "failed")
        self.assertTrue(self.db.is_active)
        self.assertIn(self.user, self.db.dirty)
        with self.sessions() as other:
            self.assertEqual(other.get(User, self.user_id).name, "r86-synthetic")
        self.assertEqual(self.count(AgentMemoryEntry), 0)
        self.assertIsNot(self.memory_sessions[0], self.db)

    def test_model_failure_before_completion_never_writes_memory(self):
        self.model.side_effect = RuntimeError("synthetic pre-completion failure")
        with self.assertRaisesRegex(RuntimeError, "pre-completion"):
            self.run_harness()
        self.assertEqual(self.model.call_count, 1)
        self.writer.assert_not_called()
        self.assertEqual(self.count(AgentMemoryEntry), 0)

    def delete_conversation(self):
        with self.sessions() as other:
            other.execute(sa.delete(ChatMessage).where(ChatMessage.conversation_id == self.conv_id))
            other.execute(sa.delete(Conversation).where(Conversation.id == self.conv_id))
            other.commit()

    def test_healthy_memory_transaction_leaves_caller_dirty_changes_uncommitted(self):
        self.user.name = "caller draft"
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual((result.memory_status, result.delivery_status), ("completed", "ready"))
        self.assertIsNot(self.memory_sessions[0], self.db)
        self.assertIn(self.user, self.db.dirty)
        with self.sessions() as other:
            self.assertEqual(other.get(User, self.user_id).name, "r86-synthetic")
        self.db.rollback()
        self.assertEqual(self.count(AgentMemoryEntry), 1)

    def test_deleted_during_model_keeps_usage_but_revokes_reply_and_memory(self):
        def complete(*args, **kwargs):
            self.delete_conversation()
            return self.reply
        self.model.side_effect = complete
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual((result.memory_status, result.delivery_status), ("not_attempted", "revoked"))
        self.writer.assert_not_called()
        self.assertEqual(self.count(Conversation), 0)
        self.assertEqual(self.count(ChatMessage), 0)
        self.assertEqual(self.count(AgentMemoryEntry), 0)
        self.assertIs(self.db.get(Conversation, self.conv_id), self.conv)  # stale caller is deliberately loaded

    def test_deleted_before_completion_check_with_none_user_is_still_revoked(self):
        self.delete_conversation()
        result = self.run_harness(user_id=None)
        self.assert_completed(result)
        self.assertEqual(result.delivery_status, "revoked")
        self.writer.assert_not_called()
        self.assertEqual(self.count(Conversation), 0)

    def test_none_user_skips_memory_without_committing_caller(self):
        self.user.name = "uncommitted guest caller"
        result = self.run_harness(user_id=None)
        self.assert_completed(result)
        self.assertEqual((result.memory_status, result.delivery_status), ("skipped", "ready"))
        self.writer.assert_not_called()
        self.module.build_compacted_memory_context.assert_not_called()
        self.assertIn(self.user, self.db.dirty)
        self.assertEqual(self.count(AgentMemoryEntry), 0)

    def test_owner_changed_while_model_runs_revokes_without_new_memory(self):
        with self.sessions() as other:
            owner = User(name="other-synthetic", role="designer", project_codes=[])
            other.add(owner)
            other.flush()
            other.execute(sa.update(Conversation).where(Conversation.id == self.conv_id).values(user_id=owner.id))
            other.commit()
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual(result.delivery_status, "revoked")
        self.writer.assert_not_called()
        self.assertEqual(self.count(Conversation), 1)

    def test_deleted_during_memory_write_rolls_back_and_revokes(self):
        self.memory_fault = lambda db, row: self.delete_conversation()
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual((result.memory_status, result.delivery_status), ("failed", "revoked"))
        self.assertEqual(self.count(AgentMemoryEntry), 0)
        self.assertEqual(self.count(Conversation), 0)
        self.assertTrue(self.db.is_active)

    def test_deleted_after_memory_commit_is_detected_by_fresh_scalar_read(self):
        def after_commit(db, row):
            sa.event.listen(db, "after_commit", lambda session: self.delete_conversation(), once=True)
        self.memory_fault = after_commit
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual((result.memory_status, result.delivery_status), ("completed", "revoked"))
        self.assertEqual(self.count(Conversation), 0)
        # Existing FK SET NULL semantics are preserved; this card does not
        # change the established detach/delete privacy policy.
        with self.sessions() as other:
            self.assertIsNone(other.scalar(sa.select(AgentMemoryEntry)).conversation_id)

    def test_accepted_tool_commit_survives_later_memory_failure_without_retry(self):
        def complete(db, **kwargs):
            db.execute(self.guard.insert().values(id=2))
            db.commit()
            self.user.name = "draft after accepted tool"
            return self.reply
        self.model.side_effect = complete
        self.memory_fault = lambda db, row: setattr(row, "conversation_id", 999999)
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual(result.audit_details["task_proposals"], ["synthetic-accepted"])
        self.assertEqual(result.audit_details["tool_calls"], ["accepted_fixture"])
        with self.engine.connect() as conn:
            self.assertEqual(conn.execute(sa.select(self.guard.c.id).order_by(self.guard.c.id)).scalars().all(), [1, 2])
        self.assertIn(self.user, self.db.dirty)

    def test_caller_flushed_transaction_is_not_rolled_back_on_sqlite_write_lock(self):
        self.user.name = "flushed caller draft"
        self.db.flush()
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual((result.memory_status, result.delivery_status), ("failed", "ready"))
        self.assertEqual(self.db.scalar(sa.select(User.name).where(User.id == self.user_id)), "flushed caller draft")
        with self.sessions() as other:
            self.assertEqual(other.get(User, self.user_id).name, "r86-synthetic")
        self.db.commit()
        with self.sessions() as other:
            self.assertEqual(other.get(User, self.user_id).name, "flushed caller draft")

    def test_connection_bound_caller_still_uses_an_independent_memory_transaction(self):
        self.db.close()
        with self.engine.connect() as connection:
            transaction = connection.begin()
            with Session(bind=connection) as db:
                self.db = db
                result = self.run_harness()
                self.assert_completed(result)
                self.assertEqual(result.delivery_status, "ready")
                self.assertTrue(transaction.is_active)
                self.assertIs(self.memory_sessions[0].get_bind(), self.engine)
            transaction.rollback()
        self.assertEqual(self.count(AgentMemoryEntry), 1)

    def test_lost_memory_commit_ack_keeps_known_reply_without_memory_retry(self):
        def lose_ack(db, row):
            def lost(session):
                raise RuntimeError("synthetic commit ack lost, never expose input content")
            sa.event.listen(db, "after_commit", lost, once=True)
        self.memory_fault = lose_ack
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual(result.memory_status, "failed")
        self.assertEqual(result.delivery_status, "unverified")
        self.assertEqual(self.writer.call_count, 1)
        self.assertEqual(self.count(AgentMemoryEntry), 1)
        self.assertNotIn("ack lost", json.dumps(result.audit_details))

    def test_failed_memory_session_does_not_poison_a_new_explicit_turn(self):
        self.memory_fault = lambda db, row: setattr(row, "conversation_id", 999999)
        first = self.run_harness()
        self.memory_fault = None
        second = self.run_harness()
        self.assertEqual((first.memory_status, second.memory_status), ("failed", "completed"))
        self.assertEqual((first.delivery_status, second.delivery_status), ("ready", "ready"))
        self.assertEqual(self.model.call_count, 2)
        self.assertNotEqual(first.call_id, second.call_id)
        self.assertEqual(self.count(AgentMemoryEntry), 1)
        self.assertIsNot(self.memory_sessions[0], self.memory_sessions[1])

    def test_unavailable_liveness_check_is_unverified_and_not_ready(self):
        self.module.Session = Mock(side_effect=RuntimeError("synthetic unavailable DB"))
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual(result.delivery_status, "unverified")
        self.assertEqual(result.audit_details["memory_error_code"], "conversation_check_failed")
        self.writer.assert_not_called()
        self.assertTrue(self.db.is_active)

    def test_second_liveness_check_failure_does_not_claim_ready(self):
        queries = []
        def fail_check(conn, cursor, statement, parameters, context, many):
            if statement.startswith("SELECT conversations.id"):
                queries.append(statement)
                if len(queries) == 2:
                    raise RuntimeError("synthetic second-check failure")
        sa.event.listen(self.engine, "before_cursor_execute", fail_check)
        try:
            result = self.run_harness()
        finally:
            sa.event.remove(self.engine, "before_cursor_execute", fail_check)
        self.assert_completed(result)
        self.assertEqual((result.memory_status, result.delivery_status), ("completed", "unverified"))
        self.assertEqual(self.count(AgentMemoryEntry), 1)

    def test_call_identity_is_created_before_model_and_survives_memory_failure(self):
        identity = Mock(return_value=SimpleNamespace(hex="synthetic-call-identity"))
        self.module.uuid4 = identity
        def complete(*args, **kwargs):
            identity.assert_called_once_with()
            return self.reply
        self.model.side_effect = complete
        self.memory_fault = lambda db, row: setattr(row, "conversation_id", 999999)
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual(result.call_id, result.audit_details["call_id"])
        self.assertEqual(result.call_id, "synthetic-call-identity")
        self.assertNotIn(self.reply.text, json.dumps(result.audit_details))

    def test_isolated_entry_reloads_recent_messages_in_caller_order(self):
        first = ChatMessage(conversation_id=self.conv_id, role="user", content="synthetic one")
        second = ChatMessage(conversation_id=self.conv_id, role="assistant", content="synthetic two")
        self.db.add_all([first, second])
        self.db.commit()
        database = ModuleType("app.database")
        database.SessionLocal = self.sessions
        with patch.dict("sys.modules", {database.__name__: database}):
            result = self.module.run_chat_agent_harness_isolated(
                recent_messages=[second, SimpleNamespace(id=999999), first],
                new_content="synthetic input", user_name="synthetic", user_id=self.user_id,
                conversation_id=self.conv_id, provider_id=None, policy_version=None)
        self.assert_completed(result)
        loaded = self.module.build_chat_agent_message.call_args.args[0]
        self.assertEqual([m.id for m in loaded], [second.id, first.id])
        self.assertIsNot(loaded[0], second)
        self.assertEqual(result.delivery_status, "ready")
        self.assertEqual(self.count(AgentMemoryEntry), 1)

    async def consume_route(self, delivery_status, harness_result=None, route_db=None):
        path = BACKEND / "app/routers/chat.py"
        tree = ast.parse(path.read_text(encoding="utf-8"))
        node, = [n for n in ast.walk(tree) if isinstance(n, ast.AsyncFunctionDef) and n.name == "generate_agent"]
        future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
        module = ast.fix_missing_locations(ast.Module(body=[future, node], type_ignores=[]))
        finalized, effects = {}, []
        def persist(*args, **kwargs):
            effects.append(("message", args[3]))
            return SimpleNamespace(id=91)
        def audit(*args, **kwargs):
            effects.append(("audit", kwargs["details"]))
        def finish(*args, **kwargs):
            effects.append(("telemetry", kwargs["outcome"]))
            finalized["done"] = True
        async def stream(reply):
            effects.append(("stream", reply.total_tokens))
            yield "data: synthetic completed reply\n\n"
        def ledger(*args, **kwargs):
            effects.append(("ledger", kwargs["total_tokens"], kwargs["usage_payload"]["cached_input_tokens"]))
        db = route_db or SimpleNamespace(get=Mock(return_value=SimpleNamespace(provider_name="offline", model_name="synthetic")),
                             commit=Mock())
        from app.services.chat_telemetry_service import ChatTurnTracker
        ns = dict(asyncio=asyncio, json=json, get_correlation_id=lambda: "synthetic-correlation", db=db,
                  recent=[], content="private synthetic user text", auth_user=SimpleNamespace(name="synthetic", user_id=self.user_id),
                  conversation_id=self.conv_id, provider_profile_id=1, policy_version=None, attachments=[],
                  telemetry_finalized=finalized, turn_tracker=ChatTurnTracker(turn_id=1), conversation=self.conv,
                  ChatAgentThinkingStep=self.module.ChatAgentThinkingStep,
                  StudioAgentUnavailableError=type("StudioAgentUnavailableError", (RuntimeError,), {}),
                  run_chat_agent_harness_isolated=lambda **kwargs: harness_result or SimpleNamespace(
                      reply=self.reply, audit_details={"delivery_status": delivery_status, "memory_status": "failed"}),
                  format_agent_thinking_sse=lambda: "data: thinking\n\n",
                  format_agent_thinking_step_sse=lambda step: "data: thinking-step\n\n",
                  chat_error_payload=lambda **kwargs: kwargs,
                  _chat_error_sse=lambda payload: "data: " + json.dumps(payload, ensure_ascii=False) + "\n\n",
                  _persist_agent_assistant_message=persist, write_audit_log=audit,
                  record_chat_usage_ledger=ledger, _finish_chat_turn_telemetry=finish,
                  stream_chat_agent_sse=stream, AuditEventType=SimpleNamespace(STUDIO_AGENT_ASSIST="assist"),
                  ProviderProfile=object, logger=Mock(),
                  _format_agent_run_error=lambda exc: ("synthetic route failed", "fixture"),
                  format_chat_error_message=lambda payload: "synthetic error")
        exec(compile(module, str(path), "exec"), ns)
        output = [chunk async for chunk in ns["generate_agent"]()]
        return output, effects, finalized, db

    def test_revoked_route_emits_no_reply_audit_message_or_ledger(self):
        with asyncio.Runner(loop_factory=TimerOnlyLoop) as runner:
            output, effects, finalized, db = runner.run(self.consume_route("revoked"))
        self.assertEqual(effects, [])
        self.assertTrue(finalized["done"])
        self.assertIn("chat_conversation_unavailable", "".join(output))
        self.assertIn("data: [DONE]", "".join(output))
        self.assertNotIn(self.reply.text, "".join(output))
        self.assertNotIn("private synthetic", "".join(output))
        db.commit.assert_not_called()
        db.get.assert_not_called()

    def test_unverified_route_emits_no_reply_audit_message_or_ledger(self):
        with asyncio.Runner(loop_factory=TimerOnlyLoop) as runner:
            output, effects, finalized, db = runner.run(self.consume_route("unverified"))
        self.assertEqual(effects, [])
        self.assertTrue(finalized["done"])
        self.assertIn("勿直接重发", "".join(output))
        self.assertNotIn(self.reply.text, "".join(output))
        db.commit.assert_not_called()

    def test_ready_route_keeps_original_reply_and_known_usage_ledger_path(self):
        self.memory_fault = lambda db, row: setattr(row, "conversation_id", 999999)
        result = self.run_harness()
        self.assertEqual((result.memory_status, result.delivery_status), ("failed", "ready"))
        with asyncio.Runner(loop_factory=TimerOnlyLoop) as runner:
            output, effects, finalized, db = runner.run(self.consume_route("ready", result))
        self.assertEqual([e[0] for e in effects], ["audit", "message", "ledger", "telemetry", "stream"])
        self.assertEqual(effects[0][1]["call_id"], result.call_id)
        self.assertIn(("ledger", 120, 15), effects)
        self.assertIn(("telemetry", "agent_success"), effects)
        self.assertIn(self.reply.text, "".join(output))
        self.assertTrue(finalized["done"])
        db.commit.assert_called_once_with()
