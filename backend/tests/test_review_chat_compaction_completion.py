"""R86c: actual compaction pack/receipts/ledger and isolated SQLite failures."""
import ast
import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import AsyncMock, Mock, patch

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError, PendingRollbackError
from sqlalchemy.orm import Session, sessionmaker

from app.models import AuditLog, ChatMessage, ChatTurnTelemetry, Conversation, ProviderPricingRule, ProviderProfile, UsageLedger, User
from app.services import chat_context as context
from app.services import chat_compaction_completion_service as receipt
from app.services.chat_service import ChatProviderConfig
from app.services.usage_ledger import record_chat_compaction_usage_ledger
from tests.test_review_agent_memory_completion import TimerOnlyLoop
from tests.test_review_chat_partial_stream import ChatPartialStreamTests


class ChatCompactionCompletionTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory(prefix="r86c-offline-")))
        self.engine = sa.create_engine("sqlite:///" + (self.root / "compaction.db").as_posix(), connect_args={"timeout": 0.2})
        self.addCleanup(self.engine.dispose)
        sa.event.listen(self.engine, "connect", lambda c, _: c.execute("PRAGMA foreign_keys=ON"))
        tables = set()
        def include(table):
            if table in tables:
                return
            tables.add(table)
            for key in table.foreign_keys:
                include(key.column.table)
        for model in (ChatMessage, AuditLog, UsageLedger, ProviderPricingRule):
            include(model.__table__)
        Conversation.metadata.create_all(self.engine, tables=list(tables))
        metadata = sa.MetaData()
        self.guard = sa.Table("r86c_guard", metadata, sa.Column("id", sa.Integer, primary_key=True))
        metadata.create_all(self.engine)
        with self.engine.begin() as c:
            c.execute(self.guard.insert().values(id=1))
        self.sessions = sessionmaker(self.engine, expire_on_commit=False, autoflush=False)
        self.db = self.sessions()
        self.addCleanup(self.db.close)
        self.user = User(name="synthetic-owner", display_name="Synthetic", role="designer", project_codes=[])
        self.provider = ProviderProfile(provider_name="synthetic-provider", model_name="synthetic-model", api_key="unused",
                                        base_url="https://invalid.invalid", adapter_config={"context_window": 1024})
        self.db.add_all([self.user, self.provider])
        self.db.flush()
        self.conversation = Conversation(user_id=self.user.id, title="synthetic", model_provider_id=self.provider.id)
        self.db.add(self.conversation)
        self.db.flush()
        self.conversation_id, self.user_id, self.provider_id = self.conversation.id, self.user.id, self.provider.id
        self.messages = [ChatMessage(conversation_id=self.conversation_id, role="user" if i % 2 == 0 else "assistant",
                         content="synthetic history " + str(i) + "x" * 420, attachments_json=[],
                         created_at=datetime(2024, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=i)) for i in range(20)]
        self.db.add_all(self.messages)
        self.db.add_all([ProviderPricingRule(provider_profile_id=self.provider_id, capability="chat.completions", metric=m,
                        unit_size=1, unit_price=p, currency="CNY", is_active=True)
                        for m, p in [("input_tokens", 1), ("output_tokens", 2), ("cached_input_tokens", .5)]])
        self.db.commit()
        for name, value in [("chat_completion_reserve_tokens", 64), ("chat_summary_budget_tokens", 256),
                            ("chat_min_recent_messages", 2), ("chat_summary_trigger_ratio", .75)]:
            self.enterContext(patch.object(context.settings, name, value))
        self.summary = "synthetic compacted summary"
        self.usage = {"prompt_tokens": 90, "completion_tokens": 30, "total_tokens": 120, "cached_input_tokens": 15,
                      "opaque": "secret synthetic payload"}
        self.model = self.enterContext(patch.object(context, "summarize_chat_history", AsyncMock(return_value=(self.summary, self.usage))))
        self.config = ChatProviderConfig(api_key="unused", base_url="https://invalid.invalid", model_name="synthetic-model")

    def pack(self, function=None, **kwargs):
        with asyncio.Runner(loop_factory=TimerOnlyLoop) as runner:
            return runner.run((function or context.pack_chat_context)(self.db, self.conversation, self.messages,
                              self.config, provider_profile=self.provider, **kwargs))

    def rows(self, model):
        with self.sessions() as db:
            return list(db.scalars(sa.select(model).order_by(model.id)))

    def saved_summary(self):
        return self.rows(Conversation)[0].context_summary

    def delete_conversation(self):
        with self.sessions() as db:
            db.execute(sa.delete(ChatMessage).where(ChatMessage.conversation_id == self.conversation_id))
            db.execute(sa.delete(Conversation).where(Conversation.id == self.conversation_id))
            db.commit()

    def assert_known(self, *, ledgers=1):
        row, = self.rows(AuditLog)
        self.assertEqual(row.details["state"], "completed")
        self.assertTrue(row.details["usage_known"])
        self.assertEqual(row.details["usage"]["total_tokens"], 120)
        self.assertNotIn(self.summary, str(row.details))
        self.assertNotIn("secret synthetic payload", str(row.details))
        self.assertEqual(len(self.rows(UsageLedger)), ledgers)
        self.assertEqual(self.model.await_count, 1)
        return row

    def test_healthy_summary_known_priced_usage_and_stats(self):
        packed = self.pack()
        self.assertTrue(packed.summarized)
        self.assertTrue(packed.used_summary)
        self.assertEqual(self.saved_summary(), self.summary)
        row = self.assert_known()
        ledger, = self.rows(UsageLedger)
        self.assertEqual((ledger.source_table, ledger.source_id, ledger.total_tokens, ledger.cost),
                         ("chat_compaction_calls", row.id, 120, 142.5))
        self.assertEqual(self.conversation.context_summary, self.summary)
        self.assertGreater(self.conversation.context_packed_tokens, 0)

    def test_original_unique_flush_loses_summary_but_new_path_preserves_it(self):
        path = Path(__file__).resolve().parents[2] / "docs/archive/f75-r86c-2026-10-25/original/backend/app/services/chat_context.py"
        tree = ast.parse(path.read_text(encoding="utf-8"))
        fn = next(n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "pack_chat_context")
        future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
        ns = context.__dict__.copy()
        def duplicate(db, **kwargs):
            ledger = record_chat_compaction_usage_ledger(db, **kwargs)
            db.flush()
            values = {c.key: getattr(ledger, c.key) for c in UsageLedger.__table__.columns if c.key not in {"id", "created_at"}}
            db.add(UsageLedger(**values))
            db.flush()
        ns["record_chat_compaction_usage_ledger"] = duplicate
        exec(compile(ast.fix_missing_locations(ast.Module(body=[future, fn], type_ignores=[])), str(path), "exec"), ns)
        with self.assertRaises(PendingRollbackError):
            self.pack(ns["pack_chat_context"])
        self.assertFalse(self.db.is_active)
        self.db.rollback()
        self.assertEqual(self.saved_summary(), "")
        self.assertEqual(self.rows(UsageLedger), [])
        self.model.reset_mock()
        with patch.object(receipt, "record_chat_compaction_usage_ledger", side_effect=duplicate):
            packed = self.pack()
        self.assertTrue(packed.summarized)
        row = self.assert_known(ledgers=0)
        self.assertEqual(self.saved_summary(), self.summary)
        self.assertTrue(self.db.is_active)
        self.assertTrue(receipt.settle_compaction_usage(self.db, row.id))
        self.assertEqual(self.rows(UsageLedger)[0].cost, 142.5)

    def test_ledger_commit_failure_preserves_summary_and_pending_known_usage(self):
        original = receipt.record_chat_compaction_usage_ledger
        def fail_commit(db, **kwargs):
            ledger = original(db, **kwargs)
            sa.event.listen(db, "before_commit", lambda tx: tx.execute(self.guard.insert().values(id=1)), once=True)
            return ledger
        with patch.object(receipt, "record_chat_compaction_usage_ledger", side_effect=fail_commit):
            packed = self.pack()
        self.assertTrue(packed.summarized)
        row = self.assert_known(ledgers=0)
        self.assertEqual(row.details["ledger_status"], "pending")
        self.assertEqual(self.saved_summary(), self.summary)
        self.assertTrue(self.db.is_active)

    def test_summary_commit_failure_retries_only_local_completed_result(self):
        fired = []
        def fail_once(db):
            if not fired and any(isinstance(r, AuditLog) and r.details.get("summary_status") == "stored" for r in db.identity_map.values()):
                fired.append(True)
                db.execute(self.guard.insert().values(id=1))
        sa.event.listen(Session, "before_commit", fail_once)
        try:
            packed = self.pack()
        finally:
            sa.event.remove(Session, "before_commit", fail_once)
        self.assertTrue(fired)
        self.assertTrue(packed.summarized)
        self.assertEqual(self.saved_summary(), self.summary)
        self.assert_known()

    def test_lost_summary_commit_ack_reads_success_without_new_model_call(self):
        fired = []
        def lost_ack(db):
            if not fired and any(isinstance(r, AuditLog) and r.details.get("summary_status") == "stored" for r in db.identity_map.values()):
                fired.append(True)
                raise RuntimeError("synthetic ack lost")
        sa.event.listen(Session, "after_commit", lost_ack)
        try:
            self.pack()
        finally:
            sa.event.remove(Session, "after_commit", lost_ack)
        self.assertTrue(fired)
        self.assertEqual(self.saved_summary(), self.summary)
        self.assert_known()

    def test_permanent_summary_write_failure_preserves_usage_and_stops_pack(self):
        def fail(db):
            if any(isinstance(r, AuditLog) and r.details.get("summary_status") == "stored" for r in db.identity_map.values()):
                db.execute(self.guard.insert().values(id=1))
        sa.event.listen(Session, "before_commit", fail)
        try:
            with self.assertRaises(receipt.ChatContextUnavailable):
                self.pack()
        finally:
            sa.event.remove(Session, "before_commit", fail)
        row = self.assert_known()
        self.assertEqual(row.details["summary_status"], "unverified")
        self.assertEqual(self.saved_summary(), "")

    def test_deleted_during_model_keeps_usage_and_never_recreates_summary(self):
        async def deleted(**kwargs):
            self.delete_conversation()
            return self.summary, self.usage
        self.model.side_effect = deleted
        with self.assertRaises(receipt.ChatContextUnavailable):
            self.pack()
        row = self.assert_known()
        self.assertEqual(row.details["summary_status"], "revoked")
        self.assertEqual(self.rows(Conversation), [])
        self.assertEqual(self.rows(ChatMessage), [])

    def test_changed_summary_wins_over_stale_completed_compaction(self):
        async def changed(**kwargs):
            with self.sessions() as db:
                db.execute(sa.update(Conversation).values(context_summary="new concurrent summary", context_summary_until_message_id=self.messages[-1].id))
                db.commit()
            return self.summary, self.usage
        self.model.side_effect = changed
        packed = self.pack()
        self.assertFalse(packed.summarized)
        self.assertTrue(packed.used_summary)
        self.assertIn("new concurrent summary", str(packed.api_messages))
        self.assertNotIn(self.summary, str(packed.api_messages))
        self.assertEqual(self.saved_summary(), "new concurrent summary")
        self.assert_known()

    def test_empty_summary_still_retains_actual_known_consumption(self):
        self.model.return_value = ("", self.usage)
        packed = self.pack()
        self.assertFalse(packed.summarized)
        self.assertFalse(packed.used_summary)
        self.assert_known()
        self.assertEqual(self.rows(UsageLedger)[0].cost, 142.5)

    def test_success_without_reported_usage_is_unknown_not_a_zero_ledger(self):
        self.model.return_value = (self.summary, {"source": "synthetic-no-counters"})
        self.pack()
        row, = self.rows(AuditLog)
        self.assertFalse(row.details["usage_known"])
        self.assertEqual(row.details["ledger_status"], "unknown")
        self.assertEqual(self.rows(UsageLedger), [])
        self.assertEqual(self.saved_summary(), self.summary)

    def test_two_actual_calls_for_same_until_are_distinct_not_overwritten(self):
        self.pack()
        first_until = self.rows(AuditLog)[0].details["until_message_id"]
        self.db.execute(sa.update(Conversation).values(context_summary="", context_summary_until_message_id=None))
        self.db.commit()
        self.db.refresh(self.conversation)
        self.pack()
        self.assertEqual(self.model.await_count, 2)
        rows = self.rows(AuditLog)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1].details["until_message_id"], first_until)
        self.assertNotEqual(rows[0].details["call_id"], rows[1].details["call_id"])
        self.assertEqual(sum(r.total_tokens for r in self.rows(UsageLedger)), 240)

    def test_duplicate_settlement_after_delete_preserves_original_price(self):
        with patch.object(receipt, "record_chat_compaction_usage_ledger", side_effect=RuntimeError("synthetic pending")):
            self.pack()
        row = self.assert_known(ledgers=0)
        self.db.execute(sa.update(ProviderPricingRule).values(unit_price=999))
        self.db.commit()
        self.delete_conversation()
        for _ in range(3):
            self.assertTrue(receipt.settle_compaction_usage(self.db, row.id))
        ledger, = self.rows(UsageLedger)
        self.assertEqual((ledger.total_tokens, ledger.cost), (120, 142.5))
        self.assertEqual(self.rows(Conversation), [])
        self.assertEqual(self.model.await_count, 1)

    def test_failed_caller_session_after_model_is_recovered_without_orm_fallback_reads(self):
        async def broken(**kwargs):
            self.db.add(ChatMessage(conversation_id=999999, role="user", content="synthetic invalid"))
            with self.assertRaises(IntegrityError):
                self.db.flush()
            self.assertFalse(self.db.is_active)
            return self.summary, self.usage
        self.model.side_effect = broken
        packed = self.pack()
        self.assertTrue(packed.summarized)
        self.assertTrue(self.db.is_active)
        self.assertEqual(len(self.rows(ChatMessage)), 20)
        self.assert_known()

    def test_model_error_recovers_failed_session_before_trim_and_sanitized_log(self):
        async def broken(**kwargs):
            self.db.add(ChatMessage(conversation_id=999999, role="user", content="synthetic invalid"))
            with self.assertRaises(IntegrityError):
                self.db.flush()
            raise RuntimeError("secret synthetic provider exception")
        self.model.side_effect = broken
        with self.assertLogs(context.logger, level="WARNING") as logs:
            packed = self.pack()
        self.assertFalse(packed.summarized)
        self.assertTrue(self.db.is_active)
        self.assertNotIn("secret synthetic", str(logs.output))
        self.assertEqual(self.rows(UsageLedger), [])
        self.assertFalse(self.rows(AuditLog)[0].details["usage_known"])

    def test_stats_commit_failure_does_not_erase_completed_summary_or_usage(self):
        fired = []
        def stats_fail(db):
            if not fired and any(isinstance(r, Conversation) for r in db.dirty) and not any(isinstance(r, AuditLog) for r in db.identity_map.values()):
                fired.append(True)
                db.execute(self.guard.insert().values(id=1))
        sa.event.listen(Session, "before_commit", stats_fail)
        try:
            packed = self.pack()
        finally:
            sa.event.remove(Session, "before_commit", stats_fail)
        self.assertTrue(fired)
        self.assertTrue(packed.summarized)
        self.assertEqual(self.saved_summary(), self.summary)
        self.assert_known()

    def test_context_change_before_stats_stops_instead_of_overwriting_new_state(self):
        original = context.persist_context_stats
        def changed(*args, **kwargs):
            with self.sessions() as db:
                db.execute(sa.update(Conversation).values(context_summary="later summary"))
                db.commit()
            return original(*args, **kwargs)
        with patch.object(context, "persist_context_stats", side_effect=changed):
            with self.assertRaises(receipt.ChatContextUnavailable):
                self.pack()
        self.assertEqual(self.saved_summary(), "later summary")
        self.assert_known()

    def test_no_summarize_keeps_caller_draft_and_does_not_admit_model(self):
        self.conversation.title = "unsubmitted caller title"
        self.pack(allow_summarize=False)
        self.model.assert_not_awaited()
        self.assertEqual(self.rows(AuditLog), [])
        self.assertEqual(self.rows(UsageLedger), [])
        self.assertEqual(self.conversation.title, "unsubmitted caller title")
        self.assertIn(self.conversation, self.db.dirty)
        self.assertEqual(self.rows(Conversation)[0].title, "synthetic")
        self.pack()
        self.assertEqual(self.model.await_count, 1)
        self.assertEqual(self.conversation.title, "unsubmitted caller title")
        self.assertIn(self.conversation, self.db.dirty)
        self.assertEqual(self.rows(Conversation)[0].title, "synthetic")

    def test_cancel_before_completion_marks_usage_unknown_and_propagates(self):
        self.model.side_effect = asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError):
            self.pack()
        row, = self.rows(AuditLog)
        self.assertEqual(row.details["state"], "failed")
        self.assertFalse(row.details["usage_known"])
        self.assertEqual(self.rows(UsageLedger), [])
        self.assertEqual(self.saved_summary(), "")

    def test_completion_database_outage_is_unverified_instead_of_fake_trim_success(self):
        with patch.object(receipt, "_write_completed", side_effect=RuntimeError("synthetic DB unavailable")), \
                patch.object(receipt, "_read_completed", side_effect=RuntimeError("synthetic DB unavailable")):
            with self.assertRaises(receipt.ChatContextUnavailable):
                self.pack()
        self.assertEqual(self.model.await_count, 1)
        self.assertEqual(self.rows(AuditLog)[0].details["state"], "admitted")
        self.assertEqual(self.rows(UsageLedger), [])

    def test_none_or_malformed_usage_is_not_treated_as_known_zero(self):
        for payload in [None, {"prompt_tokens": "not-reported", "total_tokens": None},
                        {"uncached_input_tokens": 120}, {"total_tokens": float("inf")}]:
            self.db.execute(sa.update(Conversation).values(context_summary="", context_summary_until_message_id=None))
            self.db.commit()
            self.db.refresh(self.conversation)
            self.model.return_value = (self.summary, payload)
            self.pack()
        self.assertEqual(self.model.await_count, 4)
        self.assertTrue(all(not row.details["usage_known"] for row in self.rows(AuditLog)))
        self.assertEqual(self.rows(UsageLedger), [])
        self.db.execute(sa.update(Conversation).values(context_summary="", context_summary_until_message_id=None))
        self.db.commit()
        self.db.refresh(self.conversation)
        self.model.return_value = (self.summary, {**self.usage, "total_tokens": float("inf")})
        self.pack()
        self.assertTrue(self.rows(AuditLog)[-1].details["usage_known"])
        self.assertEqual(self.rows(UsageLedger)[0].total_tokens, 120)

    def test_explicit_reported_zero_is_distinct_from_unknown(self):
        self.model.return_value = (self.summary, {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})
        self.pack()
        row, = self.rows(AuditLog)
        self.assertTrue(row.details["usage_known"])
        self.assertEqual(row.details["ledger_status"], "recorded")
        ledger, = self.rows(UsageLedger)
        self.assertEqual((ledger.total_tokens, ledger.cost), (0, 0))

    def test_deleted_before_admission_does_not_call_summary_model(self):
        self.delete_conversation()
        with self.assertRaises(receipt.ChatContextUnavailable):
            self.pack()
        self.model.assert_not_awaited()
        self.assertEqual(self.rows(AuditLog), [])
        self.assertEqual(self.rows(Conversation), [])

    def test_model_error_rolls_back_even_if_session_active_flag_is_true(self):
        async def failed(**kwargs):
            with self.assertRaises(IntegrityError):
                self.db.execute(self.guard.insert().values(id=1))
            self.assertTrue(self.db.is_active)
            raise RuntimeError("synthetic statement failure")
        self.model.side_effect = failed
        with patch.object(self.db, "rollback", wraps=self.db.rollback) as rollback:
            with self.assertLogs(context.logger, level="WARNING"):
                packed = self.pack()
            rollback.assert_called_once_with()
        self.assertFalse(packed.summarized)
        self.assertTrue(self.db.is_active)
        self.assertEqual(self.rows(UsageLedger), [])


class CompactionRouteStopTests(ChatPartialStreamTests):
    def test_context_unavailable_stops_without_final_model_or_error_message(self):
        self.pack_error = receipt.ChatContextUnavailable()
        chunks = self.run_async(self.drain(self.ns["make_generator"]()))
        self.assertEqual(self.stream_calls, 0)
        messages, ledger, turn = self.snapshot()
        self.assertEqual(messages, [])
        self.assertEqual(ledger, [])
        self.assertEqual(self.finalizations, [])
        self.assertTrue(self.ns["telemetry_finalized"]["done"])
        self.assertIn("chat_context_unavailable", "".join(chunks))
        self.assertIn("data: [DONE]", "".join(chunks))

    def test_deleted_during_pack_does_not_recreate_message_or_cached_telemetry(self):
        async def deleted(*args, **kwargs):
            with self.sessions() as db:
                db.execute(sa.delete(ChatTurnTelemetry))
                db.execute(sa.delete(ChatMessage))
                db.execute(sa.delete(Conversation))
                db.commit()
            raise receipt.ChatContextUnavailable()
        self.ns["pack_chat_context"] = deleted
        chunks = self.run_async(self.drain(self.ns["make_generator"]()))
        self.assertEqual(self.stream_calls, 0)
        self.assertEqual(self.finalizations, [])
        self.assertIn("chat_context_unavailable", "".join(chunks))
        self.assertIsNone(self.db.scalar(sa.select(Conversation)))
        self.assertIsNone(self.db.scalar(sa.select(ChatMessage)))
