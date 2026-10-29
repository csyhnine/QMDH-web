"""R27: explicitly scoped historical quotes; all data and maintenance are temporary."""
import argparse
from contextlib import redirect_stdout
from datetime import datetime, timezone
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker

from app.core.config import ImageProviderProfile
from app.models import DataClassification, Project, ProviderCall, ProviderCallArchive, ProviderProfile, Task, TaskArchive, TaskStatus, UsageLedger, User, Workflow
from app.services import task_cost_backfill as backfill
from app.services.usage_ledger import ensure_usage_ledger_for_task
from tests.test_review_agent_dispatch import load_functions


CATALOG = "haodeya-qmdh-2026-07-03"
ENDPOINT = "https://newapi.haodeya.xyz/v1"
WHEN = datetime(2026, 10, 10, 12, tzinfo=timezone.utc)


class BackfillContractIdentityTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory(prefix="r27-offline-")))
        self.engine = create_engine("sqlite:///" + str(self.root / "billing.db"))
        self.addCleanup(self.engine.dispose)
        event.listen(self.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        tables = set()
        def include(table):
            if table in tables:
                return
            tables.add(table)
            for key in table.foreign_keys:
                include(key.column.table)
        for model in (Task, ProviderCall, TaskArchive, ProviderCallArchive, UsageLedger, ProviderProfile):
            include(model.__table__)
        Task.metadata.create_all(self.engine, tables=list(tables))
        self.sessions = sessionmaker(self.engine)
        with self.sessions() as db:
            user = User(name="r27-user", role="designer")
            db.add(user)
            db.flush()
            project = Project(code="R27", name="synthetic project", owner_user_id=user.id)
            image = Workflow(key="r27-image", name="Image", description="fixture", provider_capability="image.generate")
            video = Workflow(key="r27-video", name="Video", description="fixture", provider_capability="video.generate")
            db.add_all([project, image, video])
            db.commit()
            self.user_id, self.project_id, self.image_id, self.video_id = user.id, project.id, image.id, video.id
        self.serial = 0
        # Only the old-code baseline needs this credential-loading dependency.
        # Keep its real matching/calculation/ORM paths, but provide no encryption key.
        if hasattr(backfill, "_profile_from_record"):
            self.enterContext(patch.object(backfill, "_profile_from_record", side_effect=lambda row: ImageProviderProfile(
                provider_name=row.provider_name, api_key="synthetic-unused", base_url=row.base_url, model_name=row.model_name,
                pricing_currency=row.pricing_currency, pricing_unit=row.pricing_unit, adapter_config=dict(row.adapter_config or {}))))

    def seed(self, *, model="gemini-3.1-flash-image", cost=0.67, currency="CNY", tier="2k", video=False, endpoint=ENDPOINT, archived=True, historical=True):
        self.serial += 1
        with self.sessions() as db:
            provider = ProviderProfile(provider_name=f"r27-{self.serial}", model_name=model, api_key="synthetic-unused", base_url=endpoint,
                adapter_kind="haodeya_grok" if video else "openai_compatible", capabilities=["video.generate" if video else "image.generate"],
                pricing_currency=currency, pricing_unit="per_video" if video else "per_image", adapter_config={"unit_price_1k": 0.1, "unit_price_2k": 0.2})
            db.add(provider)
            db.flush()
            request_url = endpoint + ("/videos" if video else "/images/generations")
            result = {"output_count": 1, "billing": {} if video else {"resolution_tier": tier}}
            if historical:
                result["request_url"] = request_url
            if video:
                result["video_sku"] = model
            task = Task(title="synthetic", status=TaskStatus.completed, workflow_id=self.video_id if video else self.image_id,
                project_id=self.project_id, user_id=self.user_id, requested_provider=provider.provider_name, classification=DataClassification.b,
                payload={} if video else {"resolution": tier}, result=result, cost=cost, cost_currency=currency, created_at=WHEN)
            db.add(task)
            db.flush()
            call = ProviderCall(task_id=task.id, provider_name=provider.provider_name, model_name=model,
                capability="video.generate" if video else "image.generate", cost=cost, cost_currency=currency,
                request_summary={"execution": {"result": {"request_url": request_url}}} if historical else {}, created_at=WHEN)
            db.add(call)
            db.flush()
            archive = None
            if archived:
                archive = TaskArchive(task_id=task.id, project_id=self.project_id, project_code="R27", project_name="synthetic project",
                    workflow_key="r27-video" if video else "r27-image", workflow_name="Video" if video else "Image",
                    user_id=self.user_id, user_name="r27-user", requested_provider=provider.provider_name, classification=DataClassification.b,
                    task_status=TaskStatus.completed, cost=cost, cost_currency=currency, provider_call_count=1, archive_source="synthetic",
                    task_created_at=WHEN, task_updated_at=WHEN)
                db.add(archive)
                db.flush()
                db.add(ProviderCallArchive(provider_call_id=call.id, task_archive_id=archive.id, provider_name=provider.provider_name,
                    model_name=model, capability=call.capability, cost=cost, cost_currency=currency, call_created_at=WHEN))
                db.flush()
            ensure_usage_ledger_for_task(db, task, ledger_source="synthetic", task_archive=archive)
            db.commit()
            return task.id

    def snapshot(self):
        with self.sessions() as db:
            return {model.__tablename__: [{column.name: getattr(row, column.name) for column in model.__table__.columns} for row in db.scalars(select(model).order_by(model.id))]
                    for model in (Task, ProviderCall, TaskArchive, ProviderCallArchive, UsageLedger, ProviderProfile)}

    def plan(self, *ids):
        entries = []
        with self.sessions() as db:
            for task_id in ids:
                task = db.get(Task, task_id)
                call = db.scalar(select(ProviderCall).where(ProviderCall.task_id == task_id).order_by(ProviderCall.id))
                entries.append({"task_id": task_id, "provider": task.requested_provider, "model": call.model_name,
                                "fingerprint": backfill.backfill_task_fingerprint(db, task)})
        return {"version": 1, "catalog_id": CATALOG, "supplier": "haodeya", "currency": "CNY", "endpoint": ENDPOINT,
                "effective_from": "2026-10-01T00:00:00+00:00", "effective_until": "2026-11-01T00:00:00+00:00",
                "source": "synthetic fixture: independently confirmed historical contract scope, not a real quote", "tasks": entries}

    def run_backfill(self, plan=None, *, dry_run=False, task_ids=None, **kwargs):
        with self.sessions() as db:
            return backfill.backfill_task_costs(db, dry_run=dry_run, task_ids=task_ids, confirmed_plan=plan, **kwargs)

    def test_official_gpt_five_usd_is_not_relabelled_by_unscoped_apply(self):
        task_id = self.seed(model="gpt-image-1", cost=5, currency="USD", tier="1k", endpoint="https://api.openai.com/v1")
        with self.sessions() as db:
            try:
                backfill.backfill_task_costs(db, dry_run=False)
            except ValueError:
                pass
        with self.sessions() as db:
            task = db.get(Task, task_id)
            self.assertEqual((task.cost, task.cost_currency), (5, "USD"))

    def test_shared_adapter_happyhorse_twelve_cny_is_not_repriced_as_grok(self):
        task_id = self.seed(model="happyhorse-1.1-t2v-5s", cost=12, video=True)
        with self.sessions() as db:
            try:
                backfill.backfill_task_costs(db, dry_run=False)
            except ValueError:
                pass
        with self.sessions() as db:
            self.assertEqual(db.get(Task, task_id).cost, 12)

    def test_approved_plan_still_skips_other_origins_and_foreign_currency(self):
        official = self.seed(model="gemini-3.1-flash-image", cost=5, currency="USD", endpoint="https://official.invalid/v1")
        other = self.seed(model="gemini-3.1-flash-image", cost=7, endpoint="https://other-channel.invalid/v1")
        before = self.snapshot()
        result = self.run_backfill(self.plan(official, other))
        self.assertEqual((result.updated, result.skipped), (0, 2))
        self.assertEqual(self.snapshot(), before)
        self.assertTrue(all(row["reason"] != "contract_required" for row in result.samples))

    def test_image_matcher_is_exact_and_shared_adapter_non_grok_skus_stay_untouched(self):
        for name in ["gpt", "gpt-image-1", "prefix-gpt-image-2-suffix", "gemini-any-image"]:
            with self.subTest(model=name):
                self.assertIsNone(backfill._image_contract_adapter(name))
        ids = [self.seed(model=sku, cost=12, video=True) for sku in ["happyhorse-1.1-t2v-5s", "seedance-2-fast-720p-5s"]]
        before = self.snapshot()
        result = self.run_backfill(self.plan(*ids))
        self.assertEqual(result.updated, 0)
        self.assertEqual(self.snapshot(), before)

    def test_confirmed_image_2k_and_exact_grok_sku_update_all_accounting_layers(self):
        image = self.seed()
        video = self.seed(model="x-ai/grok-imagine-video-i2v-10s", cost=1, video=True)
        plan = self.plan(image, video)
        import app.services.model_registry as registry
        with patch.object(registry, "_profile_from_record", side_effect=AssertionError("backfill must not decode current credentials")) as credentials:
            preview = self.run_backfill(plan, dry_run=True)
            applied = self.run_backfill(plan)
            credentials.assert_not_called()
        self.assertEqual((preview.updated, applied.updated), (2, 2))
        for task_id, expected in [(image, 0.95), (video, 6.66)]:
            with self.sessions() as db:
                task = db.get(Task, task_id)
                self.assertEqual((task.cost, task.cost_currency), (expected, "CNY"))
                self.assertEqual(task.result["billing"]["contract_id"], CATALOG)
                self.assertEqual(db.scalar(select(ProviderCall).where(ProviderCall.task_id == task_id)).cost, expected)
                self.assertEqual(db.scalar(select(TaskArchive).where(TaskArchive.task_id == task_id)).cost, expected)
                self.assertTrue(all(row.cost == expected for row in db.scalars(select(UsageLedger).where(UsageLedger.task_id == task_id))))
                archive = db.scalar(select(TaskArchive).where(TaskArchive.task_id == task_id))
                self.assertEqual(db.scalar(select(ProviderCallArchive).where(ProviderCallArchive.task_archive_id == archive.id)).cost, expected)
        sample = applied.samples[0]
        self.assertEqual((sample["old_currency"], sample["new_currency"], sample["model"]), ("CNY", "CNY", "gemini-3.1-flash-image"))
        self.assertEqual(sample["contract_source"], plan["source"])

    def test_strong_historical_identity_survives_current_profile_rename_and_model_change(self):
        task_id = self.seed()
        plan = self.plan(task_id)
        with self.sessions() as db:
            profile = db.scalar(select(ProviderProfile))
            profile.provider_name, profile.model_name, profile.base_url = "later-renamed", "different-model", "https://later.invalid/v1"
            db.commit()
        profiles = self.snapshot()["provider_profiles"]
        result = self.run_backfill(plan)
        self.assertEqual(result.updated, 1)
        self.assertEqual(self.snapshot()["provider_profiles"], profiles)

    def test_current_profile_alone_cannot_supply_missing_historical_endpoint(self):
        task_id = self.seed(historical=False)
        before = self.snapshot()
        result = self.run_backfill(self.plan(task_id))
        self.assertEqual((result.updated, result.skipped), (0, 1))
        self.assertEqual(self.snapshot(), before)
        self.assertIn("historical", result.samples[0]["reason"])

    def test_currency_conflicts_in_call_archive_and_ledger_preserve_the_entire_graph(self):
        ids = []
        for model in (ProviderCall, TaskArchive, ProviderCallArchive, UsageLedger):
            task_id = self.seed()
            ids.append(task_id)
            with self.sessions() as db:
                row = db.scalars(select(model).order_by(model.id.desc())).first()
                row.cost_currency = "USD"
                db.commit()
        for conflicting_snapshot in [{"pricing_unit": "per_request"}, {"unit_price": 0.67}, {"amount_kind": "actual"}, {"source": "invoice"}]:
            task_id = self.seed()
            ids.append(task_id)
            with self.sessions() as db:
                task = db.get(Task, task_id)
                task.result = dict(task.result, billing={**task.result["billing"], **conflicting_snapshot})
                db.commit()
        for conflict in ["archive-model", "archive-capability", "result-model"]:
            task_id = self.seed()
            ids.append(task_id)
            with self.sessions() as db:
                if conflict.startswith("archive-"):
                    archive = db.scalar(select(TaskArchive).where(TaskArchive.task_id == task_id))
                    call = db.scalar(select(ProviderCallArchive).where(ProviderCallArchive.task_archive_id == archive.id))
                    if conflict == "archive-model":
                        call.model_name = "unrelated-model"
                    else:
                        call.capability = "video.generate"
                else:
                    task = db.get(Task, task_id)
                    task.result = dict(task.result, response_model="unrelated-model")
                db.commit()
        before = self.snapshot()
        result = self.run_backfill(self.plan(*ids))
        self.assertEqual((result.updated, result.skipped), (0, 11))
        self.assertEqual(self.snapshot(), before)

    def test_contract_version_source_and_real_call_period_are_required(self):
        task_id = self.seed()
        plan = self.plan(task_id)
        for change in [{"version": 2}, {"version": True}, {"catalog_id": "unknown"}, {"supplier": "official"}, {"currency": "USD"}, {"source": " "}, {"effective_from": "2026-10-01"}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.run_backfill(dict(plan, **change))
        outside = dict(plan, effective_until="2026-10-09T00:00:00+00:00")
        before = self.snapshot()
        self.assertEqual(self.run_backfill(dict(plan, effective_from=WHEN.isoformat()), dry_run=True).updated, 1)
        self.assertEqual(self.run_backfill(dict(plan, effective_until=WHEN.isoformat()), dry_run=True).updated, 0)
        result = self.run_backfill(outside)
        self.assertEqual(result.updated, 0)
        self.assertEqual(self.snapshot(), before)
        self.assertIn("period", result.samples[0]["reason"])

    def test_unscoped_dry_run_is_a_read_only_preview_with_reason_and_fingerprint(self):
        task_id = self.seed()
        before = self.snapshot()
        with self.sessions() as db:
            pending = User(name="pending-unrelated")
            db.add(pending)
            result = backfill.backfill_task_costs(db, dry_run=True)
            self.assertIsNone(pending.id)
            self.assertIn(pending, db.new)
            self.assertEqual(result.updated, 0)
            self.assertEqual(result.samples[0]["reason"], "contract_required")
            self.assertEqual(len(result.samples[0]["fingerprint"]), 64)
        self.assertEqual(self.snapshot(), before)
        plan = self.plan(task_id)
        with self.sessions() as db:
            db.get(Task, task_id)  # An already-open read transaction is not an owned apply transaction.
            with self.assertRaises(ValueError):
                backfill.backfill_task_costs(db, confirmed_plan=plan)
        self.assertEqual(self.snapshot(), before)

    def test_approved_graph_fingerprint_changes_abort_before_any_batch_updates(self):
        first, second = self.seed(), self.seed()
        plan = self.plan(first, second)
        with self.sessions() as db:
            task = db.get(Task, second)
            task.result = dict(task.result, note="concurrently edited")
            db.commit()
        before = self.snapshot()
        with self.assertRaises(ValueError):
            self.run_backfill(plan)
        self.assertEqual(self.snapshot(), before)

    def test_correct_task_with_wrong_ledger_is_repaired_and_repeated_plan_never_duplicates(self):
        task_id = self.seed(cost=0.95)
        with self.sessions() as db:
            db.scalar(select(UsageLedger).where(UsageLedger.source_table == "tasks")).cost = 7
            db.commit()
        plan = self.plan(task_id)
        self.assertEqual(self.run_backfill(plan).updated, 1)
        after = self.snapshot()
        with self.assertRaises(ValueError):
            self.run_backfill(plan)
        self.assertEqual(self.snapshot(), after)
        self.assertEqual(self.run_backfill(self.plan(task_id)).updated, 0)
        self.assertEqual(self.snapshot(), after)

    def test_apply_flush_and_commit_failures_rollback_every_accounting_layer(self):
        first, second = self.seed(), self.seed()
        plan = self.plan(first, second)
        before = self.snapshot()
        original = backfill._apply_billing_to_task
        def fail_second(db, task, billing):
            original(db, task, billing)
            if task.id == second:
                raise RuntimeError("synthetic second task failure")
        for stage in ["second", "flush", "commit"]:
            with self.subTest(stage=stage), self.sessions() as db:
                target, name, value = (backfill, "_apply_billing_to_task", fail_second) if stage == "second" else (db, stage, Mock(side_effect=RuntimeError("synthetic " + stage + " failure")))
                with patch.object(target, name, value), self.assertRaises(RuntimeError):
                    backfill.backfill_task_costs(db, confirmed_plan=plan)
                self.assertEqual(self.snapshot(), before)

    def test_empty_target_list_and_ambiguous_multiple_calls_do_not_widen_scope(self):
        target = self.seed()
        other = self.seed()
        before = self.snapshot()
        self.assertEqual(self.run_backfill(self.plan(target), task_ids=[]).scanned, 0)
        self.assertEqual(self.snapshot(), before)
        with self.sessions() as db:
            call = db.scalar(select(ProviderCall).where(ProviderCall.task_id == other))
            db.add(ProviderCall(task_id=other, provider_name=call.provider_name, model_name=call.model_name, capability=call.capability,
                                cost=call.cost, cost_currency="CNY", created_at=WHEN))
            db.commit()
        orphan = self.seed()
        incomplete = self.seed()
        with self.sessions() as db:
            existing = db.scalar(select(UsageLedger).where(UsageLedger.task_id == orphan, UsageLedger.source_table == "provider_calls"))
            values = {column.name: getattr(existing, column.name) for column in UsageLedger.__table__.columns if column.name not in {"id", "created_at"}}
            values.update(source_id=999999, provider_call_id=999999, cost=7)
            db.add(UsageLedger(**values))
            archive = db.scalar(select(TaskArchive).where(TaskArchive.task_id == incomplete))
            db.delete(db.scalar(select(ProviderCallArchive).where(ProviderCallArchive.task_archive_id == archive.id)))
            db.commit()
        ambiguous = [other, orphan, incomplete]
        before = self.snapshot()
        result = self.run_backfill(self.plan(*ambiguous), task_ids=ambiguous)
        self.assertEqual((result.updated, result.skipped), (0, 3))
        self.assertEqual(self.snapshot(), before)

    def test_four_k_unknown_or_conflicting_image_spec_is_preview_only_until_r28(self):
        ids = [self.seed(tier="4k"), self.seed(tier="auto"), self.seed(tier="2k")]
        with self.sessions() as db:
            task = db.get(Task, ids[-1])
            task.result = dict(task.result, billing={"resolution_tier": "4k"})
            db.commit()
        before = self.snapshot()
        result = self.run_backfill(self.plan(*ids))
        self.assertEqual((result.updated, result.skipped), (0, 3))
        self.assertEqual(self.snapshot(), before)

    def test_cli_plan_constraint_and_temp_database_execution_without_starting_cli_module(self):
        task_id = self.seed()
        namespace = dict(Path=Path, json=json, argparse=argparse, SessionLocal=Mock(wraps=self.sessions), backfill_task_costs=backfill.backfill_task_costs)
        cli = load_functions("app/cli.py", ["_run_task_cost_backfill_cli", "_build_parser"], namespace)["_run_task_cost_backfill_cli"]
        with self.assertRaises((ValueError, SystemExit)):
            cli(SimpleNamespace(dry_run=False, contract_plan=None))
        namespace["SessionLocal"].assert_not_called()
        path = self.root / "confirmed-plan.json"
        path.write_text(json.dumps(self.plan(task_id)), encoding="utf-8")
        output = io.StringIO()
        with redirect_stdout(output):
            args = namespace["_build_parser"]().parse_args(["backfill_task_costs", "--dry-run", "--contract-plan", str(path)])
            self.assertEqual(cli(args), 0)
        data = json.loads(output.getvalue())
        self.assertEqual((data["updated"], data["dry_run"]), (1, True))
        with redirect_stdout(io.StringIO()):
            self.assertEqual(cli(SimpleNamespace(dry_run=False, contract_plan=str(path))), 0)
        with self.sessions() as db:
            self.assertEqual(db.get(Task, task_id).cost, 0.95)
