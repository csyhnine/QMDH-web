"""R23: real per-output asset materialization and its real result consumer."""
import ast
from dataclasses import asdict, dataclass
import logging
from pathlib import Path
from types import SimpleNamespace
import unittest

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker

from app.models import Asset, AssetType, Project, ProviderCall, Task, TaskStatus, User, Workflow


BACKEND = Path(__file__).resolve().parents[1]
SOURCE = BACKEND / "app/services/task_executor.py"


def load_functions(namespace):
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"), filename=str(SOURCE))
    names = {"_materialize_assets", "_build_asset_name", "_build_asset_tags", "_asset_type_for_capability", "execute_task"}
    selected = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
    if {node.name for node in selected} != names:
        raise AssertionError("R23 target functions missing")
    future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
    module = ast.fix_missing_locations(ast.Module(body=[future, *selected], type_ignores=[]))
    exec(compile(module, str(SOURCE), "exec"), namespace)
    return namespace


class OutputAssetTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        self.addCleanup(self.engine.dispose)
        event.listen(self.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        Task.metadata.create_all(self.engine, tables=[model.__table__ for model in (User, Project, Workflow, Task, Asset, ProviderCall)])
        self.sessions = sessionmaker(self.engine)
        self.db = self.sessions()
        self.addCleanup(self.db.close)
        user = User(name="r23-user", role="designer", project_codes=["R23"])
        self.db.add(user); self.db.flush()
        self.project = Project(name="R23 synthetic project", code="R23", owner_user_id=user.id)
        self.workflow = Workflow(key="image-generate", name="R23 fixture", description="fixture",
                                 category="synthetic", provider_capability="image.generate")
        self.db.add_all([self.project, self.workflow]); self.db.flush()
        self.task = Task(title="R23 task", workflow_id=self.workflow.id, project_id=self.project.id,
                         user_id=user.id, requested_provider="r23-synthetic", payload={"prompt": "fixture", "style": "test-style"},
                         result={"storage_paths": ["generated/a.png", "generated/b.png"], "output_count": 2})
        self.db.add(self.task); self.db.commit()
        self.namespace = load_functions({"__name__": "r23_actual_executor_functions", "select": select,
                                        "Asset": Asset, "AssetType": AssetType, "Task": Task, "TaskStatus": TaskStatus,
                                        "Workflow": Workflow, "Project": Project, "ProviderCall": ProviderCall})
        self.materialize = self.namespace["_materialize_assets"]

    def add_asset(self, path, *, task=None, project=None, asset_type=AssetType.image):
        record = Asset(name="keep existing name", asset_type=asset_type,
                       source_task_id=(task or self.task).id, project_id=(project or self.project).id,
                       storage_path=path, prompt_text="keep prompt", tags=["keep-tag"])
        self.db.add(record); self.db.flush()
        return record

    def apply(self):
        return self.materialize(self.db, self.task, self.workflow, self.project)

    def all_assets(self):
        return list(self.db.scalars(select(Asset).order_by(Asset.id)).all())

    def test_new_outputs_create_assets_and_keep_generated_metadata(self):
        assets = self.apply()
        self.assertEqual([a.storage_path for a in assets], ["generated/a.png", "generated/b.png"])
        self.assertEqual([a.name for a in assets], ["R23 task / generated #1", "R23 task / generated #2"])
        for asset in assets:
            self.assertEqual((asset.project_id, asset.source_task_id, asset.asset_type),
                             (self.project.id, self.task.id, AssetType.image))
            self.assertEqual(asset.prompt_text, "fixture")
            self.assertIn("test-style", asset.tags)
        self.db.commit()
        self.assertEqual(len(self.all_assets()), 2)
        for capability, prefix, asset_type in (
            ("image.edit", "edited", AssetType.image),
            ("image.upscale", "upscaled", AssetType.image),
            ("video.generate", "video", AssetType.video),
        ):
            with self.subTest(capability=capability):
                self.workflow.provider_capability = capability
                path = f"generated/{prefix}.synthetic"
                self.task.result = {"storage_path": path}
                item, = self.apply()
                self.assertEqual((item.storage_path, item.asset_type, item.name),
                                 (path, asset_type, f"R23 task / {prefix}"))

    def test_unrelated_attachment_does_not_mask_outputs_or_task_result_ids(self):
        attachment = self.add_asset("attachments/reference.png")
        self.db.commit()
        attachment_id, task_id = attachment.id, self.task.id

        @dataclass(frozen=True)
        class Outcome:
            model_name: str = "r23-model"
            latency_ms: int = 1
            cost: float = 0.5
            cost_currency: str = "CNY"
            outbound: bool = False
            result: dict = None

        outcome = Outcome(result={"storage_paths": ["generated/a.png", "generated/b.png"], "output_count": 2,
                                  "adapter_mode": "synthetic", "summary": "synthetic success"})
        calls = []
        def unexpected(exc, **kwargs):
            raise AssertionError(f"Unexpected executor failure: {type(exc).__name__}")
        self.namespace.update({
            "SessionLocal": self.sessions, "ComfyUIProviderAdapter": type("NoComfyExecution", (), {}),
            "StrategyProviderAdapter": type("NoStrategyExecution", (), {}),
            "OpenAIImageProviderAdapter": type("NoImageCheckpointExecution", (), {}),
            "get_provider_adapter": lambda *args: SimpleNamespace(execute=lambda *args: outcome),
            "settings": SimpleNamespace(task_execution_mode="redis"), "asdict": asdict,
            "_reference_image_result_fields": lambda payload: {}, "_task_payload_result_fields": lambda payload: {},
            "ensure_usage_ledger_for_task": lambda db, task, **kwargs: calls.append(task.id),
            "sync_generation_intent_from_task": lambda db, task: None,
            "_diagnostics_from_exception": unexpected, "logger": logging.getLogger("r23.offline"),
        })
        # Execute the current real success branch; no original executor module,
        # provider adapter, media storage, intent or billing service is imported.
        self.namespace["execute_task"](task_id)
        self.db.expire_all()
        task = self.db.get(Task, task_id)
        self.assertEqual(task.status, TaskStatus.completed)
        self.assertEqual(task.result["asset_storage_paths"], ["generated/a.png", "generated/b.png"])
        self.assertEqual(len(task.result["asset_ids"]), 2)
        self.assertNotIn(attachment_id, task.result["asset_ids"])
        self.assertEqual(task.result["asset_id"], task.result["asset_ids"][0])
        self.assertEqual(len(self.all_assets()), 3)
        self.assertEqual(self.db.get(Asset, attachment_id).storage_path, "attachments/reference.png")
        self.assertEqual(calls, [task_id])

    def test_partial_outputs_are_completed_and_repeated_calls_are_idempotent(self):
        self.task.result = {"storage_paths": ["generated/a.png"], "output_count": 1}
        first = self.apply()[0]
        first_id = first.id
        self.task.result = {"storage_paths": ["generated/a.png", "generated/b.png"], "output_count": 2}
        second = self.apply()
        self.assertEqual(len(second), 2)
        self.assertEqual(second[0].id, first_id)
        self.assertEqual([a.id for a in self.apply()], [a.id for a in second])
        self.db.commit()
        self.assertEqual(len(self.all_assets()), 2)

    def test_matching_rows_reuse_stable_ids_without_rewriting_metadata(self):
        first = self.add_asset("generated/a.png")
        duplicate = self.add_asset("generated/a.png")
        second = self.add_asset("generated/b.png")
        original = [(a.id, a.name, a.prompt_text, list(a.tags)) for a in self.all_assets()]
        output = self.apply()
        self.assertEqual([a.id for a in output], [first.id, second.id])
        self.assertNotIn(duplicate.id, [a.id for a in output])
        self.assertEqual([(a.id, a.name, a.prompt_text, list(a.tags)) for a in self.all_assets()], original)

    def test_empty_outputs_and_unsupported_capability_do_not_return_attachments(self):
        attachment = self.add_asset("attachments/reference.png")
        for result in ({}, {"storage_paths": []}, {"storage_paths": ["", " "]}):
            with self.subTest(result=result):
                self.task.result = result
                self.assertEqual(self.apply(), [])
        self.task.result = {"storage_path": "generated/single.png"}
        self.assertEqual([a.storage_path for a in self.apply()], ["generated/single.png"])
        self.workflow.provider_capability = "chat.completions"
        self.assertEqual(self.apply(), [])
        self.assertIsNotNone(self.db.get(Asset, attachment.id))

    def test_order_duplicates_and_other_task_rows_do_not_expand_result(self):
        other = Task(title="other", workflow_id=self.workflow.id, project_id=self.project.id,
                     user_id=self.task.user_id, requested_provider="r23-synthetic", payload={}, result={})
        self.db.add(other); self.db.flush()
        other_asset = self.add_asset("generated/b.png", task=other)
        first = self.add_asset("generated/a.png")
        attachment = self.add_asset("attachments/reference.png")
        self.task.result = {"storage_paths": ["generated/b.png", "generated/a.png", "generated/b.png"]}
        outputs = self.apply()
        self.assertEqual([a.storage_path for a in outputs], ["generated/b.png", "generated/a.png"])
        self.assertEqual(outputs[1].id, first.id)
        self.assertNotIn(other_asset.id, [a.id for a in outputs])
        self.assertNotIn(attachment.id, [a.id for a in outputs])
        self.assertEqual([a.id for a in self.apply()], [a.id for a in outputs])
        self.assertEqual(len(self.all_assets()), 4)

    def test_flush_failure_rollback_preserves_existing_assets(self):
        attachment = self.add_asset("attachments/reference.png")
        self.db.commit(); attachment_id = attachment.id
        def fail_second(mapper, connection, target):
            if target.storage_path == "generated/b.png":
                raise RuntimeError("synthetic second insert failure")
        event.listen(Asset, "before_insert", fail_second)
        try:
            with self.assertRaisesRegex(RuntimeError, "second insert failure"):
                self.apply()
        finally:
            event.remove(Asset, "before_insert", fail_second)
            self.db.rollback()
        self.assertEqual([a.id for a in self.all_assets()], [attachment_id])
        self.assertEqual(self.db.get(Asset, attachment_id).tags, ["keep-tag"])


if __name__ == "__main__":
    unittest.main()
