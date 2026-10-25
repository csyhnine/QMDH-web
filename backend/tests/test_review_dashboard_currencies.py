"""R18-A: real ledger aggregation and Shanghai monthly quota views, offline."""
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from zoneinfo import ZoneInfo

from fastapi import Depends, Query
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.auth import require_ops_access
from app.core.config import AuthUserProfile
from app.models import AuditLog, DataClassification, ProviderCall, Task, TaskStatus, UsageLedger, User, Workflow
from app.schemas import DashboardAccountUsage, DashboardCurrencySpend, DashboardDailyPoint, DashboardDayModelCalls, DashboardExecutionRanking, DashboardModelCallSlice, DashboardStats
from tests.test_review_partial_image_progress import load


class DashboardCurrencyTests(unittest.TestCase):
    def setUp(self):
        root = Path(self.enterContext(TemporaryDirectory(prefix="r18-offline-")))
        self.engine = create_engine("sqlite:///" + str(root / "ledger.db"))
        self.addCleanup(self.engine.dispose)
        event.listen(self.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        tables = set()
        def include(table):
            if table in tables:
                return
            tables.add(table)
            for key in table.foreign_keys:
                include(key.column.table)
        for model in (UsageLedger, User, Workflow, AuditLog):
            include(model.__table__)
        UsageLedger.metadata.create_all(self.engine, tables=list(tables))
        self.sessions = sessionmaker(self.engine)
        self.db = self.sessions()
        self.addCleanup(self.db.close)
        self.users = [User(name="r18-one", role="designer", monthly_quota=500), User(name="r18-two", role="designer", monthly_quota=100)]
        self.db.add_all(self.users)
        self.db.commit()
        self.ids = [user.id for user in self.users]
        self.serial = 0
        owner = self
        self.now = datetime(2026, 10, 23, 6, tzinfo=timezone.utc)
        class Clock(datetime):
            @classmethod
            def now(cls, tz=None):
                return owner.now.astimezone(tz) if tz is not None else owner.now.replace(tzinfo=None)
        self.ns = dict(Counter=Counter, defaultdict=defaultdict, date=date, datetime=Clock, time=time,
                       timedelta=timedelta, timezone=timezone, ZoneInfo=ZoneInfo, SHANGHAI_TZ=ZoneInfo("Asia/Shanghai"),
                       LEGACY_LOCAL_PRICING_PROVIDERS={"gpt-image-2"}, Session=Session, Depends=Depends, Query=Query,
                       router=SimpleNamespace(get=lambda *a, **kw: lambda fn: fn), get_db=lambda: None, get_current_auth_user=lambda: None,
                       require_ops_access=require_ops_access, func=func, select=select,
                       AuditLog=AuditLog, ProviderCall=ProviderCall, Task=Task, TaskStatus=TaskStatus, UsageLedger=UsageLedger,
                       User=User, Workflow=Workflow, AuthUserProfile=AuthUserProfile,
                       DashboardAccountUsage=DashboardAccountUsage, DashboardCurrencySpend=DashboardCurrencySpend,
                       DashboardDailyPoint=DashboardDailyPoint, DashboardDayModelCalls=DashboardDayModelCalls,
                       DashboardExecutionRanking=DashboardExecutionRanking, DashboardModelCallSlice=DashboardModelCallSlice, DashboardStats=DashboardStats)
        load("app/routers/dashboard.py", self.ns, functions=["_round", "_with_utc", "_shanghai_day_key", "_shanghai_date", "_shanghai_day_start_utc",
             "_failure_reason", "_is_legacy_local_pricing_entry", "_success_rate", "_quota_status", "_infer_task_capability", "_is_image_capability",
             "_resolve_ledger_model_label", "_empty_execution_bucket", "_apply_task_count", "_apply_chat_usage", "_activity_sort_key",
             "_dashboard_currency", "_dashboard_money", "_dashboard_costs", "get_dashboard_stats"])
        self.auth = AuthUserProfile(name="r18-admin", role="admin", token="unused", user_id=self.ids[0])

    def add(self, cost=10, currency="CNY", model="model-one", entry_type="task.finalized", user=0, at=None, provider="provider-one", project="P", **kwargs):
        self.serial += 1
        values = dict(entry_type=entry_type, source_table="synthetic-" + entry_type, source_id=self.serial,
                      task_id=self.serial if entry_type == "task.finalized" else None,
                      project_code=project, project_name=project, workflow_key="image-generate", workflow_name="Image",
                      user_id=self.ids[user], user_name=self.users[user].name, requested_provider=provider, provider_name=provider,
                      model_name=model, capability="chat.completions" if entry_type == "chat.message.completed" else "image.generate",
                      classification=DataClassification.b, task_status=TaskStatus.completed, cost=cost, cost_currency=currency,
                      ledger_source=entry_type, recorded_at=at or self.now, output_count=2)
        values.update(kwargs)
        row = UsageLedger(**values)
        self.db.add(row)
        self.db.commit()
        return row.id

    def stats(self, days=30, **filters):
        return self.ns["get_dashboard_stats"](days=days, project_code=filters.get("project_code"), user_name=filters.get("user_name"), provider_name=filters.get("provider_name"), db=self.db, auth_user=self.auth)

    def costs(self, rows):
        return {row.currency: row.total_cost for row in rows} if rows and not isinstance(rows[0], dict) else {row["currency"]: row["total_cost"] for row in rows}

    def account(self, result, name="r18-one"):
        return next(row for row in result.account_usage if row.name == name)

    def test_model_single_currency_uses_own_usd_instead_of_global_cny(self):
        self.add(100, "CNY", "cny-model")
        self.add(10, "USD", "usd-model")
        row = next(row for row in self.stats().model_rankings if row["name"] == "usd-model")
        self.assertEqual((row["total_cost"], row["cost_currency"]), (10, "USD"))
        self.assertEqual(self.costs(row["cost_by_currency"]), {"USD": 10})

    def test_same_model_mixed_currencies_returns_null_scalar_and_complete_breakdown(self):
        self.add(100, "CNY")
        self.add(10, "USD")
        row = self.stats().model_rankings[0]
        self.assertIsNone(row["total_cost"])
        self.assertEqual(row["cost_currency"], "multiple currencies")
        self.assertEqual(self.costs(row["cost_by_currency"]), {"CNY": 100, "USD": 10})
        self.assertEqual((row["count"], row["image_output_count"]), (2, 4))

    def test_task_chat_same_model_combines_counts_and_separates_currency_without_provider_double_count(self):
        task = self.add(100, "CNY")
        self.add(10, "USD", entry_type="chat.message.completed", total_tokens=12)
        self.add(999, "EUR", entry_type="provider_call.recorded", task_id=task)
        row = self.stats().model_rankings[0]
        self.assertEqual((row["count"], row["chat_turn_count"], row["chat_total_tokens"]), (1, 1, 12))
        self.assertEqual(self.costs(row["cost_by_currency"]), {"CNY": 100, "USD": 10})
        self.assertIsNone(row["total_cost"])

    def test_provider_total_average_and_daily_mixed_scalars_are_unavailable(self):
        self.add(100, "CNY")
        self.add(10, "USD")
        result = self.stats(days=1)
        self.assertIsNone(result.total_cost)
        self.assertIsNone(result.average_cost)
        self.assertIsNone(result.provider_rankings[0]["total_cost"])
        self.assertIsNone(result.daily_series[0].total_cost)
        self.assertEqual(self.costs(result.daily_series[0].cost_by_currency), {"CNY": 100, "USD": 10})
        self.assertEqual(self.costs(result.provider_rankings[0]["cost_by_currency"]), {"CNY": 100, "USD": 10})

    def test_single_currency_total_average_provider_and_daily_keep_numeric_contract(self):
        self.add(10, " usd ")
        self.add(20, "USD")
        result = self.stats(days=1)
        self.assertEqual((result.total_cost, result.average_cost, result.cost_unit), (30, 15, "USD"))
        self.assertEqual((result.daily_series[0].total_cost, result.daily_series[0].cost_currency), (30, "USD"))
        self.assertEqual(result.provider_rankings[0]["total_cost"], 30)

    def test_zero_amounts_preserve_declared_units_and_foreign_quota_is_not_assumed_cny(self):
        self.add(0, "USD")
        result = self.stats(days=1)
        self.assertEqual((result.total_cost, result.cost_unit), (0, "USD"))
        self.assertEqual(self.costs(result.model_rankings[0]["cost_by_currency"]), {"USD": 0})
        self.assertFalse(self.account(result).quota_comparable)
        self.assertIsNone(self.account(result).quota_used)

    def test_empty_stats_and_zero_cny_quota_remain_comparable_without_fabricated_spend(self):
        result = self.stats(days=1)
        self.assertEqual((result.total_cost, result.average_cost, result.cost_unit), (0, 0, "CNY"))
        row = self.account(result)
        self.assertTrue(row.quota_comparable)
        self.assertEqual((row.quota_used, row.quota_remaining, row.quota_currency), (0, 500, "CNY"))
        self.assertEqual(row.quota_cost_by_currency, [])

    def test_monthly_cny_quota_is_independent_of_dashboard_days(self):
        self.add(100, at=datetime(2026, 10, 2, tzinfo=timezone.utc))
        self.add(10, entry_type="chat.message.completed")
        for days in [1, 7, 40]:
            with self.subTest(days=days):
                row = self.account(self.stats(days))
                self.assertEqual((row.quota_used, row.quota_remaining, row.quota_month), (110, 390, "2026-10"))
                self.assertEqual(self.costs(row.quota_cost_by_currency), {"CNY": 110})

    def test_foreign_monthly_spend_keeps_breakdown_and_incomparable_quota_fields(self):
        self.add(100, "CNY")
        self.add(10, "USD", entry_type="chat.message.completed")
        row = self.account(self.stats(days=1))
        self.assertEqual(row.quota_currency, "CNY")
        self.assertEqual(row.quota_status, "incomparable")
        self.assertFalse(row.quota_comparable)
        self.assertIsNone(row.quota_used)
        self.assertIsNone(row.quota_remaining)
        self.assertEqual(self.costs(row.quota_cost_by_currency), {"CNY": 100, "USD": 10})

    def test_users_and_unlimited_quota_do_not_share_spend_or_invent_remaining(self):
        self.users[0].monthly_quota = None
        self.db.commit()
        self.add(10, "USD")
        self.add(20, "CNY", user=1)
        result = self.stats()
        first, second = self.account(result), self.account(result, "r18-two")
        self.assertEqual(first.quota_status, "unlimited")
        self.assertIsNone(first.quota_remaining)
        self.assertIsNone(first.quota_used)
        self.assertEqual((second.quota_used, second.quota_remaining), (20, 80))

    def test_shanghai_month_start_is_inclusive_and_next_month_start_exclusive(self):
        for amount, timestamp in [(1, "2026-09-30T15:59:59+00:00"), (2, "2026-09-30T16:00:00+00:00"), (3, "2026-10-31T15:59:59+00:00"), (4, "2026-10-31T16:00:00+00:00")]:
            self.add(amount, at=datetime.fromisoformat(timestamp))
        self.assertEqual(self.account(self.stats(days=1)).quota_used, 5)

    def test_legacy_display_exclusion_and_full_month_quota_do_not_rewrite_or_double_bill(self):
        self.add(100, model="gpt-image-2", provider="gpt-image-2")
        self.add(999, entry_type="provider_call.recorded")
        result = self.stats(days=1)
        self.assertEqual(result.total_cost, 0)
        self.assertEqual(result.daily_series[0].total_cost, 0)
        self.assertEqual(result.model_rankings[0]["total_cost"], 0)
        self.assertEqual(self.account(result).quota_used, 100)

    def test_project_provider_user_filters_keep_activity_scope_but_not_monthly_quota_scope(self):
        self.add(10, provider="A", project="A")
        self.add(20, provider="B", project="B")
        self.add(40, user=1, provider="A", project="A")
        result = self.stats(days=1, project_code="A", provider_name="A", user_name="r18-one")
        self.assertEqual(result.total_tasks, 1)
        self.assertEqual(len(result.account_usage), 1)
        self.assertEqual(self.account(result).quota_used, 30)
        self.assertEqual(self.costs(self.account(result).cost_by_currency), {"CNY": 10})

    def test_nullable_schema_json_and_read_only_ledger_preservation(self):
        self.add(100, "CNY")
        self.add(10, "USD")
        def snapshot():
            with self.sessions() as db:
                return [{column.name: getattr(row, column.name) for column in UsageLedger.__table__.columns} for row in db.scalars(select(UsageLedger).order_by(UsageLedger.id))]
        before = snapshot()
        data = self.stats(days=1).model_dump(mode="json")
        self.assertIsNone(data["total_cost"])
        self.assertIsNone(data["daily_series"][0]["total_cost"])
        row = next(row for row in data["account_usage"] if row["name"] == "r18-one")
        self.assertIsNone(row["quota_used"])
        self.assertEqual(snapshot(), before)
        self.assertFalse(self.db.new or self.db.dirty or self.db.deleted)
