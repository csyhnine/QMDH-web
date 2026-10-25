"""R06: actual unique constraint/savepoints and real Agent/Chat creation paths."""
import ast
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import json
from threading import Barrier
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import event, func, select

from tests.test_review_agent_dispatch import AgentDispatchTests, load_functions, BACKEND
from tests.test_review_partial_image_progress import load
from app.models import AgentClient, AgentJob, AuditLog, DataClassification, Task, TaskDispatch
from app.schemas import AgentImageTaskCreate
from app.services import submission_idempotency as core


class SubmissionIdempotencyTests(AgentDispatchTests):
    def setUp(self):
        super().setUp()
        self.agent["_request_id"] = lambda request: (request.headers.get("X-Request-ID", "") if request else "") or "fresh-audit-trace"
        self.chat["dataclass"] = dataclass
        self.chat["__name__"] = __name__
        load("app/services/chat_agent_task_service.py", self.chat, classes=["ChatAgentTaskProposal"], functions=["auto_submit_chat_agent_proposal"])
        self.chat.update(uuid=__import__("uuid"), replace=__import__("dataclasses", fromlist=["replace"]).replace, dataclass=dataclass)
        # Dataclass decorators are evaluated while loading the real proposal.
        self.quota_calls = []
        self.chat["enforce_user_quota"] = lambda *args, **kwargs: self.quota_calls.append(1)
        self.chat["auth_user_from_tool_context"] = lambda ctx: self.auth
        self.key = "stable_submission_0001"

    def counts(self):
        with self.sessions() as db:
            return tuple(db.scalar(select(func.count()).select_from(model)) for model in (Task, AgentJob, TaskDispatch, AuditLog))

    def agent_submit(self, *, operation="generate", key="default", prompt="synthetic", auth=None, headers=None, execution="", db=None, body=None):
        values = dict(title="R06 Agent", workflow_key="image-generate", requested_provider="r05-provider", classification=DataClassification.b,
                      payload=body or {"prompt": prompt}, project_id=self.project.id, external_execution_id=execution)
        values["submission_key"] = self.key if key == "default" else key
        payload = SimpleNamespace(**values); payload.model_dump = lambda: {**values, "workflow_key": payload.workflow_key}
        request = SimpleNamespace(headers=headers or {})
        background = SimpleNamespace(add_task=lambda fn, task_id: self.background.append((fn, task_id)))
        return self.agent["create_agent_image_edit" if operation == "edit" else "create_agent_image_generate"](
            payload=payload, request=request, background_tasks=background, db=db or self.db, agent_auth=auth or self.auth)

    def proposal(self, identity="same-proposal", prompt="synthetic", workflow="image-generate"):
        return self.chat["ChatAgentTaskProposal"](proposal_id=identity, workflow_key=workflow, title="R06 Chat", project_code="R05",
                    requested_provider="r05-provider", provider_display_name="fixture", classification="B", payload={"prompt": prompt}, summary="fixture")

    def chat_submit(self, proposal=None):
        return self.chat["submit_confirmed_chat_agent_task"](self.db, auth_user=self.auth, policy=SimpleNamespace(), proposal=proposal or self.proposal(), background_tasks=None)

    def test_agent_generate_edit_replay_reuses_original_job_task_dispatch(self):
        for operation in ("generate", "edit"):
            with self.subTest(operation=operation):
                first = self.agent_submit(operation=operation, headers={"X-Request-ID": "attempt-one"})
                repeated = self.agent_submit(operation=operation, headers={"X-Request-ID": "attempt-two"})
                self.assertEqual((first.id, first.task_id), (repeated.id, repeated.task_id))
        self.assertEqual(self.counts(), (2, 2, 2, 2)); self.assertEqual(len(self.wakeups), 2)

    def test_agent_same_key_changed_parameters_conflict_without_new_rows(self):
        original = self.agent_submit()
        with self.assertRaises(HTTPException) as caught: self.agent_submit(prompt="different")
        self.assertEqual(caught.exception.status_code, 409); self.db.rollback()
        self.assertEqual(self.counts(), (1, 1, 1, 1)); self.assertEqual(self.wakeups, [original.task_id])

    def test_legacy_execution_request_pair_replays_but_unkeyed_calls_stay_distinct(self):
        headers = {"X-Request-ID": "legacy-request"}
        first = self.agent_submit(key=None, headers=headers, execution="stable-run")
        self.assertEqual(self.agent_submit(key=None, headers=headers, execution="stable-run").id, first.id)
        ids = [self.agent_submit(key=None, execution="same-run").task_id for _ in range(2)]
        self.assertNotEqual(ids[0], ids[1])
        ids = [self.agent_submit(key=None, headers=headers).task_id for _ in range(2)]
        self.assertNotEqual(ids[0], ids[1])
        auth = SimpleNamespace(**{**vars(self.auth), "external_execution_id": "context-run"})
        first = self.agent_submit(key=None, headers=headers, auth=auth)
        self.assertEqual(self.agent_submit(key=None, headers=headers, auth=auth).id, first.id)
        self.assertEqual(self.counts(), (6, 6, 6, 6))

    def test_client_and_operation_scope_keeps_legitimate_new_submissions(self):
        first = self.agent_submit(); edited = self.agent_submit(operation="edit")
        client = AgentClient(key="r06-second", token_hash="synthetic-second", user_id=self.user.id)
        self.db.add(client); self.db.commit()
        auth = SimpleNamespace(**{**vars(self.auth), "client_id": client.id, "key": client.key})
        other = self.agent_submit(auth=auth)
        self.assertEqual(len({first.task_id, edited.task_id, other.task_id}), 3)
        self.assertEqual(self.counts(), (3, 3, 3, 3))

    def test_chat_proposal_replay_reuses_task_and_new_proposal_is_new_intent(self):
        first = self.chat_submit(); replay = self.chat_submit()
        self.assertEqual(first.id, replay.id)
        different = self.chat_submit(self.proposal(identity="new-proposal")); self.assertNotEqual(first.id, different.id)
        self.assertEqual(self.counts(), (2, 0, 2, 0)); self.assertEqual(len(self.wakeups), 2)

    def test_chat_same_proposal_changed_parameters_conflicts(self):
        first = self.chat_submit()
        for proposal in (self.proposal(prompt="changed"), self.proposal(workflow="image-edit")):
            with self.subTest(workflow=proposal.workflow_key, prompt=proposal.payload["prompt"]):
                with self.assertRaises(HTTPException) as caught: self.chat_submit(proposal)
                self.assertEqual(caught.exception.status_code, 409); self.db.rollback()
        self.assertEqual(self.counts(), (1, 0, 1, 0)); self.assertEqual(self.wakeups, [first.id])

    def registered_tools(self):
        module = ModuleType("app.services.chat_agent_task_service")
        module.auto_submit_chat_agent_proposal = self.chat["auto_submit_chat_agent_proposal"]
        for name, workflow in [("build_image_generate_proposal", "image-generate"), ("build_image_edit_proposal", "image-edit"), ("build_video_generate_proposal", "video-generate")]:
            def build(ctx, workflow=workflow, **kwargs): return self.proposal(identity=str(uuid4()), prompt=kwargs.get("prompt") or kwargs.get("edit_prompt") or kwargs.get("motion_prompt"), workflow=workflow)
            setattr(module, name, build)
        policy_module = ModuleType("app.services.agent_policy_service")
        policy_module.EffectiveChatPolicy = type("Policy", (), {})
        policy = policy_module.EffectiveChatPolicy()
        policy_module.resolve_effective_chat_policy = lambda *args, **kwargs: policy
        self.enterContext(patch.dict("sys.modules", {module.__name__: module, policy_module.__name__: policy_module}))
        ns = {"uuid": __import__("uuid"), "_tool_label": lambda name: name,
              "_summarize_tool_result": lambda *args: "submitted", "ChatAgentToolCall": lambda **kwargs: SimpleNamespace(**kwargs)}
        load_functions("app/integrations/studio_agent/agent.py", ["_register_chat_tools", "_wrap_tool", "_emit_thinking_step"], ns)
        class Agent:
            def __init__(self): self.tools = {}
            def tool(self, fn): self.tools[fn.__name__] = fn; return fn
        agent = Agent(); ns["_register_chat_tools"](agent, allowlist=("create_image_generate_task", "create_image_edit_task", "create_video_generate_task"), recorder=[], proposal_recorder=[])
        context = SimpleNamespace(deps=SimpleNamespace(db=self.db, user_id=self.user.id, user_name=self.auth.user_name, policy=policy), tool_call_id="stable-tool-call")
        return agent, context

    def test_registered_tools_reuse_call_identity_not_random_proposal_or_prompt(self):
        agent, ctx = self.registered_tools()
        arguments = {"prompt": "synthetic", "requested_provider": "r05-provider"}
        first = agent.tools["create_image_generate_task"](ctx, **arguments)
        retry = agent.tools["create_image_generate_task"](ctx, **arguments)
        self.assertIn("task_id", first, first); self.assertIn("task_id", retry, retry)
        self.assertEqual(first["task_id"], retry["task_id"]); self.assertEqual(first["proposal_id"], retry["proposal_id"])
        ctx.tool_call_id = "new-tool-call"
        next_result = agent.tools["create_image_generate_task"](ctx, **arguments)
        self.assertNotEqual(first["task_id"], next_result["task_id"])
        for name, kwargs in [("create_image_edit_task", {"edit_prompt": "synthetic", "reference_image": "fixture"}), ("create_video_generate_task", {"motion_prompt": "synthetic"})]:
            a = agent.tools[name](ctx, requested_provider="r05-provider", **kwargs)
            b = agent.tools[name](ctx, requested_provider="r05-provider", **kwargs)
            self.assertEqual(a["task_id"], b["task_id"])
        self.assertEqual(self.counts(), (4, 0, 4, 0)); self.assertEqual(len(self.wakeups), 4)

    def test_missing_call_id_and_new_registration_are_distinct_intents(self):
        agent, ctx = self.registered_tools(); ctx.tool_call_id = None
        kwargs = {"prompt": "synthetic", "requested_provider": "r05-provider"}
        a = agent.tools["create_image_generate_task"](ctx, **kwargs); b = agent.tools["create_image_generate_task"](ctx, **kwargs)
        self.assertNotEqual(a["task_id"], b["task_id"])
        agent, ctx = self.registered_tools(); first = agent.tools["create_image_generate_task"](ctx, **kwargs)
        agent, ctx = self.registered_tools(); second = agent.tools["create_image_generate_task"](ctx, **kwargs)
        self.assertNotEqual(first["task_id"], second["task_id"])

    def test_lost_response_and_redis_failure_leave_one_claimable_submission(self):
        original = self.agent["_to_job_out"]
        self.agent["_to_job_out"] = lambda *args: (_ for _ in ()).throw(RuntimeError("synthetic lost response"))
        with self.assertRaisesRegex(RuntimeError, "lost response"): self.agent_submit()
        self.agent["_to_job_out"] = original
        first = self.agent_submit(); self.assertEqual(self.counts(), (1, 1, 1, 1)); self.assertEqual(len(self.wakeups), 1)
        self.wakeup_error = RuntimeError("synthetic redis failure")
        second = self.agent_submit(key="second_submission_0001"); self.agent_submit(key="second_submission_0001")
        self.assertEqual(self.counts(), (2, 2, 2, 2)); self.assertEqual(len(self.wakeups), 2)
        self.assertEqual({self.dispatch["claim"]()[0], self.dispatch["claim"]()[0]}, {first.task_id, second.task_id})
        self.assertIsNone(self.dispatch["claim"]())

    def test_savepoint_and_outer_commit_failure_leave_no_candidate_rows(self):
        for stage in (1, 2):
            with self.subTest(commit_stage=stage):
                commits = 0
                def fail(session):
                    nonlocal commits
                    commits += 1
                    if commits == stage: raise RuntimeError("synthetic commit failure")
                event.listen(self.db, "before_commit", fail)
                try:
                    with self.assertRaisesRegex(RuntimeError, "commit failure"): self.agent_submit()
                finally: event.remove(self.db, "before_commit", fail); self.db.rollback()
                self.assertEqual(self.counts(), (0, 0, 0, 0)); self.assertEqual(self.wakeups, [])

    def test_concurrent_sqlite_sessions_create_one_task_and_one_execution(self):
        self.settings.task_execution_mode = "sync"
        # Materialize shared fixture identity before worker threads; each gets
        # its own real Session/connection, never the caller's Session.
        self.project.id; self.project.code; self.user.id
        task_ids = []
        for operation in ("generate", "edit", "chat"):
            barrier = Barrier(2)
            def run():
                with self.sessions() as db:
                    barrier.wait(timeout=5)
                    if operation == "chat":
                        task = self.chat["submit_confirmed_chat_agent_task"](db, auth_user=self.auth, policy=SimpleNamespace(), proposal=self.proposal(identity="concurrent-chat"), background_tasks=None)
                        return None, task.id
                    job = self.agent_submit(operation=operation, db=db)
                    return job.id, job.task_id
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: run(), range(2)))
            self.assertEqual(results[0], results[1]); task_ids.append(results[0][1])
        self.assertEqual(self.counts(), (3, 2, 3, 2))
        self.assertEqual(self.executions, task_ids)
        self.assertEqual(len(self.quota_calls), 1)

    def test_canonical_order_and_real_unique_conflict_do_not_duplicate(self):
        first = self.agent_submit(body={"prompt": "synthetic", "options": {"b": 2, "a": 1}})
        self.assertEqual(self.agent_submit(body={"options": {"a": 1, "b": 2}, "prompt": "synthetic"}).id, first.id)
        # Force a stale/missed first lookup, then let the real DB unique
        # constraint reject the candidate. This is not a mocked IntegrityError.
        original = core._previous_submission; calls = []
        def missed(*args):
            calls.append(1)
            return None if len(calls) == 1 else original(*args)
        with patch.object(core, "_previous_submission", missed):
            replay = self.agent_submit(body={"prompt": "synthetic", "options": {"a": 1, "b": 2}})
        self.assertEqual(replay.id, first.id); self.assertEqual(len(calls), 2)
        self.assertEqual(self.counts(), (1, 1, 1, 1)); self.assertEqual(len(self.wakeups), 1)
        with self.sessions() as db:
            dispatch = db.get(TaskDispatch, first.task_id); self.assertTrue(dispatch.submission_key.startswith("si1_")); self.assertEqual(len(dispatch.request_hash), 64)
        # Missing original response history must not be replaced by another job.
        self.db.delete(self.db.get(AgentJob, first.id)); self.db.commit()
        with self.assertRaises(HTTPException) as caught:
            self.agent_submit(body={"prompt": "synthetic", "options": {"a": 1, "b": 2}})
        self.assertEqual(caught.exception.status_code, 409); self.db.rollback()
        self.assertEqual(self.counts(), (1, 0, 1, 1)); self.assertEqual(len(self.wakeups), 1)

    def test_chat_replay_skips_new_quota_and_confirmation_keeps_service_guard(self):
        self.chat_submit(); self.assertEqual(len(self.quota_calls), 1)
        self.chat["enforce_user_quota"] = lambda *args, **kwargs: (_ for _ in ()).throw(HTTPException(429, "fixture quota exhausted"))
        self.chat_submit()
        with self.assertRaises(HTTPException) as caught: self.chat_submit(self.proposal(identity="new-intent"))
        self.assertEqual(caught.exception.status_code, 429); self.db.rollback(); self.assertEqual(self.counts(), (1, 0, 1, 0))
        source = ast.parse((BACKEND / "app/routers/chat.py").read_text(encoding="utf-8"))
        route = next(n for n in source.body if isinstance(n, ast.FunctionDef) and n.name == "confirm_chat_agent_task")
        self.assertFalse(any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "enforce_user_quota" for n in ast.walk(route)))
        self.assertTrue(any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "submit_confirmed_chat_agent_task" for n in ast.walk(route)))

    def test_schema_modes_lanes_and_unkeyed_calls_keep_existing_behavior(self):
        fields = dict(title="R06 Task", project_id=self.project.id, requested_provider="r05-provider", payload={"prompt": "synthetic"})
        self.assertEqual(AgentImageTaskCreate(**fields, submission_key=self.key).submission_key, self.key)
        for invalid in ("short", "x" * 81):
            with self.assertRaises(ValidationError): AgentImageTaskCreate(**fields, submission_key=invalid)
        for mode in ("redis", "sync", "background"):
            for adapter in ("synthetic", "comfyui"):
                with self.subTest(mode=mode, adapter=adapter):
                    self.settings.task_execution_mode = mode; self.provider.adapter_kind = adapter
                    w, e, b = len(self.wakeups), len(self.executions), len(self.background)
                    key = uuid4().hex
                    first = self.agent_submit(key=key); self.agent_submit(key=key)
                    with self.sessions() as fresh:
                        task = fresh.get(Task, first.task_id); dispatch = fresh.get(TaskDispatch, first.task_id)
                        self.assertEqual(task.status, self.agent["TaskStatus"].pending)
                        self.assertEqual(dispatch.lane, "comfyui" if adapter == "comfyui" else "default")
                        self.assertEqual(dispatch.state, "queued" if mode == "redis" else "done")
                        self.assertTrue(dispatch.submission_key.startswith("si1_")); self.assertEqual(len(dispatch.request_hash), 64)
                    self.assertEqual(len(self.wakeups)-w, int(mode == "redis")); self.assertEqual(len(self.executions)-e, int(mode == "sync")); self.assertEqual(len(self.background)-b, int(mode == "background"))
