"""R86b: real receipt/message/ledger transactions, no SDK or provider calls."""
import ast
import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import importlib.util
from datetime import datetime, timezone
import json
import threading
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock, patch

import sqlalchemy as sa
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.models import AuditLog, ChatMessage, Conversation, ProviderPricingRule, ProviderProfile, UsageLedger
from app.services.billing import calculate_chat_billing, normalize_chat_usage
from app.services.chat_context import apply_message_input_tokens
from app.services.usage_ledger import record_chat_usage_ledger
from tests.test_review_agent_memory_completion import AgentMemoryCompletionTests, BACKEND, TimerOnlyLoop, definitions


class AgentCompletionReceiptTests(AgentMemoryCompletionTests):
    def setUp(self):
        super().setUp()
        AuditLog.metadata.create_all(self.engine, tables=[AuditLog.__table__, UsageLedger.__table__, ProviderPricingRule.__table__])
        self.provider = ProviderProfile(provider_name="synthetic-provider", api_key="unused", base_url="https://invalid.invalid",
                                        model_name="synthetic", capabilities=["chat.completions"])
        self.db.add(self.provider)
        self.db.flush()
        self.provider_id = self.provider.id
        self.db.add_all([ProviderPricingRule(provider_profile_id=self.provider_id, capability="chat.completions",
                        metric=metric, unit_size=1, unit_price=price, currency="CNY", is_active=True)
                        for metric, price in [("input_tokens", 1), ("output_tokens", 2), ("cached_input_tokens", 0.5)]])
        self.db.commit()
        self.service = ModuleType("app.services.chat_agent_completion_service")
        ns = self.service.__dict__
        ns.update(datetime=datetime, timezone=timezone, SimpleNamespace=SimpleNamespace, select=sa.select,
                  Connection=Connection, Session=Session, AuditLog=AuditLog, ChatMessage=ChatMessage,
                  Conversation=Conversation, UsageLedger=UsageLedger, normalize_chat_usage=normalize_chat_usage,
                  calculate_chat_billing=calculate_chat_billing,
                  apply_message_input_tokens=apply_message_input_tokens, record_chat_usage_ledger=record_chat_usage_ledger,
                  EVENT="chat.agent.call", SOURCE="chat_agent_calls", json=json)
        definitions("app/services/chat_agent_service.py", {"embed_agent_message_meta"}, ns)
        tree = ast.parse((BACKEND / "app/services/chat_agent_completion_service.py").read_text(encoding="utf-8"))
        definitions("app/services/chat_agent_completion_service.py", {n.name for n in tree.body if isinstance(n, ast.FunctionDef)}, ns)
        self.enterContext(patch.dict("sys.modules", {self.service.__name__: self.service}))

    def run_harness(self, **kwargs):
        return super().run_harness(provider_id=self.provider_id, **kwargs)

    def rows(self, model):
        with self.sessions() as db:
            return list(db.scalars(sa.select(model).order_by(model.id)))

    def receipt(self, result):
        receipt_id = result.audit_details["call_receipt_id"]
        return next(r for r in self.rows(AuditLog) if r.id == receipt_id)

    def test_receipt_and_reply_are_durable_before_memory_runs(self):
        def check(db, row):
            self.assertEqual(self.count(ChatMessage), 1)
            self.assertEqual(self.count(UsageLedger), 1)
            receipt, = self.rows(AuditLog)
            self.assertEqual(receipt.details["state"], "completed")
            self.assertEqual(receipt.details["usage"]["total_tokens"], 120)
        self.memory_fault = check
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual(result.memory_status, "completed")
        ledger, = self.rows(UsageLedger)
        self.assertEqual((ledger.source_table, ledger.source_id), ("chat_agent_calls", self.receipt(result).id))
        self.assertEqual((ledger.total_tokens, ledger.cached_input_tokens, ledger.cost), (120, 15, 142.5))
        message, = self.rows(ChatMessage)
        self.assertIn(self.reply.text, message.content)
        self.assertIn("synthetic-accepted", message.content)
        self.assertGreater(message.estimated_input_tokens, 0)

    def test_memory_failure_keeps_durable_reply_and_known_priced_usage(self):
        self.memory_fault = lambda db, row: setattr(row, "conversation_id", 999999)
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual(result.memory_status, "failed")
        self.assertEqual(self.count(ChatMessage), 1)
        ledger, = self.rows(UsageLedger)
        self.assertEqual((ledger.total_tokens, ledger.cost), (120, 142.5))

    def test_deleted_during_model_keeps_only_content_free_receipt_and_usage(self):
        def complete(*args, **kwargs):
            self.delete_conversation()
            return self.reply
        self.model.side_effect = complete
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual(result.delivery_status, "revoked")
        self.assertEqual(self.count(ChatMessage), 0)
        self.assertEqual(self.count(Conversation), 0)
        self.assertEqual(self.count(UsageLedger), 1)
        details = self.receipt(result).details
        self.assertIsNone(details["message_id"])
        self.assertNotIn(self.reply.text, json.dumps(details))
        self.assertNotIn("synthetic user input", json.dumps(details))
        self.assertNotIn("synthetic-accepted", json.dumps(details))
        self.writer.assert_not_called()

    def test_delete_after_completion_removes_reply_but_keeps_known_consumption(self):
        result = self.run_harness()
        self.delete_conversation()
        self.assertEqual(self.count(ChatMessage), 0)
        self.assertEqual(self.count(UsageLedger), 1)
        self.assertTrue(self.service.settle_agent_call_usage(self.db, self.receipt(result).id))
        self.assertEqual(self.count(ChatMessage), 0)
        self.assertEqual(self.count(UsageLedger), 1)

    def test_duplicate_completion_and_settlement_never_duplicate_messages_or_cost(self):
        result = self.run_harness()
        receipt_id = self.receipt(result).id
        for _ in range(3):
            self.service.complete_agent_call(self.db, receipt_id, self.reply, thinking_steps=[])
            self.assertTrue(self.service.settle_agent_call_usage(self.db, receipt_id))
        self.assertEqual(self.count(ChatMessage), 1)
        ledger, = self.rows(UsageLedger)
        self.assertEqual(ledger.cost, 142.5)
        self.assertEqual(self.model.call_count, 1)

    def test_distinct_model_calls_each_have_one_receipt_and_one_ledger(self):
        first, second = self.run_harness(), self.run_harness()
        self.assertNotEqual(first.call_id, second.call_id)
        self.assertEqual(self.count(AuditLog), 2)
        self.assertEqual(self.count(UsageLedger), 2)
        self.assertEqual(self.count(ChatMessage), 2)
        self.assertEqual(sum(r.total_tokens for r in self.rows(UsageLedger)), 240)

    def test_billing_failure_keeps_known_usage_and_recovers_without_model_or_content_retry(self):
        original = self.service.record_chat_usage_ledger
        self.service.record_chat_usage_ledger = Mock(side_effect=RuntimeError("synthetic ledger failure"))
        result = self.run_harness()
        self.assertEqual(result.audit_details["usage_ledger_status"], "pending")
        self.assertEqual(self.count(ChatMessage), 1)
        self.assertEqual(self.count(UsageLedger), 0)
        receipt = self.receipt(result)
        self.assertEqual(receipt.details["usage"]["total_tokens"], 120)
        self.delete_conversation()
        self.service.record_chat_usage_ledger = original
        self.assertTrue(self.service.settle_agent_call_usage(self.db, receipt.id))
        self.assertEqual(self.count(ChatMessage), 0)
        ledger, = self.rows(UsageLedger)
        self.assertEqual((ledger.total_tokens, ledger.cost), (120, 142.5))
        self.assertEqual(self.model.call_count, 1)

    def test_arbitrary_usage_content_is_never_copied_to_receipt_or_ledger(self):
        self.reply.usage_payload["raw_response"] = "secret synthetic model body"
        self.reply.usage_payload["nested"] = {"prompt": "secret synthetic prompt"}
        self.reply.usage_payload.update(total_tokens=0, prompt_tokens="invalid", cached_input_tokens=0)
        result = self.run_harness()
        text = json.dumps([self.receipt(result).details, self.rows(UsageLedger)[0].usage_payload])
        self.assertNotIn("secret synthetic", text)
        self.assertEqual(self.receipt(result).details["usage"]["total_tokens"], 120)
        self.assertEqual((self.rows(UsageLedger)[0].prompt_tokens, self.rows(UsageLedger)[0].cached_input_tokens), (90, 15))

    def test_model_error_has_unknown_usage_and_no_zero_ledger(self):
        self.model.side_effect = RuntimeError("private synthetic model error")
        with self.assertRaisesRegex(RuntimeError, "private synthetic"):
            self.run_harness()
        receipt, = self.rows(AuditLog)
        self.assertEqual(receipt.details["state"], "failed")
        self.assertFalse(receipt.details["usage_known"])
        self.assertNotIn("private synthetic", json.dumps(receipt.details))
        self.assertFalse(self.service.settle_agent_call_usage(self.db, receipt.id))
        self.assertEqual(self.count(UsageLedger), 0)
        self.assertEqual(self.count(ChatMessage), 0)

    def test_admission_failure_stops_before_model_and_tools(self):
        self.service.start_agent_call = Mock(side_effect=RuntimeError("synthetic admission unavailable"))
        with self.assertRaisesRegex(RuntimeError, "admission"):
            self.run_harness()
        self.model.assert_not_called()
        self.writer.assert_not_called()
        self.assertEqual(self.count(UsageLedger), 0)

    def test_none_user_still_has_known_usage_and_skips_memory(self):
        result = self.run_harness(user_id=None)
        self.assertEqual(result.memory_status, "skipped")
        self.assertIsNone(self.receipt(result).actor_id)
        self.assertEqual(self.rows(UsageLedger)[0].total_tokens, 120)
        self.assertEqual(self.rows(UsageLedger)[0].user_id, self.user_id)  # Original conversation-owner fallback.
        self.writer.assert_not_called()
        def complete(*args, **kwargs):
            self.delete_conversation()
            return self.reply
        self.model.side_effect = complete
        deleted = self.run_harness(user_id=None)
        self.assertEqual(deleted.delivery_status, "revoked")
        self.assertEqual(self.rows(UsageLedger)[-1].user_id, self.user_id)
        self.assertEqual(sum(row.total_tokens for row in self.rows(UsageLedger)), 240)
        self.assertEqual(self.count(ChatMessage), 0)

    def test_message_flush_fk_failure_still_persists_known_usage_metadata(self):
        fired = []
        def fail_message(session, context, instances):
            for row in session.new:
                if isinstance(row, ChatMessage) and not fired:
                    fired.append(True)
                    row.conversation_id = 999999
        sa.event.listen(Session, "before_flush", fail_message)
        try:
            result = self.run_harness()
        finally:
            sa.event.remove(Session, "before_flush", fail_message)
        self.assert_completed(result)
        self.assertEqual(result.delivery_status, "unverified")
        self.assertEqual(self.count(ChatMessage), 0)
        self.assertEqual(self.rows(UsageLedger)[0].total_tokens, 120)
        self.assertEqual(self.receipt(result).details["usage"]["total_tokens"], 120)
        self.writer.assert_not_called()

    def test_lost_completion_ack_reads_existing_success_without_duplicate_content(self):
        fired = []
        def lose_ack(session):
            if not fired and any(isinstance(r, AuditLog) and r.details.get("state") == "completed" for r in session.identity_map.values()):
                fired.append(True)
                raise RuntimeError("synthetic completion ack lost")
        sa.event.listen(Session, "after_commit", lose_ack)
        try:
            result = self.run_harness()
        finally:
            sa.event.remove(Session, "after_commit", lose_ack)
        self.assertTrue(fired)
        self.assertEqual(result.delivery_status, "ready")
        self.assertEqual(self.count(ChatMessage), 1)
        self.assertEqual(self.count(UsageLedger), 1)

    def test_lost_ledger_ack_is_confirmed_by_unique_source_read(self):
        original = self.service.record_chat_usage_ledger
        def ledger(db, **kwargs):
            result = original(db, **kwargs)
            sa.event.listen(db, "after_commit", lambda session: (_ for _ in ()).throw(RuntimeError("synthetic ledger ack lost")), once=True)
            return result
        self.service.record_chat_usage_ledger = ledger
        result = self.run_harness()
        self.assertEqual(result.audit_details["usage_ledger_status"], "recorded")
        self.assertEqual(self.count(UsageLedger), 1)
        self.assertTrue(self.service.settle_agent_call_usage(self.db, self.receipt(result).id))
        self.assertEqual(self.count(UsageLedger), 1)

    def test_completion_db_outage_stops_delivery_and_memory_without_zero_usage_claim(self):
        self.service._store_completed = Mock(side_effect=RuntimeError("synthetic unavailable"))
        self.service._read_completed = Mock(side_effect=RuntimeError("synthetic unavailable"))
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual(result.delivery_status, "unverified")
        self.assertEqual(self.count(UsageLedger), 0)
        self.assertEqual(self.receipt(result).details["state"], "admitted")
        self.assertFalse(self.receipt(result).details["usage_known"])
        self.writer.assert_not_called()

    def test_original_harness_has_no_durable_completion_but_current_path_does(self):
        path = BACKEND.parent / "docs/archive/f74-r86b-2026-10-25/original/backend/app/services/agent_harness_service.py"
        source = ast.parse(path.read_text(encoding="utf-8"))
        funcs = [n for n in source.body if isinstance(n, ast.FunctionDef)]
        previous = self.module.__dict__.copy()
        future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
        exec(compile(ast.fix_missing_locations(ast.Module(body=[future, *funcs], type_ignores=[])), str(path), "exec"), previous)
        self.memory_fault = lambda db, row: setattr(row, "conversation_id", 999999)
        original_result = previous["run_chat_agent_harness"](self.db, recent_messages=[], new_content="synthetic", user_name="synthetic",
                    user_id=self.user_id, conversation_id=self.conv_id, provider_id=self.provider_id, policy_version=None)
        self.assertEqual(original_result.reply.total_tokens, 120)
        self.assertEqual(self.count(ChatMessage), 0)
        self.assertEqual(self.count(UsageLedger), 0)
        self.model.reset_mock()
        result = self.run_harness()
        self.assert_completed(result)
        self.assertEqual(self.count(ChatMessage), 1)
        self.assertEqual(self.count(UsageLedger), 1)

    def test_changed_price_does_not_reprice_a_settled_actual_call(self):
        result = self.run_harness()
        self.db.execute(sa.update(ProviderPricingRule).values(unit_price=999))
        self.db.commit()
        self.assertTrue(self.service.settle_agent_call_usage(self.db, self.receipt(result).id))
        self.assertEqual(self.rows(UsageLedger)[0].cost, 142.5)

    def test_pending_ledger_recovers_with_original_call_prices_after_rules_change(self):
        original = self.service.record_chat_usage_ledger
        self.service.record_chat_usage_ledger = Mock(side_effect=RuntimeError("synthetic pending write"))
        result = self.run_harness()
        self.db.execute(sa.update(ProviderPricingRule).values(unit_price=999))
        self.db.commit()
        self.service.record_chat_usage_ledger = original
        self.assertTrue(self.service.settle_agent_call_usage(self.db, self.receipt(result).id))
        self.assertEqual(self.rows(UsageLedger)[0].cost, 142.5)

    def test_receipted_route_reuses_saved_reply_without_second_audit_message_or_ledger(self):
        result = self.run_harness()
        with asyncio.Runner(loop_factory=TimerOnlyLoop) as runner:
            output, effects, finalized, db = runner.run(self.consume_route("ready", result, self.db))
        self.assertEqual([e[0] for e in effects], ["telemetry", "stream"])
        self.assertTrue(finalized["done"])
        self.assertIn(self.reply.text, "".join(output))
        self.assertEqual(self.count(ChatMessage), 1)
        self.assertEqual(self.count(AuditLog), 1)
        self.assertEqual(self.count(UsageLedger), 1)

    def test_delete_before_route_read_rejects_stale_reply_without_losing_ledger(self):
        result = self.run_harness()
        self.delete_conversation()
        with asyncio.Runner(loop_factory=TimerOnlyLoop) as runner:
            output, effects, finalized, db = runner.run(self.consume_route("ready", result, self.db))
        self.assertEqual(effects, [])
        self.assertTrue(finalized["done"])
        self.assertNotIn(self.reply.text, "".join(output))
        self.assertEqual(self.count(ChatMessage), 0)
        self.assertEqual(self.rows(UsageLedger)[0].total_tokens, 120)

    def test_reused_message_integer_id_cannot_deliver_a_deleted_call(self):
        result = self.run_harness()
        message_id = self.receipt(result).details["message_id"]
        self.db.execute(sa.delete(ChatMessage).where(ChatMessage.id == message_id))
        self.db.add(ChatMessage(id=message_id, conversation_id=self.conv_id, role="assistant", content="unrelated synthetic reply"))
        self.db.commit()
        found = self.service.load_agent_completion_message(self.db, receipt_id=self.receipt(result).id,
                    call_id=result.call_id, conversation_id=self.conv_id)
        self.assertIsNone(found)
        with asyncio.Runner(loop_factory=TimerOnlyLoop) as runner:
            output, effects, finalized, db = runner.run(self.consume_route("ready", result, self.db))
        self.assertEqual(effects, [])
        self.assertNotIn(self.reply.text, "".join(output))

    def test_cancelled_waiter_does_not_cancel_thread_completion_receipt(self):
        entered, release, finished = threading.Event(), threading.Event(), threading.Event()
        def model(*args, **kwargs):
            entered.set()
            if not release.wait(2):
                raise AssertionError("synthetic release timeout")
            return self.reply
        self.model.side_effect = model
        def worker():
            try:
                return self.run_harness()
            finally:
                finished.set()
        async def cancel_waiter():
            task = asyncio.create_task(asyncio.to_thread(worker))
            while not entered.is_set():
                await asyncio.sleep(0.001)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            release.set()
            while not finished.is_set():
                await asyncio.sleep(0.001)
        try:
            with asyncio.Runner(loop_factory=TimerOnlyLoop) as runner:
                runner.run(cancel_waiter())
        finally:
            release.set()
        self.assertTrue(finished.is_set())
        self.assertEqual(self.model.call_count, 1)
        self.assertEqual(self.count(ChatMessage), 1)
        self.assertEqual(self.rows(UsageLedger)[0].total_tokens, 120)

    def test_completion_commit_unique_failure_falls_back_to_content_free_known_usage(self):
        fired = []
        def fail_commit(session):
            if not fired and any(isinstance(r, AuditLog) and r.details.get("state") == "completed" for r in session.identity_map.values()):
                fired.append(True)
                session.execute(self.guard.insert().values(id=1))
        sa.event.listen(Session, "before_commit", fail_commit)
        try:
            result = self.run_harness()
        finally:
            sa.event.remove(Session, "before_commit", fail_commit)
        self.assertTrue(fired)
        self.assert_completed(result)
        self.assertEqual(result.delivery_status, "unverified")
        self.assertEqual(self.count(ChatMessage), 0)
        self.assertEqual(self.rows(UsageLedger)[0].total_tokens, 120)
        self.assertNotIn(self.reply.text, json.dumps(self.receipt(result).details))

    def test_model_base_exception_does_not_claim_completed_or_known_zero_usage(self):
        self.model.side_effect = asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError):
            self.run_harness()
        row, = self.rows(AuditLog)
        self.assertEqual(row.details["state"], "failed")
        self.assertFalse(row.details["usage_known"])
        self.assertEqual(self.count(UsageLedger), 0)

    def test_unreported_usage_on_success_is_unknown_instead_of_a_zero_ledger(self):
        self.reply = replace(self.reply, prompt_tokens=0, completion_tokens=0, total_tokens=0,
                             cached_input_tokens=0, usage_payload={"source": "synthetic-no-counters"})
        self.model.return_value = self.reply
        result = self.run_harness()
        receipt = self.receipt(result)
        self.assertEqual(receipt.details["state"], "completed")
        self.assertFalse(receipt.details["usage_known"])
        self.assertEqual(result.audit_details["usage_ledger_status"], "unknown")
        self.assertEqual(self.count(UsageLedger), 0)
        self.assertEqual(self.count(ChatMessage), 1)
        self.assertFalse(self.service.settle_agent_call_usage(self.db, receipt.id))

    def test_receipt_and_completion_do_not_commit_caller_unsubmitted_changes(self):
        self.user.name = "caller draft before actual model"
        result = self.run_harness()
        self.assert_completed(result)
        self.assertIn(self.user, self.db.dirty)
        with self.sessions() as other:
            self.assertEqual(other.get(type(self.user), self.user_id).name, "r86-synthetic")
        self.db.rollback()
        self.assertEqual(self.count(ChatMessage), 1)
        self.assertEqual(self.count(UsageLedger), 1)

    def test_concurrent_pending_settlement_has_one_unique_ledger(self):
        original = self.service.record_chat_usage_ledger
        self.service.record_chat_usage_ledger = Mock(side_effect=RuntimeError("synthetic pending"))
        result = self.run_harness()
        self.service.record_chat_usage_ledger = original
        receipt_id = self.receipt(result).id
        barrier = threading.Barrier(2)
        def settle():
            with self.sessions() as caller:
                barrier.wait(timeout=2)
                return self.service.settle_agent_call_usage(caller, receipt_id)
        with ThreadPoolExecutor(max_workers=2) as workers:
            outcomes = list(workers.map(lambda _: settle(), range(2)))
        self.assertTrue(any(outcomes))
        self.assertEqual(self.count(UsageLedger), 1)
        self.assertEqual(self.rows(UsageLedger)[0].cost, 142.5)
        self.assertEqual(self.model.call_count, 1)

    def test_module_import_and_existing_meta_parser_work_without_provider_sdk(self):
        agent = ModuleType("app.integrations.studio_agent.agent")
        agent.ChatAgentToolCall = type(self.reply.tool_calls[0])
        agent.StudioAgentReply = type(self.reply)
        with patch.dict("sys.modules", {agent.__name__: agent}):
            path = BACKEND / "app/services/chat_agent_completion_service.py"
            spec = importlib.util.spec_from_file_location("r86b_imported_service", path)
            service = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(service)
            receipt_id = service.start_agent_call(self.db, call_id="synthetic-import-call", conversation_id=self.conv_id,
                        user_id=self.user_id, user_name="synthetic", provider_id=self.provider_id)
            result = service.complete_agent_call(self.db, receipt_id, self.reply, thinking_steps=[])
            from app.services.chat_agent_service import parse_agent_message_meta
            message = self.rows(ChatMessage)[0]
            self.assertEqual(parse_agent_message_meta(message.content).visible_content, self.reply.text)
            self.assertEqual(result["usage_ledger_status"], "recorded")
            self.assertEqual(self.rows(UsageLedger)[0].cost, 142.5)
