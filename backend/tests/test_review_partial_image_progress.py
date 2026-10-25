"""R19: real image loop, durable ORM checkpoints and ledgers; offline I/O only."""
import ast
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timedelta, timezone
from io import BytesIO
import json
from hashlib import sha256
import logging
from pathlib import Path
import re
import sys
from tempfile import TemporaryDirectory
from time import perf_counter
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

from PIL import Image
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from app.core.config import ImageProviderProfile
from app.models import (
    Asset, AssetType, Project, ProviderCall, ProviderCallArchive, Task, TaskArchive,
    TaskDispatch, TaskStatus, UsageLedger, User, Workflow,
)


BACKEND = Path(__file__).resolve().parents[1]


class ProcessExited(BaseException):
    pass


def load(relative, namespace, *, functions=(), classes=(), patterns=False):
    path = BACKEND / relative
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    selected = [node for node in tree.body if
                (isinstance(node, ast.FunctionDef) and node.name in functions) or
                (isinstance(node, ast.ClassDef) and node.name in classes) or
                (patterns and isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id.endswith("_PATTERN") for t in node.targets))]
    future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
    exec(compile(ast.fix_missing_locations(ast.Module(body=[future, *selected], type_ignores=[])), str(path), "exec"), namespace)
    return namespace


class PartialImageProgressTests(unittest.TestCase):
    def setUp(self):
        self.temporary = Path(self.enterContext(TemporaryDirectory(prefix="r19-offline-")))
        self.engine = create_engine("sqlite:///" + str(self.temporary / "task.db"))
        self.addCleanup(self.engine.dispose)
        event.listen(self.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        tables = set()
        def include(table):
            if table in tables: return
            tables.add(table)
            for key in table.foreign_keys: include(key.column.table)
        for model in (Task, Asset, ProviderCall, TaskArchive, ProviderCallArchive, UsageLedger, TaskDispatch): include(model.__table__)
        Task.metadata.create_all(self.engine, tables=list(tables))
        self.sessions = sessionmaker(self.engine)
        with self.sessions() as db:
            user = User(name="r19-user", role="designer", project_codes=["R19"])
            db.add(user); db.flush()
            project = Project(name="R19 fixture", code="R19", owner_user_id=user.id)
            workflow = Workflow(key="image-generate", name="fixture", description="fixture", category="fixture", provider_capability="image.generate")
            db.add_all([project, workflow]); db.flush()
            task = Task(title="R19 batch", workflow_id=workflow.id, project_id=project.id, user_id=user.id,
                        requested_provider="r19-provider", payload={"prompt": "synthetic", "image_count": 2}, result={})
            db.add(task); db.flush(); self.task_id = task.id; db.commit()
        self.profile = ImageProviderProfile(provider_name="r19-provider", api_key="synthetic-unused",
                                            base_url="https://provider.invalid", model_name="r19-model",
                                            pricing_unit="per_image", unit_price=2.0)
        self.definition = SimpleNamespace(provider_name="r19-provider", model_name="r19-model", outbound=False)
        self.plan = SimpleNamespace(body={"model": "r19-model", "n": 1}, headers={"Authorization": "synthetic-unused"},
                                    endpoint_path="/images/generations", multipart_files=(), reference_result={},
                                    adapter_mode="synthetic_image", effective_capability="image.generate", strategy="synthetic")
        self.submissions, self.persisted = [], []
        self.failure = None
        self.inspect_before_second = None
        self.revoke_after_first = False
        base = load("app/services/provider_adapters/base.py", {"dataclass": dataclass},
                    classes=["ExecutionOutcome", "RequestDiagnostics", "ProviderExecutionError", "ProviderAdapter"])
        ledger = load("app/services/usage_ledger.py", {"select": select, "datetime": datetime, "timezone": timezone,
                      "Task": Task, "TaskArchive": TaskArchive, "ProviderCall": ProviderCall,
                      "ProviderCallArchive": ProviderCallArchive, "UsageLedger": UsageLedger},
                      functions=["_now", "_task_billing_snapshot", "_task_output_count", "_reference_image_count",
                                 "compose_task_input_summary", "build_task_input_usage_payload", "resolve_task_usage_meta", "ensure_usage_ledger_for_task"])
        pricing = load("app/services/provider_adapters/video_common.py", {},
                       functions=["resolve_profile_tier_unit_price", "calculate_tiered_media_billing"])
        # Supply only the real pricing functions, avoiding the video's media and
        # network imports. No pricing return value is mocked.
        common_module = ModuleType("app.services.provider_adapters.video_common")
        common_module.calculate_tiered_media_billing = pricing["calculate_tiered_media_billing"]
        comfy_module = ModuleType("app.services.provider_adapters.comfyui")
        comfy_module.ComfyDeferred = type("ComfyDeferred", (Exception,), {})
        self.enterContext(patch.dict(sys.modules, {common_module.__name__: common_module, comfy_module.__name__: comfy_module}))
        async_errors = load("app/services/provider_adapters/async_progress.py", {}, classes=["UpstreamTaskFailed"])
        self.namespace = {
            "__name__": "r19_actual_image_execution", **base, **async_errors, "sha256": sha256, "asdict": asdict, "json": json, "re": re,
            "perf_counter": perf_counter, "select": select, "Task": Task, "TaskStatus": TaskStatus,
            "Asset": Asset, "AssetType": AssetType, "ProviderCall": ProviderCall, "Workflow": Workflow, "Project": Project,
            "SessionLocal": self.sessions, "settings": SimpleNamespace(task_execution_mode="redis"),
            "logger": logging.getLogger("r19.offline"), "ComfyUIProviderAdapter": type("NoComfyExecution", (), {}),
            "ensure_usage_ledger_for_task": ledger["ensure_usage_ledger_for_task"],
            "sync_generation_intent_from_task": lambda *args: None,
            "_reference_image_result_fields": lambda payload: {}, "_task_payload_result_fields": lambda payload: {},
            "_build_image_request_plan": lambda **kwargs: self.plan,
            "_uses_modelscope_async_mode": lambda profile: False,
            "_extract_image_data": lambda response: response.get("data", []),
            "_submit_image_generation_request": self.submit,
            "_persist_generated_image": self.persist,
            "_poll_haodeya_async_image_result": self.poll,
            "_upstream_request_excerpt": lambda body: {"model": body["model"]},
            "get_provider_definition": lambda *args: self.definition,
        }
        load("app/services/task_executor.py", self.namespace, patterns=True,
             classes=["OpenAIImageProviderAdapter", "StrategyProviderAdapter"],
             functions=["execute_task", "_materialize_assets", "_build_asset_tags", "_build_asset_name", "_asset_type_for_capability",
                        "_request_diagnostics_for_plan", "_request_diagnostics_payload", "_diagnostics_from_exception",
                        "_calculate_image_billing", "_normalize_image_resolution", "_requested_image_count",
                        "_sanitize_error_text", "_stage_metadata", "_build_failure_result",
                        "_image_progress_outcome", "_upsert_image_progress_call", "_haodeya_async_api_root", "_profile_adapter_config",
                        "_extract_toapis_task_id", "_extract_toapis_polling_url", "_haodeya_async_poll_url", "_extract_toapis_poll_image_data"])
        self.make_adapter()

    def make_adapter(self, *, strategy=False):
        image = self.namespace["OpenAIImageProviderAdapter"](self.definition, self.profile)
        if strategy:
            wrapper = object.__new__(self.namespace["StrategyProviderAdapter"])
            wrapper.image_adapter = image
            wrapper.definition = self.definition
            wrapper.profile = self.profile
            self.adapter = wrapper
        else:
            self.adapter = image
        self.namespace["get_provider_adapter"] = lambda *args: self.adapter

    def submit(self, **kwargs):
        number = len(self.submissions) + 1
        if number == 2 and self.inspect_before_second:
            self.inspect_before_second()
        self.submissions.append(number)
        if number == 1 and self.failure == "multi_download":
            return {"id": "synthetic-multiple", "model": "r19-model", "usage": {"input_tokens": 11},
                    "data": [{"fixture_number": 1}, {"fixture_number": 2}]}
        if number == 2 and self.failure == "submit":
            raise RuntimeError("synthetic second submit failure")
        if number == 2 and self.failure == "poll":
            return {"id": "synthetic-upstream-2", "usage": {"input_tokens": 12}}
        return {"id": f"synthetic-upstream-{number}", "model": "r19-model", "usage": {"input_tokens": 10 + number}, "data": [{"fixture_number": number}]}

    def poll(self, profile, response, **kwargs):
        raise RuntimeError("haodeya async image poll request failed: synthetic offline")

    def persist(self, **kwargs):
        number = kwargs["image_payload"]["fixture_number"]
        if number == 2 and self.failure in {"download", "multi_download"}:
            raise RuntimeError("generated image download request failed: synthetic offline")
        path = f"generated/fixture-{number}.png"
        target = self.temporary / path
        target.parent.mkdir(parents=True, exist_ok=True)
        buffer = BytesIO(); Image.new("RGB", (1, 1), (number, 0, 0)).save(buffer, format="PNG")
        target.write_bytes(buffer.getvalue())
        self.persisted.append(path)
        if number == 1 and self.revoke_after_first:
            with self.sessions() as db:
                job = db.get(TaskDispatch, self.task_id); job.lease_owner = "new-owner"; db.commit()
        return path, (1, 1)

    def execute(self, token=None):
        self.namespace["execute_task"](self.task_id, dispatch_token=token)

    def snapshot(self):
        with self.sessions() as db:
            task = db.get(Task, self.task_id)
            return SimpleNamespace(status=task.status, result=json.loads(json.dumps(task.result)), cost=task.cost,
                                   assets=[(a.id, a.storage_path) for a in db.scalars(select(Asset).where(Asset.source_task_id == task.id)).all()],
                                   calls=[(c.id, c.cost, c.request_summary) for c in db.scalars(select(ProviderCall).where(ProviderCall.task_id == task.id)).all()],
                                   ledgers=[(l.source_table, l.cost, l.usage_payload, l.error_summary) for l in db.scalars(select(UsageLedger).where(UsageLedger.task_id == task.id)).all()])

    def assert_partial(self, status=TaskStatus.failed):
        state = self.snapshot()
        self.assertEqual(state.status, status)
        self.assertEqual(state.result["storage_paths"], ["generated/fixture-1.png"])
        self.assertEqual(len(state.assets), 1)
        self.assertEqual(state.cost, 2.0)
        self.assertTrue(state.result["billing"]["additional_cost_unknown"])
        self.assertEqual(state.result["usage_records"][0]["input_tokens"], 11)
        with Image.open(self.temporary / state.assets[0][1]) as image:
            self.assertEqual(image.size, (1, 1))
        return state

    def test_second_submit_failure_keeps_completed_output_usage_and_known_cost(self):
        def durable_before_second():
            state = self.snapshot()
            self.assertEqual(len(state.assets), 1)
            self.assertEqual(state.cost, 2.0)
            self.assertEqual(state.result["usage_records"][0]["input_tokens"], 11)
        self.inspect_before_second = durable_before_second
        self.failure = "submit"; self.execute()
        self.assert_partial()
        self.assertEqual(self.submissions, [1, 2])

    def test_poll_and_download_failures_keep_prior_outputs_and_unknown_fee_marker(self):
        for index, failure in enumerate(("poll", "download", "multi_download")):
            if index:
                with self.sessions() as db:
                    original = db.get(Task, self.task_id)
                    task = Task(title="next", workflow_id=original.workflow_id, project_id=original.project_id,
                                user_id=original.user_id, requested_provider=original.requested_provider,
                                payload=original.payload, result={})
                    db.add(task); db.flush(); self.task_id = task.id; db.commit()
                self.submissions.clear(); self.persisted.clear(); self.make_adapter(); self.plan.adapter_mode = "synthetic_image"
            with self.subTest(failure=failure):
                self.failure = failure
                if failure == "poll": self.plan.adapter_mode = "haodeya_async_image"
                self.execute()
                state = self.assert_partial(status=TaskStatus.pending if failure == "poll" else TaskStatus.failed)
                self.assertTrue(any("待核对" in row[3] for row in state.ledgers))
                self.assertEqual(self.submissions, [1] if failure == "multi_download" else [1, 2])

    def test_hard_stop_after_checkpoint_resumes_without_resubmitting_completed_step(self):
        def interrupt(db):
            for item in db.identity_map.values():
                if isinstance(item, Task) and item.id == self.task_id:
                    steps = item.result.get("generation_progress", {}).get("steps", [])
                    if len(steps) == 1 and steps[0].get("state") == "completed": raise ProcessExited()
        event.listen(self.sessions, "after_commit", interrupt)
        try:
            with self.assertRaises(ProcessExited): self.execute()
        finally:
            event.remove(self.sessions, "after_commit", interrupt)
        self.assertEqual(self.submissions, [1])
        self.assertEqual(len(self.snapshot().assets), 1)
        self.profile = replace(self.profile, model_name="changed-model")
        self.plan.body["model"] = "changed-model"
        self.make_adapter(); self.execute()
        self.assertEqual(self.snapshot().status, TaskStatus.failed)
        self.assertEqual(self.submissions, [1], "a changed model cannot silently continue the old priced batch")
        self.plan.body["model"] = "r19-model"
        self.profile = replace(self.profile, model_name="r19-model")
        self.profile = replace(self.profile, unit_price=99.0)
        self.make_adapter(); self.execute()
        state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.completed)
        self.assertEqual(self.submissions, [1, 2])
        self.assertEqual(state.cost, 4.0, "resume uses the original logical task price snapshot")
        self.assertEqual(len(state.assets), 2)

    def test_uncertain_step_is_not_automatically_posted_again(self):
        self.failure = "submit"; self.execute(); self.assert_partial()
        self.failure = None; self.make_adapter(); self.execute()
        self.assertEqual(self.submissions, [1, 2])
        self.assert_partial()

    def test_checkpoint_failure_stops_later_submission_and_never_reports_success(self):
        failed = False
        def fail_commit(db):
            nonlocal failed
            for item in db.identity_map.values():
                if isinstance(item, Task):
                    steps = item.result.get("generation_progress", {}).get("steps", [])
                    if not failed and steps and steps[-1].get("state") == "completed":
                        failed = True
                        raise OperationalError("synthetic checkpoint", {}, RuntimeError("offline database fault"))
        event.listen(self.sessions, "before_commit", fail_commit)
        try: self.execute()
        finally: event.remove(self.sessions, "before_commit", fail_commit)
        self.assertTrue(failed)
        self.assertEqual(self.submissions, [1])
        self.assertEqual(self.snapshot().status, TaskStatus.failed)
        self.assertEqual(len(self.snapshot().assets), 1)
        # A persistent failure cannot be relabeled as safely committed failure.
        with self.sessions() as db:
            original = db.get(Task, self.task_id)
            task = Task(title="persistent DB fault", workflow_id=original.workflow_id, project_id=original.project_id,
                        user_id=original.user_id, requested_provider=original.requested_provider, payload=original.payload, result={})
            db.add(task); db.flush(); self.task_id = task.id; db.commit()
        self.submissions.clear(); self.persisted.clear(); self.make_adapter()
        def always_fail_completed(db):
            for item in db.identity_map.values():
                if isinstance(item, Task):
                    steps = item.result.get("generation_progress", {}).get("steps", [])
                    if steps and steps[-1].get("state") == "completed":
                        raise OperationalError("persistent checkpoint", {}, RuntimeError("persistent synthetic DB fault"))
        event.listen(self.sessions, "before_commit", always_fail_completed)
        try:
            with self.assertRaises(OperationalError): self.execute()
        finally:
            event.remove(self.sessions, "before_commit", always_fail_completed)
        state = self.snapshot()
        self.assertEqual(self.submissions, [1])
        self.assertNotEqual(state.status, TaskStatus.completed)
        self.assertEqual(len(state.assets), 1, "earlier committed prefix remains readable")
        self.assertEqual(state.result["generation_progress"]["steps"][0]["state"], "persisting")

    def test_full_success_keeps_per_image_and_once_per_task_request_billing(self):
        for pricing, cost in (("per_image", 4.0), ("per_request", 2.0)):
            with self.subTest(pricing=pricing):
                self.profile = replace(self.profile, pricing_unit=pricing); self.make_adapter(); self.execute()
                state = self.snapshot()
                self.assertEqual(state.status, TaskStatus.completed)
                self.assertEqual(state.cost, cost)
                self.assertFalse(state.result["billing"]["additional_cost_unknown"])
                self.assertEqual(len(state.calls), 1)
                if pricing == "per_image":
                    with self.sessions() as db:
                        original = db.get(Task, self.task_id)
                        task = Task(title="per request", workflow_id=original.workflow_id, project_id=original.project_id,
                                    user_id=original.user_id, requested_provider=original.requested_provider, payload=original.payload, result={})
                        db.add(task); db.flush(); self.task_id = task.id; db.commit()
                    self.submissions.clear(); self.persisted.clear()

    def test_stale_lease_cannot_checkpoint_or_send_next_step(self):
        with self.sessions() as db:
            db.add(TaskDispatch(task_id=self.task_id, user_id=db.get(Task, self.task_id).user_id,
                                lane="default", state="leased", lease_owner="old-owner", lease_until=datetime.now(timezone.utc) + timedelta(minutes=5)))
            db.commit()
        self.revoke_after_first = True
        self.execute("old-owner")
        self.assertEqual(self.submissions, [1])
        state = self.snapshot()
        self.assertNotEqual(state.status, TaskStatus.completed)
        self.assertEqual(len(state.assets), 0, "stale worker cannot commit its just-written file")

    def test_provider_and_task_ledgers_are_upserted_and_keep_output_usage(self):
        self.execute(); state = self.snapshot()
        self.assertEqual(len(state.calls), 1)
        self.assertEqual(len(state.ledgers), 2)
        for source, cost, payload, error in state.ledgers:
            self.assertEqual(cost, 4.0)
            self.assertEqual([u["input_tokens"] for u in payload["usage_records"]], [11, 12])
            self.assertFalse(payload["billing"]["additional_cost_unknown"])
        ids = [a[0] for a in state.assets]
        self.make_adapter(); self.execute(); repeated = self.snapshot()
        self.assertEqual(self.submissions, [1, 2])
        self.assertEqual([a[0] for a in repeated.assets], ids)
        self.assertEqual(len(repeated.calls), 1); self.assertEqual(len(repeated.ledgers), 2)

    def test_direct_adapter_error_carries_partial_outcome(self):
        self.failure = "submit"
        error = self.namespace["ProviderExecutionError"]
        with self.assertRaises(error) as caught:
            self.adapter.execute("image.generate", {"prompt": "synthetic", "image_count": 2})
        partial = caught.exception.partial_outcome
        self.assertEqual(partial.result["storage_paths"], ["generated/fixture-1.png"])
        self.assertEqual(partial.cost, 2.0)
        self.assertTrue(partial.result["billing"]["additional_cost_unknown"])

    def test_strategy_wrapper_and_non_image_path_keep_existing_contract(self):
        self.make_adapter(strategy=True); self.failure = "submit"; self.execute(); self.assert_partial()
        with self.sessions() as db:
            task = db.get(Task, self.task_id)
            task.result = {}; task.status = TaskStatus.pending
            db.get(Workflow, task.workflow_id).provider_capability = "synthetic.other"
            db.commit()
        def fail(*args): raise ValueError("ordinary synthetic failure")
        self.namespace["get_provider_adapter"] = lambda *args: SimpleNamespace(execute=fail)
        self.execute()
        self.assertEqual(self.snapshot().status, TaskStatus.failed)
        self.assertNotIn("generation_progress", self.snapshot().result)


if __name__ == "__main__":
    unittest.main()
