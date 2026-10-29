"""R18-B: real monthly ledger guard and existing submission callers, offline only."""
import ast
import asyncio
from datetime import datetime, timezone
import hashlib
import json
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from fastapi import Depends, HTTPException
from sqlalchemy import delete, func, select

from app.models import ChatMessage, Conversation, DataClassification, Project, ProviderCall, ProviderProfile, Task, TaskDispatch, TaskStatus, UsageLedger, User, Workflow
from app.services import billing
from app.services.submission_idempotency import submit_once
from tests.test_review_agent_dispatch import BACKEND, load_functions
from tests.test_review_chat_partial_stream import TimerOnlyLoop
from tests.test_review_dashboard_currencies import DashboardCurrencyTests


class QuotaCurrencyGuardTests(unittest.TestCase):
    add = DashboardCurrencyTests.add

    def setUp(self):
        # Reuse fixture construction, without inheriting/rediscovering F25 tests.
        DashboardCurrencyTests.setUp(self)
        self.user = self.db.get(User, self.ids[0])
        self.user.quota_policy = "hard_block"
        self.user.monthly_quota = 500
        self.db.commit()

    def used(self, **kwargs):
        return billing.current_month_cost_for_user(self.db, user_id=self.user.id, now=kwargs.get("now", self.now))

    def enforce(self, db=None, *, user=None):
        return billing.enforce_user_quota(db or self.db, user=user or self.user, now=self.now)

    def clear(self):
        self.db.execute(delete(UsageLedger))
        self.db.commit()

    def test_cny_task_chat_cost_is_comparable_without_duplicate_provider_charge(self):
        self.assertEqual(self.used(), 0)
        self.enforce()
        self.add(100, "CNY")
        self.add(10, " cny ", entry_type="chat.message.completed")
        self.add(0, "")
        self.add(999, "USD", entry_type="provider_call.recorded")
        self.assertEqual(self.used(), 110)
        self.assertEqual(billing.current_month_cost_by_currency_for_user(self.db, user_id=self.user.id, now=self.now), {"CNY": 110})
        self.enforce()

    def test_mixed_currency_scalar_is_unknown_instead_of_110_cny(self):
        self.add(100, "CNY")
        self.add(10, "USD", entry_type="chat.message.completed")
        self.assertIsNone(self.used())
        self.assertEqual(billing.current_month_cost_by_currency_for_user(self.db, user_id=self.user.id, now=self.now), {"CNY": 100, "USD": 10})

    def test_foreign_only_and_zero_foreign_units_remain_incomparable(self):
        for amount, currency in [(10, "USD"), (0, "EUR"), (1.25, " gbp ")]:
            with self.subTest(amount=amount, currency=currency):
                self.clear()
                self.add(amount, currency)
                self.assertIsNone(self.used())
                totals = billing.current_month_cost_by_currency_for_user(self.db, user_id=self.user.id, now=self.now)
                self.assertEqual(totals, {currency.strip().upper(): amount})

    def test_shanghai_month_edges_and_other_users_are_excluded(self):
        for amount, timestamp in [(1, "2026-09-30T15:59:59+00:00"), (2, "2026-09-30T16:00:00+00:00"), (3, "2026-10-31T15:59:59+00:00"), (4, "2026-10-31T16:00:00+00:00")]:
            self.add(amount, at=datetime.fromisoformat(timestamp))
        self.add(999, "USD", user=1)
        self.assertEqual(self.used(), 5)
        self.enforce()

    def test_december_year_rollover_and_leap_february_use_the_whole_local_month(self):
        for now, inside, outside in [
            ("2026-12-15T00:00:00+00:00", "2026-12-31T15:59:59+00:00", "2026-12-31T16:00:00+00:00"),
            ("2028-02-15T00:00:00+00:00", "2028-02-29T15:59:59+00:00", "2028-02-29T16:00:00+00:00"),
        ]:
            with self.subTest(now=now):
                self.clear()
                self.add(12.34567, at=datetime.fromisoformat(inside))
                self.add(900, "USD", at=datetime.fromisoformat(outside))
                self.assertEqual(self.used(now=datetime.fromisoformat(now)), 12.3457)

    def test_hard_cny_quota_retains_below_equal_and_above_threshold_rules(self):
        self.user.monthly_quota = 100
        self.db.commit()
        for cost, blocked in [(99.99, False), (100, True), (100.01, True)]:
            with self.subTest(cost=cost):
                self.clear()
                self.add(cost)
                if blocked:
                    with self.assertRaises(HTTPException) as raised:
                        self.enforce()
                    self.assertEqual(raised.exception.status_code, 403)
                    self.assertIn("已用尽", raised.exception.detail)
                    self.assertIn("CNY", raised.exception.detail)
                else:
                    self.enforce()

    def test_finite_hard_quota_rejects_incomparable_spend_without_claiming_exhaustion(self):
        self.add(100, "CNY")
        self.add(10, "USD")
        with self.assertRaises(HTTPException) as raised:
            self.enforce()
        self.assertEqual(raised.exception.status_code, 403)
        self.assertIn("无法", raised.exception.detail)
        self.assertIn("CNY", raised.exception.detail)
        self.assertIn("管理员", raised.exception.detail)
        self.assertNotIn("已用尽", raised.exception.detail)

    def test_soft_warn_and_unlimited_keep_early_return_without_spend_query(self):
        self.add(999, "USD")
        for policy, limit in [("soft_warn", 1), ("hard_block", None)]:
            with self.subTest(policy=policy, limit=limit):
                self.user.quota_policy, self.user.monthly_quota = policy, limit
                self.db.commit()
                with patch.object(billing, "current_month_cost_for_user", wraps=billing.current_month_cost_for_user) as query:
                    self.enforce()
                    query.assert_not_called()

    def test_suspended_billing_is_still_rejected_before_quota_query(self):
        self.user.billing_status, self.user.monthly_quota = "suspended", None
        self.db.commit()
        with patch.object(billing, "current_month_cost_for_user", wraps=billing.current_month_cost_for_user) as query:
            with self.assertRaises(HTTPException) as raised:
                self.enforce()
            self.assertEqual(raised.exception.status_code, 403)
            self.assertIn("停用", raised.exception.detail)
            query.assert_not_called()

    def test_ledger_legacy_amounts_and_user_configuration_are_read_only(self):
        self.add(100, "CNY", model="gpt-image-2", provider="gpt-image-2")
        self.assertEqual(self.used(), 100)
        self.add(10, "USD")
        def snapshot():
            with self.sessions() as db:
                return ([{c.name: getattr(row, c.name) for c in UsageLedger.__table__.columns} for row in db.scalars(select(UsageLedger).order_by(UsageLedger.id))],
                        [(row.id, row.quota_policy, row.monthly_quota, row.billing_status) for row in db.scalars(select(User).order_by(User.id))])
        before = snapshot()
        with self.assertRaises(HTTPException):
            self.enforce()
        self.assertEqual(snapshot(), before)
        self.assertFalse(self.db.new or self.db.dirty or self.db.deleted)

    def entities(self):
        tables = set()
        def include(table):
            if table in tables:
                return
            tables.add(table)
            for key in table.foreign_keys:
                include(key.column.table)
        for model in (Task, TaskDispatch, ChatMessage, ProviderCall):
            include(model.__table__)
        Task.metadata.create_all(self.engine, tables=list(tables))
        project = Project(code="P", name="quota fixture", owner_user_id=self.user.id)
        workflow = Workflow(key="image-generate", name="Image", description="fixture", provider_capability="image.generate")
        provider = ProviderProfile(provider_name="quota-provider", model_name="synthetic", api_key="unused", base_url="https://fixture.invalid", capabilities=["chat.completions"])
        self.db.add_all([project, workflow, provider])
        self.db.flush()
        conversation = Conversation(user_id=self.user.id, title="quota fixture", model_provider_id=provider.id)
        self.db.add(conversation)
        self.db.commit()
        return project, workflow, provider, conversation

    def assert_no_new_work(self):
        self.db.rollback()
        with self.sessions() as db:
            self.assertEqual([db.scalar(select(func.count()).select_from(model)) for model in (Task, TaskDispatch, ChatMessage, ProviderCall)], [0, 0, 0, 0])

    def test_existing_task_creation_rejects_before_new_task_dispatch_or_queue(self):
        self.add(10, "USD")
        self.entities()
        provider = SimpleNamespace(adapter_kind="synthetic", capabilities=["image.generate"])
        boundary = Mock(side_effect=AssertionError("must stop before preparation or execution"))
        ns = load_functions("app/routers/tasks.py", ["create_task"], dict(
            Depends=Depends, get_db=lambda: None, get_current_auth_user=lambda: None,
            select=select, Workflow=Workflow, Project=Project, Task=Task, TaskDispatch=TaskDispatch, TaskStatus=TaskStatus,
            HTTPException=HTTPException, hashlib=hashlib, json=json, get_provider_map=lambda db: {"fixture": provider},
            get_provider_definition=lambda *args: provider, _can_use_task_project=lambda auth, project: True,
            _get_or_create_user=lambda *args: self.user, enforce_user_quota=self.enforce,
            _reference_image_storage_paths=boundary, enqueue_task=boundary, execute_task=boundary))
        payload = SimpleNamespace(workflow_key="image-generate", project_code="P", requested_provider="fixture", submission_key=None, payload={})
        payload.model_dump = lambda **kwargs: {"workflow_key": payload.workflow_key, "project_code": "P", "requested_provider": "fixture", "payload": {}}
        background = Mock()
        with self.assertRaises(HTTPException) as raised:
            ns["create_task"](payload=payload, background_tasks=background, db=self.db, auth_user=self.auth)
        self.assertEqual(raised.exception.status_code, 403)
        self.assertIn("无法按CNY比较", raised.exception.detail)
        background.add_task.assert_not_called()
        boundary.assert_not_called()
        self.assert_no_new_work()

    def test_existing_chat_send_rejects_before_user_message_or_stream_creation(self):
        self.add(10, "USD")
        _, _, provider, conversation = self.entities()
        path = BACKEND / "app/routers/chat.py"
        tree = ast.parse(path.read_text(encoding="utf-8"))
        route = next(node for node in tree.body if isinstance(node, ast.AsyncFunctionDef) and node.name == "send_message")
        route.decorator_list = []
        boundary = Mock(side_effect=AssertionError("must stop before message or stream"))
        ns = dict(Depends=Depends, parse_chat_message_payload=lambda: None, get_db=lambda: None, get_current_auth_user=lambda: None,
                  User=User, _verify_owner=lambda *args: conversation, _resolve_enabled_chat_provider=lambda *args: provider,
                  snapshot_chat_provider_config=lambda profile: SimpleNamespace(), enforce_user_quota=self.enforce,
                  serialize_chat_attachments=boundary, stream_chat_completion=boundary)
        future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
        exec(compile(ast.fix_missing_locations(ast.Module(body=[future, route], type_ignores=[])), str(path), "exec"), ns)
        with asyncio.Runner(loop_factory=TimerOnlyLoop) as runner:
            with self.assertRaises(HTTPException) as raised:
                runner.run(ns["send_message"](conversation_id=conversation.id, payload=SimpleNamespace(content="synthetic", attachments=[], agent_mode=False), db=self.db, auth_user=self.auth))
        self.assertEqual(raised.exception.status_code, 403)
        self.assertIn("无法按CNY比较", raised.exception.detail)
        boundary.assert_not_called()
        self.assert_no_new_work()

    def test_existing_confirmed_chat_task_rejects_before_durable_submission_or_wakeup(self):
        self.add(10, "USD")
        self.entities()
        boundary = Mock(side_effect=AssertionError("must stop before task or queue"))
        ns = load_functions("app/services/chat_agent_task_service.py", ["submit_confirmed_chat_agent_task"], dict(
            select=select, Workflow=Workflow, Project=Project, Task=Task, TaskStatus=TaskStatus, DataClassification=DataClassification,
            _validate_write_tool_allowed=lambda *args: None, _validate_task_inputs=lambda *args, **kwargs: None,
            _get_or_create_user=lambda *args: self.user, _reference_image_storage_paths=lambda payload: [],
            enforce_user_quota=self.enforce, submit_once=submit_once, enqueue_task=boundary, execute_task=boundary))
        proposal = SimpleNamespace(workflow_key="image-generate", project_code="P", requested_provider="fixture", title="synthetic", classification="B", payload={}, proposal_id="quota-fixture")
        background = Mock()
        with self.assertRaises(HTTPException) as raised:
            ns["submit_confirmed_chat_agent_task"](self.db, auth_user=self.auth, policy=SimpleNamespace(), proposal=proposal, background_tasks=background)
        self.assertEqual(raised.exception.status_code, 403)
        self.assertIn("无法按CNY比较", raised.exception.detail)
        background.add_task.assert_not_called()
        boundary.assert_not_called()
        self.assert_no_new_work()
