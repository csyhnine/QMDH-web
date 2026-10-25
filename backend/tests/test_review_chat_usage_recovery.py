"""R86e: real metadata-only recovery, two-table SQLite, CLI main with injected DB."""
import ast
import builtins
from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stderr, redirect_stdout
from copy import deepcopy
from datetime import datetime, timezone
import importlib.util
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import threading
import unittest
from unittest.mock import Mock, patch

import sqlalchemy as sa
from sqlalchemy.orm import Session, sessionmaker

from app.models import AuditLog, UsageLedger
from app.services import chat_usage_recovery_service as recovery

ROOT = Path(__file__).resolve().parents[2]


class ChatUsageRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory(prefix="r86e-offline-")))
        self.engine = sa.create_engine("sqlite:///" + (self.root / "recovery.db").as_posix())
        self.addCleanup(self.engine.dispose)
        # No content, users, provider or memory tables exist in this fixture.
        AuditLog.metadata.create_all(self.engine, tables=[AuditLog.__table__, UsageLedger.__table__])
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)
        self.db = self.sessions()
        self.addCleanup(self.db.close)
        spec = importlib.util.spec_from_file_location("r86e_cli", ROOT / "backend/scripts/recover_chat_usage.py")
        self.cli = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.cli)

    def create(self, event="chat.agent.call", **changes):
        details = {"call_id": "synthetic-call-" + str(len(self.rows(AuditLog)) + 1), "conversation_id": 101,
                   "conversation_user_id": 42, "provider_id": 9, "provider_name": "synthetic-provider",
                   "model_name": "synthetic-model", "state": "completed", "usage_known": True,
                   "usage": {"prompt_tokens": 7, "completion_tokens": 3, "total_tokens": 10, "input_tokens": 7,
                             "output_tokens": 3, "cached_input_tokens": 2, "uncached_input_tokens": 5},
                   "pricing": {"source": "provider_pricing_rules", "currency": "CNY", "rules": [
                       {"metric": metric, "unit_size": 1, "unit_price": price, "currency": "CNY"}
                       for metric, price in [("input_tokens", 1), ("output_tokens", 2), ("cached_input_tokens", .5)]]},
                   "completed_at": datetime(2024, 1, 1, tzinfo=timezone.utc).isoformat(), "until_message_id": 33,
                   "ledger_status": "pending", "memory_status": "skipped"}
        details.update(changes)
        row = AuditLog(event_type=event, actor_id=42, actor_name="synthetic-actor", target_id=101,
                       target_type="synthetic", details=details)
        self.db.add(row)
        self.db.commit()
        return row.id

    def rows(self, model):
        with self.sessions() as tx:
            return list(tx.scalars(sa.select(model).order_by(model.id)))

    def alter(self, receipt_id, change):
        with self.sessions() as tx:
            row = tx.get(AuditLog, receipt_id)
            details = deepcopy(row.details)
            change(details)
            row.details = details
            tx.commit()

    def cli_run(self, ids, *, apply=False, expect=None):
        args = [part for receipt_id in ids for part in ["--receipt-id", str(receipt_id)]]
        if apply:
            args.append("--apply")
        if expect is not None:
            args += ["--expect", expect]
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = self.cli.main(args, session_factory=self.sessions, stdout=out, stderr=err)
        return code, json.loads(out.getvalue()) if out.getvalue() else None, err.getvalue()

    def test_preview_is_read_only_for_all_three_kinds(self):
        ids = [self.create(event) for event in recovery.KINDS]
        before = [deepcopy(r.details) for r in self.rows(AuditLog)]
        writes = []
        def observe(conn, cursor, statement, parameters, context, many):
            if statement.lstrip().upper().startswith(("UPDATE", "INSERT", "DELETE")):
                writes.append(statement)
        sa.event.listen(self.engine, "before_cursor_execute", observe)
        try:
            code, report, err = self.cli_run(reversed(ids))
        finally:
            sa.event.remove(self.engine, "before_cursor_execute", observe)
        self.assertEqual((code, err, writes), (0, "", []))
        self.assertEqual([i["receipt_id"] for i in report["items"]], ids)
        self.assertEqual([i["cost"] for i in report["items"]], [12, 12, 12])
        self.assertEqual([(i["owner_id"], i["provider_id"]) for i in report["items"]], [(42, 9)] * 3)
        self.assertEqual([r.details for r in self.rows(AuditLog)], before)
        self.assertEqual(self.rows(UsageLedger), [])
        self.assertNotIn(str(self.root), json.dumps(report))

    def test_cli_apply_and_repeat_use_same_intent_without_duplicate_ledger(self):
        ids = [self.create(event) for event in recovery.KINDS]
        _, plan, _ = self.cli_run(ids)
        for _ in range(2):
            code, report, err = self.cli_run(ids, apply=True, expect=plan["digest"])
            self.assertEqual((code, report["unconfirmed"], err), (0, 0, ""))
        self.assertEqual(len(self.rows(UsageLedger)), 3)
        self.assertEqual(sum(r.cost for r in self.rows(UsageLedger)), 36)

    def test_unknown_incomplete_or_failed_receipt_blocks_whole_preflight(self):
        good = self.create()
        bad = [self.create(state="admitted"), self.create(state="failed"), self.create(usage_known=False)]
        for receipt_id in bad:
            code, report, _ = self.cli_run([good, receipt_id])
            self.assertEqual(code, 2)
            self.assertEqual(report["blocked"], 1)
            code, report, _ = self.cli_run([good, receipt_id], apply=True, expect=report["digest"])
            self.assertEqual((code, report["code"]), (2, "preflight_blocked"))
        self.assertEqual(self.rows(UsageLedger), [])

    def test_missing_or_unrelated_audit_row_is_never_repaired(self):
        unrelated = self.create(event="synthetic.unrelated", private_content="never print this")
        code, report, _ = self.cli_run([unrelated, 99999])
        self.assertEqual(code, 2)
        self.assertEqual({i["code"] for i in report["items"]}, {"unsupported_receipt", "receipt_missing"})
        self.assertNotIn("never print this", json.dumps(report))
        self.assertEqual(self.rows(UsageLedger), [])

    def test_changed_usage_rejects_stale_plan_without_writes(self):
        receipt_id = self.create()
        plan = recovery.recovery_plan(self.db, [receipt_id])
        self.alter(receipt_id, lambda d: d["usage"].update(total_tokens=11))
        report, code = recovery.apply_recovery_plan(self.db, [receipt_id], plan["digest"])
        self.assertEqual((code, report["code"]), (2, "stale_plan"))
        self.assertEqual(self.rows(UsageLedger), [])

    def test_changed_price_or_actor_rejects_stale_plan(self):
        receipt_id = self.create()
        plan = recovery.recovery_plan(self.db, [receipt_id])
        self.alter(receipt_id, lambda d: d["pricing"]["rules"][0].update(unit_price=99))
        self.assertEqual(recovery.apply_recovery_plan(self.db, [receipt_id], plan["digest"])[1], 2)
        plan = recovery.recovery_plan(self.db, [receipt_id])
        with self.sessions() as tx:
            tx.get(AuditLog, receipt_id).actor_id = 43
            tx.commit()
        self.assertEqual(recovery.apply_recovery_plan(self.db, [receipt_id], plan["digest"])[1], 2)
        self.assertEqual(self.rows(UsageLedger), [])

    def test_deleted_content_and_memory_changes_do_not_change_cost_intent(self):
        receipt_id = self.create(message_id=10)
        plan = recovery.recovery_plan(self.db, [receipt_id])
        self.alter(receipt_id, lambda d: d.update(message_id=None, memory_status="failed", private_extra="never publish"))
        code, report, err = self.cli_run([receipt_id], apply=True, expect=plan["digest"])
        self.assertEqual((code, err), (0, ""))
        self.assertEqual(self.rows(UsageLedger)[0].cost, 12)
        self.assertNotIn("never publish", json.dumps(report))
        self.assertNotIn("never publish", str(self.rows(UsageLedger)[0].usage_payload))

    def test_plan_is_bound_to_database_target(self):
        receipt_id = self.create()
        plan = recovery.recovery_plan(self.db, [receipt_id])
        other = sa.create_engine("sqlite:///" + (self.root / "other.db").as_posix())
        try:
            AuditLog.metadata.create_all(other, tables=[AuditLog.__table__, UsageLedger.__table__])
            row = self.rows(AuditLog)[0]
            with Session(other) as tx:
                tx.add(AuditLog(id=row.id, event_type=row.event_type, actor_id=row.actor_id, actor_name=row.actor_name, details=row.details))
                tx.commit()
                report, code = recovery.apply_recovery_plan(tx, [receipt_id], plan["digest"])
                self.assertEqual((code, report["code"]), (2, "stale_plan"))
                self.assertIsNone(tx.scalar(sa.select(UsageLedger)))
        finally:
            other.dispose()

    def test_old_source_id_check_accepts_wrong_call_but_new_settlement_rejects(self):
        receipt_id = self.create()
        self.assertTrue(recovery.settle_chat_usage_receipt(self.db, receipt_id, expected_event="chat.agent.call"))
        with self.sessions() as tx:
            ledger = tx.scalar(sa.select(UsageLedger))
            ledger.usage_payload = {**ledger.usage_payload, "call_id": "different-call"}
            tx.commit()
        path = ROOT / "docs/archive/f77-r86e-2026-10-25/original/backend/app/services/chat_agent_completion_service.py"
        fn = next(n for n in ast.parse(path.read_text(encoding="utf-8")).body if isinstance(n, ast.FunctionDef) and n.name == "settle_agent_call_usage")
        future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
        ns = {"_session": recovery._session, "_receipt": lambda tx, ident, lock=False: recovery._row(tx, ident, lock=lock),
              "select": sa.select, "UsageLedger": UsageLedger, "SOURCE": "chat_agent_calls", "record_chat_usage_ledger": Mock()}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[future, fn], type_ignores=[])), str(path), "exec"), ns)
        self.assertTrue(ns["settle_agent_call_usage"](self.db, receipt_id))
        self.assertFalse(recovery.settle_chat_usage_receipt(self.db, receipt_id, expected_event="chat.agent.call"))
        code, report, _ = self.cli_run([receipt_id])
        self.assertEqual((code, report["items"][0]["code"]), (2, "ledger_conflict"))
        self.assertEqual(self.rows(UsageLedger)[0].usage_payload["call_id"], "different-call")

    def test_existing_amount_conflict_is_blocked_without_overwrite(self):
        receipt_id = self.create()
        recovery.settle_chat_usage_receipt(self.db, receipt_id, expected_event="chat.agent.call")
        with self.sessions() as tx:
            tx.scalar(sa.select(UsageLedger)).cost = 999
            tx.commit()
        code, report, _ = self.cli_run([receipt_id])
        self.assertEqual((code, report["blocked"]), (2, 1))
        self.assertFalse(recovery.settle_chat_usage_receipt(self.db, receipt_id, expected_event="chat.agent.call"))
        self.assertEqual(self.rows(UsageLedger)[0].cost, 999)

    def test_malformed_metadata_is_blocked_with_static_reason(self):
        mutations = [lambda d: d.update(usage="private bad data"), lambda d: d["usage"].update(total_tokens=True),
                     lambda d: d.update(pricing=[]), lambda d: d["pricing"]["rules"][0].update(unit_price=float("inf")),
                     lambda d: d.update(completed_at="secret invalid timestamp")]
        for mutate in mutations:
            receipt_id = self.create()
            self.alter(receipt_id, mutate)
            code, report, _ = self.cli_run([receipt_id])
            self.assertEqual(code, 2)
            self.assertEqual(report["items"][0]["status"], "blocked")
            self.assertNotIn("private bad data", json.dumps(report))
            self.assertNotIn("secret invalid", json.dumps(report))
        self.assertEqual(self.rows(UsageLedger), [])

    def test_writer_that_does_not_create_ledger_cannot_claim_recorded(self):
        receipt_id = self.create()
        plan = recovery.recovery_plan(self.db, [receipt_id])
        with patch.object(recovery, "record_chat_usage_ledger", return_value=None):
            report, code = recovery.apply_recovery_plan(self.db, [receipt_id], plan["digest"])
        self.assertEqual((code, report["unconfirmed"]), (1, 1))
        self.assertEqual(self.rows(UsageLedger), [])
        self.assertEqual(self.rows(AuditLog)[0].details["ledger_status"], "pending")

    def test_partial_failure_is_reported_and_retry_does_not_duplicate_success(self):
        first, second = self.create(), self.create()
        plan = recovery.recovery_plan(self.db, [first, second])
        original = recovery.record_chat_usage_ledger
        def fail_second(db, **kwargs):
            if kwargs["message"].id == second:
                raise RuntimeError("synthetic second failed")
            return original(db, **kwargs)
        with patch.object(recovery, "record_chat_usage_ledger", side_effect=fail_second):
            report, code = recovery.apply_recovery_plan(self.db, [first, second], plan["digest"])
        self.assertEqual((code, report["unconfirmed"]), (1, 1))
        self.assertEqual(len(self.rows(UsageLedger)), 1)
        self.assertEqual(recovery.apply_recovery_plan(self.db, [first, second], plan["digest"])[1], 0)
        self.assertEqual(len(self.rows(UsageLedger)), 2)
        self.assertEqual(sum(r.cost for r in self.rows(UsageLedger)), 24)

    def test_change_after_preflight_is_rechecked_under_receipt_lock(self):
        receipt_id = self.create()
        plan = recovery.recovery_plan(self.db, [receipt_id])
        original = recovery.settle_chat_usage_receipt
        def change(db, ident, **kwargs):
            self.alter(ident, lambda d: d["usage"].update(total_tokens=99))
            return original(db, ident, **kwargs)
        with patch.object(recovery, "settle_chat_usage_receipt", side_effect=change):
            report, code = recovery.apply_recovery_plan(self.db, [receipt_id], plan["digest"])
        self.assertEqual((code, report["unconfirmed"]), (1, 1))
        self.assertEqual(self.rows(UsageLedger), [])

    def test_concurrent_apply_has_one_matching_ledger(self):
        receipt_id = self.create()
        plan = recovery.recovery_plan(self.db, [receipt_id])
        barrier = threading.Barrier(2)
        def apply():
            with self.sessions() as db:
                barrier.wait(timeout=2)
                return recovery.apply_recovery_plan(db, [receipt_id], plan["digest"])[1]
        with ThreadPoolExecutor(max_workers=2) as workers:
            codes = list(workers.map(lambda _: apply(), range(2)))
        self.assertEqual(codes, [0, 0])
        self.assertEqual(len(self.rows(UsageLedger)), 1)
        self.assertEqual(self.rows(UsageLedger)[0].cost, 12)

    def test_lost_commit_ack_is_confirmed_by_full_identity_and_amount(self):
        receipt_id = self.create()
        original = recovery.record_chat_usage_ledger
        def lost(db, **kwargs):
            result = original(db, **kwargs)
            def ack(tx):
                raise RuntimeError("synthetic ack lost")
            sa.event.listen(db, "after_commit", ack, once=True)
            return result
        with patch.object(recovery, "record_chat_usage_ledger", side_effect=lost) as writer:
            self.assertTrue(recovery.settle_chat_usage_receipt(self.db, receipt_id, expected_event="chat.agent.call"))
            writer.assert_called_once()
        self.assertEqual(len(self.rows(UsageLedger)), 1)

    def test_zero_unpriced_and_foreign_currency_keep_original_contract(self):
        zero = self.create(usage={key: 0 for key in recovery.COUNTERS})
        free = self.create(pricing={"source": "unpriced_chat", "currency": "CNY", "rules": []})
        foreign = self.create()
        def usd(d):
            d["pricing"]["currency"] = "USD"
            for rule in d["pricing"]["rules"]:
                rule["currency"] = "USD"
        self.alter(foreign, usd)
        plan = recovery.recovery_plan(self.db, [zero, free, foreign])
        self.assertEqual([i["currency"] for i in plan["items"]], ["CNY", "CNY", "USD"])
        self.assertEqual(recovery.apply_recovery_plan(self.db, [zero, free, foreign], plan["digest"])[1], 0)
        self.assertEqual([r.cost for r in self.rows(UsageLedger)], [0, 0, 12])
        self.assertEqual(self.rows(UsageLedger)[-1].cost_currency, "USD")

    def test_invalid_cli_args_and_help_never_open_database(self):
        factory = Mock(side_effect=AssertionError("database must not open"))
        cases = [["--receipt-id", "0"], ["--receipt-id", "1", "--receipt-id", "1"],
                 ["--receipt-id", "1", "--apply"], ["--receipt-id", "1", "--expect", "a" * 64],
                 ["--receipt-id", "1", "--apply", "--expect", "bad"], ["--receipt-id", "2147483648"]]
        for args in cases:
            with redirect_stderr(io.StringIO()):
                self.assertEqual(self.cli.main(args, session_factory=factory, stderr=io.StringIO()), 2)
        with redirect_stdout(io.StringIO()):
            self.assertEqual(self.cli.main(["--help"], session_factory=factory), 0)
        factory.assert_not_called()

    def test_cli_runtime_error_prints_no_database_url_or_private_exception(self):
        out, err = io.StringIO(), io.StringIO()
        with patch.object(recovery, "recovery_plan", side_effect=RuntimeError("postgresql://private:secret@private-host/private-db")):
            code = self.cli.main(["--receipt-id", "1"], session_factory=self.sessions, stdout=out, stderr=err)
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(err.getvalue()), {"code": "database_operation_unavailable"})
        self.assertNotIn("secret", out.getvalue() + err.getvalue())

    def test_cli_recovery_imports_no_sdk_and_reads_no_content_tables(self):
        ids = [self.create(event) for event in recovery.KINDS]
        importer = builtins.__import__
        def guarded(name, *args, **kwargs):
            if name.startswith("app.integrations") or name.endswith("agent_memory_service"):
                raise AssertionError("recovery must not import provider or memory")
            return importer(name, *args, **kwargs)
        def sql_guard(conn, cursor, statement, parameters, context, many):
            upper = statement.upper()
            if any(name in upper for name in ("CHAT_MESSAGES", "CONVERSATIONS", "AGENT_MEMORY", "PROVIDER_PROFILES")):
                raise AssertionError("recovery must not read content or live provider configuration")
        sa.event.listen(self.engine, "before_cursor_execute", sql_guard)
        try:
            with patch.object(builtins, "__import__", side_effect=guarded):
                code, plan, _ = self.cli_run(ids)
                self.assertEqual(code, 0)
                self.assertEqual(self.cli_run(ids, apply=True, expect=plan["digest"])[0], 0)
        finally:
            sa.event.remove(self.engine, "before_cursor_execute", sql_guard)

    def test_receipt_id_bounds_and_expected_kind_are_enforced(self):
        receipt_id = self.create()
        for ids in [[], [receipt_id, receipt_id], [0], [True], list(range(1, 52))]:
            with self.assertRaises(ValueError):
                recovery.recovery_plan(self.db, ids)
        self.assertFalse(recovery.settle_chat_usage_receipt(self.db, receipt_id, expected_event="chat.reply.call"))
        self.assertEqual(self.rows(UsageLedger), [])

    def test_existing_month_ownership_and_entry_contract_conflicts_are_blocked(self):
        for field, value in [("recorded_at", datetime(2025, 1, 1, tzinfo=timezone.utc)), ("user_id", 43),
                             ("cost_currency", "USD"), ("total_tokens", 99), ("entry_type", "task.completed")]:
            receipt_id = self.create()
            self.assertTrue(recovery.settle_chat_usage_receipt(self.db, receipt_id, expected_event="chat.agent.call"))
            with self.sessions() as tx:
                ledger = tx.scalar(sa.select(UsageLedger).where(UsageLedger.source_table == "chat_agent_calls", UsageLedger.source_id == receipt_id))
                setattr(ledger, field, value)
                tx.commit()
            code, report, _ = self.cli_run([receipt_id])
            self.assertEqual((code, report["items"][0]["status"]), (2, "blocked"), field)
            self.assertFalse(recovery.settle_chat_usage_receipt(self.db, receipt_id, expected_event="chat.agent.call"))

    def test_call_already_recorded_under_another_kind_is_not_charged_again(self):
        receipt_id = self.create()
        self.assertTrue(recovery.settle_chat_usage_receipt(self.db, receipt_id, expected_event="chat.agent.call"))
        with self.sessions() as tx:
            tx.get(AuditLog, receipt_id).event_type = "chat.reply.call"
            tx.commit()
        code, report, _ = self.cli_run([receipt_id])
        self.assertEqual((code, report["items"][0]["status"]), (2, "blocked"))
        self.assertFalse(recovery.settle_chat_usage_receipt(self.db, receipt_id, expected_event="chat.reply.call"))
        self.assertEqual(len(self.rows(UsageLedger)), 1)
