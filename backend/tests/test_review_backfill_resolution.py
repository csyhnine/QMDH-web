"""R28: historical effective image tiers and explicitly confirmed 4K prices only."""
from copy import deepcopy
import unittest
from unittest.mock import patch

from sqlalchemy import select

from app.models import ProviderCall, ProviderCallArchive, ProviderProfile, Task, TaskArchive, UsageLedger
from app.services import task_cost_backfill as backfill
from tests.test_review_backfill_contract_identity import BackfillContractIdentityTests


class BackfillResolutionTests(unittest.TestCase):
    def setUp(self):
        self.fixture = BackfillContractIdentityTests(methodName="runTest")
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.sessions = self.fixture.sessions

    def seed(self, **kwargs):
        return self.fixture.seed(**kwargs)

    def edit(self, task_id, *, payload=None, result=None, call_result=None):
        with self.sessions() as db:
            task = db.get(Task, task_id)
            if payload is not None:
                task.payload = deepcopy(payload)
            if result is not None:
                task.result = {**task.result, **deepcopy(result)}
            if call_result is not None:
                call = db.scalar(select(ProviderCall).where(ProviderCall.task_id == task_id))
                call.request_summary = {"execution": {"result": {**call.request_summary["execution"]["result"], **deepcopy(call_result)}}}
            db.commit()

    def plan(self, *ids, quotes=None):
        plan = self.fixture.plan(*ids)
        for entry in plan["tasks"]:
            if quotes and entry["task_id"] in quotes:
                entry["image_4k_quote"] = quotes[entry["task_id"]]
        return plan

    def quote(self, price=9):
        return {"version": 1, "resolution_tier": "4k", "unit_price": price, "pricing_unit": "per_image", "currency": "CNY",
                "source": "synthetic confirmed historical 4K supplement, not current profile or actual market quote"}

    def run_backfill(self, plan, **kwargs):
        return self.fixture.run_backfill(plan, **kwargs)

    def snapshot(self):
        return self.fixture.snapshot()

    def assert_graph(self, task_id, cost, tier):
        with self.sessions() as db:
            task = db.get(Task, task_id)
            self.assertEqual((task.cost, task.cost_currency, task.result["billing"]["resolution_tier"]), (cost, "CNY", tier))
            for model in (ProviderCall, TaskArchive, UsageLedger):
                rows = list(db.scalars(select(model).where(model.task_id == task_id)))
                self.assertTrue(rows)
                self.assertTrue(all((row.cost, row.cost_currency) == (cost, "CNY") for row in rows))
            archive = db.scalar(select(TaskArchive).where(TaskArchive.task_id == task_id))
            rows = list(db.scalars(select(ProviderCallArchive).where(ProviderCallArchive.task_archive_id == archive.id)))
            self.assertEqual(len(rows), 1)
            self.assertEqual((rows[0].cost, rows[0].cost_currency), (cost, "CNY"))

    def test_resolver_explicit_four_k_and_unknown_never_fall_back_to_one_k(self):
        for payload, result, expected in [({"resolution": "4K"}, {}, "4k"), ({}, {"billing": {"resolution_tier": "4k"}}, "4k"),
                                        ({"imageSize": "2K"}, {}, "2k"), ({"resolution": "1K"}, {}, "1k"),
                                        ({"billing": {"resolution_tier": "4K"}}, {}, "4k"),
                                        ({}, {}, None), ({"resolution": "auto"}, {}, None), ({"resolution": "8k"}, {}, None)]:
            with self.subTest(payload=payload, result=result):
                self.assertEqual(backfill._resolve_image_tier(payload, result), expected)

    def test_original_nine_cny_four_k_without_confirmed_price_preserves_all_rows(self):
        task_id = self.seed(tier="4k", cost=9)
        with self.sessions() as db:
            profile = db.scalar(select(ProviderProfile))
            profile.adapter_config = {"unit_price_1k": 0.67, "unit_price_2k": 0.95, "unit_price_4k": 9}
            db.commit()
        self.edit(task_id, result={"resolution": "4k", "billing": {"resolution_tier": "4k", "unit_price": 9}})
        before = self.snapshot()
        plan = self.plan(task_id)
        unscoped = self.run_backfill(None, dry_run=True)
        self.assertEqual((unscoped.samples[0]["tier"], unscoped.samples[0]["reason"]), ("4k", "contract_required"))
        preview = self.run_backfill(plan, dry_run=True)
        applied = self.run_backfill(plan)
        self.assertEqual((preview.updated, applied.updated, applied.skipped), (0, 0, 1))
        self.assertEqual(applied.samples[0]["tier"], "4k")
        self.assertIn("price", applied.samples[0]["reason"])
        self.assertEqual(self.snapshot(), before)

    def test_confirmed_four_k_supplement_updates_all_layers_and_preserves_original_snapshot(self):
        task_id = self.seed(tier="4k", cost=1)
        original_billing = {"resolution_tier": "4k", "unit_price": 9, "additional_cost_unknown": True}
        self.edit(task_id, result={"output_count": 2, "resolution": "4k", "billing": original_billing})
        plan = self.plan(task_id, quotes={task_id: self.quote()})
        before = self.snapshot()
        preview = self.run_backfill(plan, dry_run=True)
        self.assertEqual(preview.updated, 1)
        self.assertEqual(self.snapshot(), before)
        applied = self.run_backfill(plan)
        self.assertEqual(applied.updated, preview.updated)
        self.assertEqual(preview.samples[0]["new_cost"], applied.samples[0]["new_cost"])
        self.assert_graph(task_id, 18, "4k")
        with self.sessions() as db:
            task = db.get(Task, task_id)
            self.assertEqual(task.payload, {"resolution": "4k"})
            billing = task.result["billing"]
            self.assertEqual(billing["backfill_previous_billing"], original_billing)
            self.assertEqual(billing["image_4k_quote"], self.quote())
            self.assertTrue(billing["additional_cost_unknown"])

    def test_catalog_explicit_wan_pro_four_k_uses_its_own_price(self):
        task_id = self.seed(model="wan2.7-image-pro", tier="4k", cost=9)
        plan = self.plan(task_id)
        self.assertEqual(self.run_backfill(plan, dry_run=True).updated, 1)
        self.assertEqual(self.run_backfill(plan).updated, 1)
        self.assert_graph(task_id, 0.5, "4k")

    def test_execution_effective_two_k_overrides_original_four_k_request(self):
        task_id = self.seed(tier="4k", cost=7)
        effective = {"requested_resolution": "4k", "effective_resolution": "2k", "resolution": "2k", "image_size": "2048x2048",
                     "billing": {"resolution_tier": "2k", "unit_price": 0.95},
                     "generation_progress": {"resolution_plan": {"requested_resolution": "4k", "effective_resolution": "2k", "resolution": "2k"},
                                             "billing_template": {"resolution_tier": "2k", "unit_price": 0.95}}}
        self.edit(task_id, result=effective, call_result=effective)
        before = self.snapshot()
        plan = self.plan(task_id)
        self.assertEqual(self.run_backfill(plan, dry_run=True).updated, 1)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.run_backfill(plan).updated, 1)
        self.assert_graph(task_id, 0.95, "2k")
        with self.sessions() as db:
            task = db.get(Task, task_id)
            self.assertEqual((task.payload["resolution"], task.result["requested_resolution"], task.result["effective_resolution"]), ("4k", "4k", "2k"))
            self.assertEqual(task.result["generation_progress"], effective["generation_progress"])

    def test_historical_execution_billing_tier_has_priority_over_request_only(self):
        task_id = self.seed(tier="2k", cost=7)
        self.edit(task_id, payload={"resolution": "4k"})
        self.assertEqual(self.run_backfill(self.plan(task_id)).updated, 1)
        self.assert_graph(task_id, 0.95, "2k")

    def test_legacy_one_and_two_k_explicit_fields_remain_eligible(self):
        ids = []
        for tier in ("1k", "2k"):
            task_id = self.seed(tier=tier, cost=7)
            self.edit(task_id, result={"billing": {}, "resolution": tier})
            ids.append(task_id)
        self.assertEqual(self.run_backfill(self.plan(*ids)).updated, 2)
        self.assert_graph(ids[0], 0.67, "1k")
        self.assert_graph(ids[1], 0.95, "2k")

    def test_unknown_and_conflicting_execution_or_legacy_specs_are_reported_without_writes(self):
        cases = [({}, {"billing": {}}, {}), ({"resolution": "auto"}, {"billing": {}}, {}),
                 ({"resolution": "4k"}, {"billing": {}, "resolution": "2k"}, {}),
                 ({"resolution": "2k"}, {"billing": {"resolution_tier": "2k"}, "effective_resolution": "4k"}, {}),
                 ({"resolution": "2k"}, {"billing": {"resolution_tier": "2k"}, "resolution": "4k"}, {}),
                 ({"resolution": "2k"}, {"billing": {"resolution_tier": "2k"}}, {"billing": {"resolution_tier": "4k"}}),
                 ({"resolution": "2k"}, {"billing": {"resolution_tier": "2k"}, "generation_progress": {"resolution_plan": {"effective_resolution": "4k"}}}, {}),
                 ({"resolution": "2k"}, {"billing": {"resolution_tier": "2k"}}, {"generation_progress": {"billing_template": {"resolution_tier": "4k"}}}),
                 ({"resolution": "2k"}, {"billing": {"resolution_tier": "auto"}, "effective_resolution": "2k"}, {}),
                 ({"resolution": "2k"}, {"billing": {}, "image_size": "4K"}, {})]
        ids = []
        for payload, result, call_result in cases:
            task_id = self.seed(cost=7)
            self.edit(task_id, payload=payload, result=result, call_result=call_result)
            ids.append(task_id)
        before = self.snapshot()
        result = self.run_backfill(self.plan(*ids))
        self.assertEqual((result.updated, result.skipped), (0, len(cases)))
        self.assertTrue(all("spec" in row["reason"] for row in result.samples))
        self.assertEqual(self.snapshot(), before)

    def test_pixel_dimensions_are_reference_only_and_do_not_invent_a_billing_tier(self):
        task_id = self.seed(cost=7)
        self.edit(task_id, payload={"image_size": "4096x4096"}, result={"billing": {}, "image_size": "4096x4096"})
        before = self.snapshot()
        self.assertEqual(self.run_backfill(self.plan(task_id)).updated, 0)
        self.assertEqual(self.snapshot(), before)
        self.edit(task_id, result={"effective_resolution": "2k", "image_size": "2048x1024"})
        self.assertEqual(self.run_backfill(self.plan(task_id)).updated, 1)
        self.assert_graph(task_id, 0.95, "2k")

    def test_invalid_four_k_quote_is_rejected_before_any_accounting_write(self):
        task_id = self.seed(tier="4k", cost=9)
        changes = [{"unit_price": -1}, {"unit_price": float("nan")}, {"unit_price": float("inf")}, {"unit_price": True},
                   {"unit_price": "9"}, {"currency": "USD"}, {"pricing_unit": "per_request"}, {"version": 2},
                   {"version": True}, {"resolution_tier": "2k"}, {"source": " "}, {"unit_price": 10 ** 1000}]
        before = self.snapshot()
        for change in changes:
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.run_backfill(self.plan(task_id, quotes={task_id: {**self.quote(), **change}}))
        self.assertEqual(self.snapshot(), before)

    def test_conflicting_task_call_or_progress_price_snapshots_preserve_the_graph(self):
        ids = []
        for layer in ("task", "call", "progress", "call_progress"):
            for change in ({"unit_price": 8}, {"currency": "USD"}, {"pricing_unit": "per_request"}, {"source": "invoice"}):
                task_id = self.seed(tier="4k", cost=9)
                billing = {"resolution_tier": "4k", **change}
                self.edit(task_id, result={"billing": billing} if layer == "task" else
                          {"generation_progress": {"billing_template": billing}} if layer == "progress" else {},
                          call_result={"billing": billing} if layer == "call" else
                          {"generation_progress": {"billing_template": billing}} if layer == "call_progress" else None)
                ids.append(task_id)
        before = self.snapshot()
        result = self.run_backfill(self.plan(*ids, quotes={task_id: self.quote() for task_id in ids}))
        self.assertEqual((result.updated, result.skipped), (0, 16))
        self.assertEqual(self.snapshot(), before)

    def test_explicit_four_k_sku_requires_an_explicit_four_k_price(self):
        task_id = self.seed(model="gpt-image-2-4k", tier="4k", cost=9)
        before = self.snapshot()
        self.assertEqual(self.run_backfill(self.plan(task_id)).updated, 0)
        self.assertEqual(self.snapshot(), before)
        accepted = self.run_backfill(self.plan(task_id, quotes={task_id: self.quote()}))
        self.assertEqual((accepted.updated, accepted.unchanged), (0, 1))
        self.assert_graph(task_id, 9, "4k")
        free = self.seed(tier="4k", cost=1)
        self.assertEqual(self.run_backfill(self.plan(free, quotes={free: self.quote(0)})).updated, 1)
        self.assert_graph(free, 0, "4k")

    def test_four_k_correct_task_wrong_ledger_repairs_once_without_duplicate_entries(self):
        task_id = self.seed(tier="4k", cost=9)
        with self.sessions() as db:
            db.scalar(select(UsageLedger).where(UsageLedger.task_id == task_id)).cost = 7
            db.commit()
        plan = self.plan(task_id, quotes={task_id: self.quote()})
        self.assertEqual(self.run_backfill(plan).updated, 1)
        self.assert_graph(task_id, 9, "4k")
        before = self.snapshot()
        with self.assertRaises(ValueError):
            self.run_backfill(plan)
        result = self.run_backfill(self.plan(task_id, quotes={task_id: self.quote()}))
        self.assertEqual((result.updated, result.unchanged), (0, 1))
        self.assertEqual(self.snapshot(), before)

    def test_four_k_apply_flush_and_commit_errors_rollback_the_whole_batch(self):
        ids = [self.seed(tier="4k", cost=1), self.seed(tier="4k", cost=2)]
        plan = self.plan(*ids, quotes={task_id: self.quote() for task_id in ids})
        before = self.snapshot()
        original = backfill._apply_billing_to_task
        for point in ("apply", "flush", "commit"):
            with self.subTest(point=point), self.sessions() as db:
                def apply_then_fail(session, task, billing):
                    original(session, task, billing)
                    if task.id == ids[-1]:
                        raise RuntimeError("synthetic apply failure")
                target, attr = (backfill, "_apply_billing_to_task") if point == "apply" else (db, point)
                with patch.object(target, attr, side_effect=apply_then_fail if point == "apply" else RuntimeError("synthetic transaction failure")):
                    with self.assertRaises(RuntimeError):
                        backfill.backfill_task_costs(db, confirmed_plan=plan)
                self.assertFalse(db.in_transaction())
            self.assertEqual(self.snapshot(), before)

    def test_changed_four_k_graph_aborts_before_another_approved_task_is_repriced(self):
        ids = [self.seed(tier="4k", cost=1), self.seed(tier="4k", cost=2)]
        plan = self.plan(*ids, quotes={task_id: self.quote() for task_id in ids})
        self.edit(ids[-1], result={"operator_note": "changed after approval"})
        before = self.snapshot()
        with self.assertRaises(ValueError):
            self.run_backfill(plan)
        self.assertEqual(self.snapshot(), before)

    def test_quote_tier_and_existing_catalog_price_conflicts_do_not_change_accounts(self):
        two_k = self.seed(tier="2k", cost=7)
        wan = self.seed(model="wan2.7-image-pro", tier="4k", cost=9)
        before = self.snapshot()
        result = self.run_backfill(self.plan(two_k, wan, quotes={two_k: self.quote(), wan: self.quote()}))
        self.assertEqual((result.updated, result.skipped), (0, 2))
        self.assertEqual(self.snapshot(), before)
        result = self.run_backfill(self.plan(wan, quotes={wan: self.quote(0.5)}))
        self.assertEqual(result.updated, 1)
        self.assert_graph(wan, 0.5, "4k")
