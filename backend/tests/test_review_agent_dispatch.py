"""R05: real creation/commit/outbox/claim, no app startup or task execution."""
import ast
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from uuid import uuid4
from app.services.submission_idempotency import submit_once

from fastapi import Depends, HTTPException
from sqlalchemy import create_engine, event, func, select, text
from sqlalchemy.orm import sessionmaker

from app.models import (
    AgentClient, AgentJob, AuditLog, DataClassification, Project, Task,
    TaskDispatch, TaskStatus, User, Workflow,
)


BACKEND = Path(__file__).resolve().parents[1]


class ProcessExited(BaseException):
    """Simulate a hard stop after durable commit, before Redis receives a wakeup."""


def load_functions(relative, names, namespace):
    source = BACKEND / relative
    tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
    selected = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
    if {node.name for node in selected} != set(names):
        raise AssertionError(f"Missing targeted functions: {relative}")
    for node in selected:
        node.decorator_list = []  # HTTP registration is outside this transaction test.
    constants = [node for node in tree.body if isinstance(node, ast.Assign)
                 and any(isinstance(target, ast.Name) and target.id == "LEASE_SECONDS" for target in node.targets)]
    future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
    module = ast.fix_missing_locations(ast.Module(body=[future, *constants, *selected], type_ignores=[]))
    exec(compile(module, str(source), "exec"), namespace)
    return namespace


class AgentDispatchTests(unittest.TestCase):
    def setUp(self):
        temporary = self.enterContext(TemporaryDirectory(prefix="r05-offline-"))
        self.engine = create_engine("sqlite:///" + str(Path(temporary) / "dispatch.db"))
        self.addCleanup(self.engine.dispose)
        event.listen(self.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        # Create exactly the real Task/Job/Dispatch/Audit dependency closure, not
        # the application or all model tables. No seed or maintenance functions.
        tables = set()
        def include(table):
            if table in tables:
                return
            tables.add(table)
            for key in table.foreign_keys:
                include(key.column.table)
        for model in (Task, AgentJob, TaskDispatch, AuditLog):
            include(model.__table__)
        Task.metadata.create_all(self.engine, tables=list(tables))
        self.sessions = sessionmaker(self.engine)
        self.db = self.sessions()
        self.addCleanup(self.db.close)
        self.user = User(name="r05-user", role="designer", project_codes=["R05"])
        self.db.add(self.user)
        self.db.flush()
        self.project = Project(name="R05 fixture", code="R05", owner_user_id=self.user.id)
        self.client = AgentClient(key="r05-client", token_hash="synthetic-unused", user_id=self.user.id)
        self.db.add_all([self.project, self.client, *[
            Workflow(key=key, name=key, description="fixture", provider_capability=capability)
            for key, capability in [("image-generate", "image.generate"), ("image-edit", "image.edit"), ("video-generate", "video.generate")]
        ]])
        self.db.commit()
        self.auth = SimpleNamespace(client_id=self.client.id, user_id=self.user.id,
                                    user_name=self.user.name, key=self.client.key,
                                    device_id="fixture", external_execution_id="")
        self.settings = SimpleNamespace(task_execution_mode="redis")
        self.provider = SimpleNamespace(adapter_kind="synthetic", capabilities=["image.generate", "image.edit", "video.generate"])
        self.wakeups, self.executions, self.background = [], [], []
        self.wakeup_error = None
        self.dispatch = load_functions("app/services/task_dispatch.py", ["add_dispatch", "claim", "recover_leases", "_lock", "utcnow"], {
            "__name__": "r05_actual_dispatch", "Task": Task, "TaskDispatch": TaskDispatch,
            "TaskStatus": TaskStatus, "select": select, "text": text,
            "datetime": datetime, "timedelta": timedelta, "timezone": timezone,
            "uuid4": uuid4, "SessionLocal": self.sessions,
        })

        def wake(task_id):
            self.wakeups.append(task_id)
            if self.wakeup_error:
                raise self.wakeup_error

        def execute(task_id):
            # Assert only which execution boundary is selected. Never import or
            # invoke the real executor, adapters, providers or media storage.
            self.executions.append(task_id)

        def forbidden_failure(*args, **kwargs):
            raise AssertionError("Redis wakeup must not fail a durable accepted task")

        def audit(*, db, **values):
            db.add(AuditLog(**values))

        common = {
            "__name__": "r05_creation_under_test", "Task": Task, "TaskStatus": TaskStatus,
            "User": User, "Workflow": Workflow, "Project": Project, "AgentJob": AgentJob,
            "select": select, "datetime": datetime, "timezone": timezone, "HTTPException": HTTPException,
            "Depends": Depends, "get_db": lambda: None, "get_current_agent_auth": lambda: None,
            "DataClassification": DataClassification, "settings": self.settings,
            "add_dispatch": self.dispatch["add_dispatch"], "submit_once": submit_once,
            "get_provider_definition": lambda *args: self.provider,
            "get_provider_map": lambda db: {"r05-provider": self.provider},
            "_reference_image_storage_paths": lambda payload: [],
            "_reference_image_count": lambda payload: 0,
            "enqueue_task": wake, "execute_task": execute,
            "mark_task_enqueue_failed": forbidden_failure,
        }
        self.agent = load_functions("app/routers/agent.py", ["_create_agent_job", "_create_image_task", "_agent_image_submission_key", "_submit_agent_image_task", "create_agent_image_generate", "create_agent_image_edit"], {
            **common, "_get_or_create_agent_user": lambda *args: self.user,
            "_resolve_project": lambda *args: self.project, "_request_id": lambda request: "r05-request",
            "write_audit_log": audit, "_mark_agent_job_enqueue_failed": forbidden_failure,
            "_to_job_out": lambda db, job: job,
        })
        self.chat = load_functions("app/services/chat_agent_task_service.py", ["submit_confirmed_chat_agent_task"], {
            **common, "_validate_write_tool_allowed": lambda *args: None,
            "_validate_task_inputs": lambda *args, **kwargs: None,
            "_get_or_create_user": lambda *args: self.user,
            "enforce_user_quota": lambda *args, **kwargs: None,
            "_task_payload_result_fields": lambda payload: {}, "_to_task_out": lambda task: task,
        })

    def submit(self, entry="generate"):
        background = SimpleNamespace(add_task=lambda fn, task_id: self.background.append((fn, task_id)))
        if entry == "chat":
            proposal = SimpleNamespace(workflow_key="image-generate", project_code="R05", requested_provider="r05-provider",
                                       payload={"prompt": "synthetic"}, title="R05 Chat", classification="B", proposal_id=getattr(self, "proposal_id", "synthetic-proposal"))
            task = self.chat["submit_confirmed_chat_agent_task"](
                self.db, auth_user=self.auth, policy=SimpleNamespace(), proposal=proposal,
                background_tasks=background if self.settings.task_execution_mode != "inline" else None,
            )
            return task.id
        values = dict(title="R05 Agent", workflow_key="image-generate", requested_provider="r05-provider",
                      classification=DataClassification.b, payload={"prompt": "synthetic"}, project_id=self.project.id,
                      external_execution_id="")
        payload = SimpleNamespace(**values)
        payload.model_dump = lambda: {**values, "workflow_key": payload.workflow_key}
        job = self.agent["create_agent_image_edit" if entry == "edit" else "create_agent_image_generate"](
            payload=payload, request=None, background_tasks=background, db=self.db, agent_auth=self.auth,
        )
        return job.task_id

    def assert_durable(self, task_id, *, lane="default", state="queued"):
        # A new connection sees only committed rows, like a restarted worker.
        with self.sessions() as fresh:
            task = fresh.get(Task, task_id)
            job = fresh.get(TaskDispatch, task_id)
            self.assertIsNotNone(task)
            self.assertIsNotNone(job, "accepted task needs a committed outbox row")
            self.assertEqual(task.status, TaskStatus.pending)
            self.assertEqual((job.lane, job.state, job.user_id), (lane, state, task.user_id))
            if task.result.get("chat_agent_proposal_id"):
                self.assertTrue(job.submission_key.startswith("si1_"))
                self.assertEqual(len(job.request_hash), 64)
            else:
                self.assertIsNone(job.submission_key, "Agent calls without stable identity remain unkeyed")

    def test_committed_agent_tasks_survive_exit_before_wakeup(self):
        for entry in ("generate", "edit"):
            with self.subTest(entry=entry):
                self.wakeup_error = ProcessExited()
                with self.assertRaises(ProcessExited):
                    self.submit(entry)
                task_id = self.wakeups[-1]
                self.assert_durable(task_id)
                with self.sessions() as fresh:
                    job = fresh.scalar(select(AgentJob).where(AgentJob.task_id == task_id))
                    self.assertEqual(job.status, "accepted")
                    self.assertIsNotNone(fresh.scalar(select(AuditLog).where(AuditLog.target_id == task_id)))
                self.assertEqual(self.dispatch["claim"]()[0], task_id)
        self.assertFalse(self.executions)

    def test_committed_chat_tasks_survive_exit_before_wakeup(self):
        self.wakeup_error = ProcessExited()
        with self.assertRaises(ProcessExited):
            self.submit("chat")
        task_id = self.wakeups[-1]
        self.assert_durable(task_id)
        self.assertEqual(self.dispatch["claim"]()[0], task_id)
        with self.sessions() as fresh:
            self.assertEqual(fresh.get(Task, task_id).result["chat_agent_proposal_id"], "synthetic-proposal")
        self.assertFalse(self.executions)

    def test_redis_wakeup_failure_keeps_agent_and_chat_accepted(self):
        self.wakeup_error = RuntimeError("synthetic redis failure")
        for entry in ("generate", "edit", "chat"):
            with self.subTest(entry=entry):
                task_id = self.submit(entry)
                self.assert_durable(task_id)
                self.assertEqual(self.dispatch["claim"]()[0], task_id)
        self.assertFalse(self.executions)

    def test_commit_failure_rolls_back_task_job_dispatch_and_audit(self):
        def fail_commit(session):
            raise RuntimeError("synthetic commit failure")
        for entry in ("generate", "edit", "chat"):
            with self.subTest(entry=entry):
                event.listen(self.db, "before_commit", fail_commit)
                try:
                    with self.assertRaisesRegex(RuntimeError, "synthetic commit failure"):
                        self.submit(entry)
                finally:
                    event.remove(self.db, "before_commit", fail_commit)
                    self.db.rollback()
                with self.sessions() as fresh:
                    for model in (Task, TaskDispatch, AgentJob, AuditLog):
                        self.assertEqual(fresh.scalar(select(func.count()).select_from(model)), 0, model.__name__)
                self.assertFalse(self.wakeups)
        self.assertIsNone(self.dispatch["claim"]())

    def test_duplicate_wakeup_only_claims_each_task_once(self):
        task_id = self.submit()
        for _ in range(3):
            self.agent["enqueue_task"](task_id)
        self.assertEqual(self.dispatch["claim"]()[0], task_id)
        self.assertIsNone(self.dispatch["claim"]())
        with self.sessions() as fresh:
            self.assertEqual(fresh.scalar(select(func.count()).select_from(Task)), 1)
            self.assertEqual(fresh.get(TaskDispatch, task_id).attempts, 1)
        self.assertFalse(self.executions)

    def test_provider_lane_and_legacy_modes_match_main_task_contract(self):
        for entry in ("generate", "edit", "chat"):
            for mode in ("redis", "sync", "background"):
                for adapter in ("synthetic", "comfyui"):
                    with self.subTest(entry=entry, mode=mode, adapter=adapter):
                        self.settings.task_execution_mode = mode
                        self.provider.adapter_kind = adapter
                        wake_count, execute_count, background_count = len(self.wakeups), len(self.executions), len(self.background)
                        if entry == "chat": self.proposal_id = uuid4().hex
                        task_id = self.submit(entry)
                        self.assert_durable(task_id, lane="comfyui" if adapter == "comfyui" else "default",
                                            state="queued" if mode == "redis" else "done")
                        self.assertEqual(len(self.wakeups) - wake_count, int(mode == "redis"))
                        self.assertEqual(len(self.executions) - execute_count, int(mode == "sync"))
                        self.assertEqual(len(self.background) - background_count, int(mode == "background"))


if __name__ == "__main__":
    unittest.main()
