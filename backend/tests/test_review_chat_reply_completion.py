"""R86d: real ordinary stream receipts/ledger/memory transactions, offline only."""
import ast
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import threading
from types import SimpleNamespace
from unittest.mock import Mock, patch

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import AgentMemoryEntry, AuditLog, ChatMessage, ChatTurnTelemetry, Conversation, ProviderPricingRule, UsageLedger
from app.services import chat_reply_completion_service as completion
from tests.test_review_chat_partial_stream import ChatPartialStreamTests, sse


class OrdinaryReplyCompletionTests(ChatPartialStreamTests):
    def setUp(self):
        super().setUp()
        AgentMemoryEntry.metadata.create_all(self.engine, tables=[AgentMemoryEntry.__table__])
        metadata = sa.MetaData()
        self.guard = sa.Table("r86d_guard", metadata, sa.Column("id", sa.Integer, primary_key=True))
        metadata.create_all(self.engine)
        with self.engine.begin() as c:
            c.execute(self.guard.insert().values(id=1))
        self.conversation_id = self.ns["conversation_id"]
        self.user_id = self.ns["auth_user"].user_id

    def rows(self, model):
        with self.sessions() as db:
            return list(db.scalars(sa.select(model).order_by(model.id)))

    def receipts(self):
        return [r for r in self.rows(AuditLog) if r.event_type == completion.EVENT]

    def play(self, actions):
        self.actions = actions
        return self.run_async(self.drain(self.ns["make_generator"]()))

    def delete_conversation(self):
        with self.sessions() as db:
            db.execute(sa.delete(ChatTurnTelemetry))
            db.execute(sa.delete(ChatMessage))
            db.execute(sa.delete(Conversation))
            db.commit()

    def finish_again(self, receipt_id, **overrides):
        values = dict(content="complete", usage_payload={"prompt_tokens": 7, "completion_tokens": 3, "total_tokens": 10},
                      usage_known=True, allow_delivery=True, user_id=self.user_id, user_message="question",
                      record_memory=True, memory_writer=self.memory, outcome="success")
        values.update(overrides)
        return completion.finish_reply(self.db, receipt_id, **values)

    def test_original_memory_fk_rolls_back_ledger_but_new_stream_keeps_reply_usage(self):
        path = Path(__file__).resolve().parents[2] / "docs/archive/f76-r86d-2026-10-25/original/backend/app/routers/chat.py"
        tree = ast.parse(path.read_text(encoding="utf-8"))
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_persist_chat_assistant_reply")
        future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
        ns = self.ns.copy()
        exec(compile(ast.fix_missing_locations(ast.Module(body=[future, fn], type_ignores=[])), str(path), "exec"), ns)
        sessions = []
        def fail_memory(db, **kwargs):
            sessions.append(db)
            db.add(AgentMemoryEntry(user_id=self.user_id, conversation_id=999999, content="synthetic invalid", memory_type="summary"))
            db.flush()
        self.memory.side_effect = fail_memory
        with self.assertRaises(IntegrityError):
            ns["_persist_chat_assistant_reply"](
                self.db, conversation_row=self.db.get(Conversation, self.conversation_id), conversation_id=self.conversation_id,
                provider_for_ledger=self.db.get(self.ns["ProviderProfile"], self.ns["provider_profile_id"]),
                provider_profile_id=self.ns["provider_profile_id"], auth_user=self.ns["auth_user"],
                provider_name=self.ns["provider_name"], provider_model_name=self.ns["provider_model_name"],
                content="complete", last_usage_payload={"prompt_tokens": 7, "completion_tokens": 3, "total_tokens": 10}, user_message="question")
        self.db.rollback()
        self.assertEqual(len(self.snapshot()[0]), 1)
        self.assertEqual(self.rows(UsageLedger), [])
        self.assertIs(sessions[0], self.db)
        self.db.execute(sa.delete(ChatMessage).where(ChatMessage.role == "assistant"))
        self.db.commit()
        self.memory.reset_mock()
        chunks = self.play([sse(delta="complete"), self.usage(), "data: [DONE]\n\n"])
        messages, ledgers, turn = self.snapshot()
        self.assertEqual([m.content for m in messages], ["complete"])
        self.assertEqual((ledgers[0].total_tokens, ledgers[0].cost), (10, 13))
        self.assertEqual(turn.outcome, "success")
        self.assertNotIn('"error"', "".join(chunks))
        self.assertIsNot(sessions[-1], self.db)
        self.assertEqual(self.receipts()[0].details["memory_status"], "failed")
        self.assertTrue(self.db.is_active)
        self.assertEqual(self.stream_calls, 1)

    def test_memory_commit_unique_failure_does_not_rollback_completed_ledger(self):
        def fail(db, **kwargs):
            db.add(AgentMemoryEntry(user_id=self.user_id, conversation_id=self.conversation_id, content="synthetic memory", memory_type="summary"))
            sa.event.listen(db, "before_commit", lambda tx: tx.execute(self.guard.insert().values(id=1)), once=True)
        self.memory.side_effect = fail
        self.play([sse(delta="complete"), self.usage()])
        self.assertEqual(self.rows(AgentMemoryEntry), [])
        self.assertEqual(self.rows(UsageLedger)[0].total_tokens, 10)
        self.assertEqual(self.receipts()[0].details["memory_status"], "failed")
        self.assertEqual(self.snapshot()[2].outcome, "success")

    def test_deleted_in_stream_suppresses_later_body_and_keeps_reported_usage(self):
        async def stream(*args):
            self.stream_calls += 1
            yield sse(delta="visible before delete")
            self.delete_conversation()
            yield sse(delta="secret after delete")
            yield self.usage()
            yield "data: [DONE]\n\n"
        self.ns["stream_chat_completion"] = stream
        chunks = self.play([])
        self.assertIn("visible before delete", "".join(chunks))
        self.assertNotIn("secret after delete", "".join(chunks))
        self.assertIn("chat_conversation_unavailable", "".join(chunks))
        self.assertEqual(self.rows(Conversation), [])
        self.assertEqual(self.rows(ChatMessage), [])
        self.assertEqual(self.rows(UsageLedger)[0].total_tokens, 10)
        details = self.receipts()[0].details
        self.assertTrue(details["usage_known"])
        self.assertIsNone(details["message_id"])
        self.assertNotIn("visible before delete", str(details))
        self.assertNotIn("secret after delete", str(details))
        self.memory.assert_not_called()
        self.assertEqual(self.stream_calls, 1)
        self.assertEqual(self.finalizations, [])

    def test_delete_after_pack_is_rejected_at_final_model_admission(self):
        async def pack(*args, **kwargs):
            self.delete_conversation()
            return SimpleNamespace(api_messages=[], context_payload=lambda: {})
        self.ns["pack_chat_context"] = pack
        chunks = self.play([])
        self.assertEqual(self.stream_calls, 0)
        self.assertEqual(self.receipts(), [])
        self.assertEqual(self.rows(ChatMessage), [])
        self.assertIn("chat_conversation_unavailable", "".join(chunks))

    def test_unverified_liveness_does_not_store_or_deliver_body_but_keeps_usage(self):
        with patch.object(completion, "reply_conversation_live", return_value=None):
            chunks = self.play([sse(delta="not deliverable"), self.usage()])
        self.assertNotIn("not deliverable", "".join(chunks))
        self.assertEqual(self.snapshot()[0], [])
        self.assertEqual(self.rows(UsageLedger)[0].total_tokens, 10)
        self.assertEqual(self.receipts()[0].details["delivery_status"], "unverified")
        self.memory.assert_not_called()

    def test_unknown_usage_does_not_create_zero_ledger(self):
        self.play([sse(delta="complete")])
        row, = self.receipts()
        self.assertFalse(row.details["usage_known"])
        self.assertEqual(row.details["ledger_status"], "unknown")
        self.assertEqual(self.rows(UsageLedger), [])
        self.assertEqual(self.snapshot()[0][0].content, "complete")

    def test_explicit_zero_usage_is_a_known_zero(self):
        self.play([sse(delta="complete"), sse(usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})])
        self.assertTrue(self.receipts()[0].details["usage_known"])
        ledger, = self.rows(UsageLedger)
        self.assertEqual((ledger.total_tokens, ledger.cost), (0, 0))

    def test_partial_usage_updates_and_invalid_payload_do_not_erase_known_counts(self):
        self.play([sse(delta="complete"), sse(usage={"prompt_tokens": 7}), sse(usage={"completion_tokens": 3}),
                   sse(usage={"prompt_tokens": 0, "total_tokens": 0, "raw": "private body"}), sse(usage={"total_tokens": float("inf")})])
        ledger, = self.rows(UsageLedger)
        self.assertEqual((ledger.prompt_tokens, ledger.completion_tokens, ledger.total_tokens, ledger.cost), (7, 3, 10, 13))
        self.assertNotIn("private body", str(self.receipts()[0].details))
        self.assertNotIn("private body", str(ledger.usage_payload))

    def test_pending_ledger_recovers_after_delete_without_repricing_or_new_stream(self):
        with patch.object(completion, "record_chat_usage_ledger", side_effect=RuntimeError("synthetic pending")):
            self.play([sse(delta="complete"), self.usage()])
        row, = self.receipts()
        self.assertEqual(row.details["ledger_status"], "pending")
        self.assertEqual(self.snapshot()[2].outcome, "success")
        self.db.execute(sa.update(ProviderPricingRule).values(unit_price=999))
        self.db.commit()
        self.delete_conversation()
        for _ in range(3):
            self.assertTrue(completion.settle_reply_usage(self.db, row.id))
        ledger, = self.rows(UsageLedger)
        self.assertEqual((ledger.total_tokens, ledger.cost), (10, 13))
        self.assertEqual(self.rows(ChatMessage), [])
        self.assertEqual(self.stream_calls, 1)

    def test_duplicate_completion_does_not_repeat_memory_message_or_ledger(self):
        self.play([sse(delta="complete"), self.usage()])
        row, = self.receipts()
        for _ in range(3):
            message = self.finish_again(row.id, content="must not replace", usage_payload={"total_tokens": 999})
            self.assertEqual(message.content, "complete")
        self.assertEqual(len(self.snapshot()[0]), 1)
        self.assertEqual(len(self.rows(UsageLedger)), 1)
        self.assertEqual(self.rows(UsageLedger)[0].total_tokens, 10)
        self.memory.assert_called_once()

    def test_concurrent_completion_claims_memory_only_once(self):
        receipt_id = completion.begin_reply(self.db, conversation_id=self.conversation_id, user_id=self.user_id,
                        user_name="synthetic", provider_id=self.ns["provider_profile_id"], provider_name="synthetic", model_name="synthetic")
        started = threading.Barrier(2)
        second_finished = threading.Event()
        writer = Mock(side_effect=lambda *args, **kwargs: second_finished.wait(.2))
        def finish():
            with self.sessions() as db:
                started.wait(timeout=2)
                result = completion.finish_reply(db, receipt_id, content="concurrent result", usage_payload={"total_tokens": 10},
                    usage_known=True, allow_delivery=True, user_id=self.user_id, user_message="question", record_memory=True,
                    memory_writer=writer, outcome="success")
                second_finished.set()
                return result
        with ThreadPoolExecutor(max_workers=2) as workers:
            results = list(workers.map(lambda _: finish(), range(2)))
        self.assertTrue(all(message is not None for message in results))
        self.assertEqual(results[0].id, results[1].id)
        self.assertEqual(len(self.snapshot()[0]), 1)
        self.assertEqual(len(self.rows(UsageLedger)), 1)
        writer.assert_called_once()

    def test_completion_ack_loss_is_confirmed_without_duplicate_messages(self):
        fired = []
        def lost(db):
            if not fired and any(isinstance(r, AuditLog) and r.details.get("state") == "completed" for r in db.identity_map.values()):
                fired.append(True)
                raise RuntimeError("synthetic completion ack lost")
        sa.event.listen(Session, "after_commit", lost)
        try:
            self.play([sse(delta="complete"), self.usage()])
        finally:
            sa.event.remove(Session, "after_commit", lost)
        self.assertTrue(fired)
        self.assertEqual(len(self.snapshot()[0]), 1)
        self.assertEqual(len(self.rows(UsageLedger)), 1)
        self.assertEqual(self.snapshot()[2].outcome, "success")

    def test_permanent_message_write_failure_retains_known_usage_and_stops_memory(self):
        def fail(db):
            if any(isinstance(r, AuditLog) and r.details.get("message_id") is not None and r.details.get("state") == "completed" for r in db.identity_map.values()):
                db.execute(self.guard.insert().values(id=1))
        sa.event.listen(Session, "before_commit", fail)
        try:
            chunks = self.play([sse(delta="complete"), self.usage()])
        finally:
            sa.event.remove(Session, "before_commit", fail)
        self.assertEqual(self.snapshot()[0], [])
        self.assertEqual(self.rows(UsageLedger)[0].total_tokens, 10)
        self.assertIn("chat_conversation_unavailable", "".join(chunks))
        self.memory.assert_not_called()

    def test_admission_database_failure_does_not_call_stream(self):
        with patch.object(completion, "begin_reply", side_effect=RuntimeError("synthetic admission unavailable")):
            chunks = self.play([])
        self.assertEqual(self.stream_calls, 0)
        self.assertEqual(self.snapshot()[0], [])
        self.assertEqual(self.receipts(), [])
        self.assertIn("chat_conversation_unavailable", "".join(chunks))

    def test_malformed_only_usage_is_unknown_and_plain_reply_stays_plain(self):
        self.play([sse(delta="complete"), sse(usage={"total_tokens": None, "prompt_tokens": "invalid"})])
        self.assertFalse(self.receipts()[0].details["usage_known"])
        self.assertEqual(self.rows(UsageLedger), [])
        self.assertEqual(self.snapshot()[0][0].content, "complete")

    def test_deleted_during_memory_does_not_recreate_reply_or_lose_known_usage(self):
        def deleted(db, **kwargs):
            self.delete_conversation()
            db.add(AgentMemoryEntry(user_id=self.user_id, conversation_id=self.conversation_id, content="must not persist", memory_type="summary"))
            db.flush()
        self.memory.side_effect = deleted
        chunks = self.play([sse(delta="complete"), self.usage()])
        self.assertEqual(self.rows(Conversation), [])
        self.assertEqual(self.rows(ChatMessage), [])
        self.assertEqual(self.rows(AgentMemoryEntry), [])
        self.assertEqual(self.rows(UsageLedger)[0].total_tokens, 10)
        self.assertEqual(self.receipts()[0].details["memory_status"], "failed")
        self.assertEqual(self.finalizations, [])
        self.assertIn("chat_conversation_unavailable", "".join(chunks))

    def test_lost_memory_ack_never_retries_already_committed_memory(self):
        def lost(db, **kwargs):
            db.add(AgentMemoryEntry(user_id=self.user_id, conversation_id=self.conversation_id, content="synthetic memory", memory_type="summary"))
            def ack(tx):
                raise RuntimeError("synthetic memory ack lost")
            sa.event.listen(db, "after_commit", ack, once=True)
        self.memory.side_effect = lost
        self.play([sse(delta="complete"), self.usage()])
        self.assertEqual(len(self.rows(AgentMemoryEntry)), 1)
        self.finish_again(self.receipts()[0].id)
        self.assertEqual(len(self.rows(AgentMemoryEntry)), 1)
        self.memory.assert_called_once()
        self.assertEqual(self.rows(UsageLedger)[0].total_tokens, 10)

    def test_lost_ledger_ack_is_confirmed_without_duplicate_cost(self):
        original = completion.record_chat_usage_ledger
        def lost(db, **kwargs):
            result = original(db, **kwargs)
            def ack(tx):
                raise RuntimeError("synthetic ledger ack lost")
            sa.event.listen(db, "after_commit", ack, once=True)
            return result
        with patch.object(completion, "record_chat_usage_ledger", side_effect=lost):
            self.play([sse(delta="complete"), self.usage()])
        row, = self.receipts()
        self.assertEqual(row.details["ledger_status"], "recorded")
        self.assertTrue(completion.settle_reply_usage(self.db, row.id))
        self.assertEqual(len(self.rows(UsageLedger)), 1)
        self.assertEqual(self.snapshot()[2].outcome, "success")

    def test_service_completion_preserves_healthy_callers_unsubmitted_title(self):
        original_title = self.rows(Conversation)[0].title
        conversation = self.db.get(Conversation, self.conversation_id)
        conversation.title = "unsubmitted caller title"
        receipt_id = completion.begin_reply(self.db, conversation_id=self.conversation_id, user_id=self.user_id,
                        user_name="synthetic", provider_id=self.ns["provider_profile_id"], provider_name="synthetic", model_name="synthetic")
        message = self.finish_again(receipt_id)
        self.assertIsNotNone(message)
        self.assertIn(conversation, self.db.dirty)
        self.assertEqual(conversation.title, "unsubmitted caller title")
        self.assertEqual(self.rows(Conversation)[0].title, original_title)
        self.db.rollback()
        self.assertEqual(self.rows(UsageLedger)[0].total_tokens, 10)

    def test_completion_db_outage_stops_without_claiming_zero_or_saving_memory(self):
        with patch.object(completion, "_write", side_effect=RuntimeError("synthetic unavailable")), \
                patch.object(completion, "_read_completed", side_effect=RuntimeError("synthetic unavailable")):
            chunks = self.play([sse(delta="complete"), self.usage()])
        row, = self.receipts()
        self.assertEqual(row.details["state"], "admitted")
        self.assertFalse(row.details["usage_known"])
        self.assertEqual(self.rows(UsageLedger), [])
        self.assertEqual(self.snapshot()[0], [])
        self.memory.assert_not_called()
        self.assertIn("chat_conversation_unavailable", "".join(chunks))

    def test_reused_message_integer_id_is_not_the_old_completed_reply(self):
        self.play([sse(delta="complete"), self.usage()])
        row, = self.receipts()
        message_id = row.details["message_id"]
        # Delete the dependent telemetry first, exactly within this temporary DB.
        self.db.execute(sa.delete(ChatTurnTelemetry))
        self.db.execute(sa.delete(ChatMessage).where(ChatMessage.id == message_id))
        self.db.add(ChatMessage(id=message_id, conversation_id=self.conversation_id, role="assistant", content="unrelated",
                               created_at=datetime(2000, 1, 1, tzinfo=timezone.utc)))
        self.db.commit()
        self.assertIsNone(self.finish_again(row.id))
        self.assertEqual(self.rows(UsageLedger)[0].total_tokens, 10)
        self.memory.assert_called_once()
