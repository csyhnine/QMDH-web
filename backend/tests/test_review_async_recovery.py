"""R20-A: real DashScope/executor/dispatch with synthetic offline transport."""
from dataclasses import replace
from hashlib import sha256
import json
from threading import Event
from types import ModuleType
from unittest.mock import patch
from urllib.error import URLError
from urllib.request import Request

from sqlalchemy import event
from sqlalchemy.exc import OperationalError

from tests.test_review_partial_image_progress import PartialImageProgressTests, ProcessExited, load
from app.models import Task, TaskDispatch, TaskStatus, Workflow
from datetime import datetime, timedelta, timezone


class AsyncRecoveryTests(PartialImageProgressTests):
    def setUp(self):
        super().setUp()
        self.profile = replace(self.profile, model_name="r20-model", pricing_unit="per_video")
        self.definition.model_name = "r20-model"
        with self.sessions() as db:
            task = db.get(Task, self.task_id)
            db.get(Workflow, task.workflow_id).provider_capability = "video.generate"
            task.payload = {"prompt": "synthetic", "secret_field": "not-to-be-checkpointed"}
            db.commit()
        self.phase = None
        self.posts, self.gets, self.downloads = [], [], []
        self.stop_after = None
        self.expire_after_first = False
        base = {key: self.namespace[key] for key in ("ExecutionOutcome", "RequestDiagnostics", "ProviderExecutionError")}
        progress = load("app/services/provider_adapters/async_progress.py", {**base, "asdict": self.namespace["asdict"],
                         "sha256": sha256, "json": json}, classes=["AsyncTaskProgress", "UpstreamTaskFailed"])
        pricing = load("app/services/provider_adapters/video_common.py", {}, functions=["calculate_video_billing"])
        self.video_ns = {**base, **progress, **pricing, "perf_counter": self.namespace["perf_counter"],
                         "DASHSCOPE_ASYNC_VIDEO_STRATEGY": "synthetic-dashscope", "DASHSCOPE_VIDEO_ENDPOINT_PATH": "/video",
                         "resolve_strategy_for_capability": lambda **kwargs: "synthetic-dashscope",
                         "video_prompt": lambda payload: payload["prompt"], "_submit_dashscope_video_task": self.submit_video,
                         "_poll_dashscope_video_result": self.poll_video, "extract_video_urls": lambda p: p["urls"],
                         "persist_generated_video": self.save_video}
        load("app/services/provider_adapters/dashscope_video.py", self.video_ns, classes=["DashScopeVideoProviderAdapter"],
             functions=["_extract_output", "_extract_task_id", "_extract_task_status", "_extract_request_id", "_extract_usage"])
        load("app/services/task_executor.py", self.namespace, functions=["_upsert_async_progress_call"])
        self.new_adapter()
        def checkpoint_stop(session):
            if self.stop_after:
                current = self.snapshot()
                step = current.result.get("generation_progress", {}).get("steps", [{}])[0]
                if step.get("state") == self.stop_after:
                    self.stop_after = None
                    raise ProcessExited()
        event.listen(self.sessions, "after_commit", checkpoint_stop)
        self.addCleanup(event.remove, self.sessions, "after_commit", checkpoint_stop)
        self.dispatch = load("app/services/task_dispatch.py", {"SessionLocal": self.sessions, "Task": Task,
                             "TaskDispatch": TaskDispatch, "TaskStatus": TaskStatus, "Event": Event,
                             "Thread": FakeThread, "select": self.namespace["select"], "timedelta": timedelta,
                             "timezone": timezone,
                             "utcnow": lambda: datetime.now(timezone.utc)}, functions=["run_claim", "recover_leases"])

    def new_adapter(self, wrapper=False):
        adapter = self.video_ns["DashScopeVideoProviderAdapter"](self.definition, self.profile)
        if wrapper:
            outer = object.__new__(self.namespace["StrategyProviderAdapter"])
            outer.dashscope_video_adapter = adapter
            outer.profile, outer.definition = self.profile, self.definition
            self.namespace.update(resolve_strategy_for_capability=lambda **kwargs: "synthetic-dashscope",
                                  DASHSCOPE_ASYNC_VIDEO_STRATEGY="synthetic-dashscope")
            adapter = outer
        self.adapter = adapter
        self.namespace["get_provider_adapter"] = lambda *args: adapter

    def submit_video(self, *args):
        self.posts.append("POST")
        if self.phase == "submit": raise URLError("synthetic lost response")
        return {"request_id": "request-accepted", "output": {"task_id": "accepted-unique"}}

    def poll_video(self, profile, task_id):
        state = self.snapshot()
        self.assertEqual(state.result["generation_progress"]["steps"][0]["upstream_task_id"], task_id)
        self.gets.append(task_id)
        if self.phase == "poll": raise URLError("synthetic offline poll")
        if self.phase == "terminal": raise self.video_ns["UpstreamTaskFailed"]("synthetic terminal failure")
        return {"request_id": "request-polled", "output": {"task_status": "SUCCEEDED", "usage": {"tokens": 17}},
                "urls": ["https://fixture.invalid/output-a", "https://fixture.invalid/output-b"]}

    def save_video(self, **kwargs):
        url = kwargs["video_url"]
        self.downloads.append(url)
        state = self.snapshot()
        self.assertEqual(state.result["generation_progress"]["steps"][0]["output_urls"],
                         ["https://fixture.invalid/output-a", "https://fixture.invalid/output-b"])
        if self.phase == "download" and url.endswith("-b"): raise URLError("synthetic download failure")
        number = 1 if url.endswith("-a") else 2
        result = super().persist(image_payload={"fixture_number": number})
        if number == 1 and self.expire_after_first:
            with self.sessions() as db:
                job = db.get(TaskDispatch, self.task_id)
                job.lease_until = datetime.now(timezone.utc)-timedelta(minutes=1)
                db.commit()
        return result[0]

    def lease(self, lane="default"):
        with self.sessions() as db:
            db.add(TaskDispatch(task_id=self.task_id, user_id=db.get(Task, self.task_id).user_id, lane=lane,
                                state="leased", lease_owner="owner", lease_until=datetime.now(timezone.utc)+timedelta(minutes=5)))
            db.commit()

    def run_claim(self):
        mod = ModuleType("app.services.task_executor")
        mod.execute_task = self.namespace["execute_task"]
        with patch.dict("sys.modules", {mod.__name__: mod}):
            self.dispatch["run_claim"](self.task_id, "owner")

    def dispatch_state(self):
        with self.sessions() as db: return db.get(TaskDispatch, self.task_id).state

    def test_accepted_poll_failure_is_durable_and_resume_uses_same_id(self):
        self.new_adapter(wrapper=True); self.phase = "poll"; self.execute()
        state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.pending)
        self.assertTrue(state.result["recovery_required"])
        self.assertEqual(state.result["upstream_task_id"], "accepted-unique")
        self.assertIn("accepted-unique", json.dumps(state.calls))
        self.assertNotIn("not-to-be-checkpointed", json.dumps(state.result["generation_progress"]))
        self.assertNotIn(self.profile.api_key, json.dumps(state.result["generation_progress"]))
        self.assertTrue(state.result["billing"]["additional_cost_unknown"])
        self.phase = None; self.new_adapter(wrapper=True); self.execute()
        self.assertEqual(self.posts, ["POST"])
        self.assertEqual(self.gets, ["accepted-unique", "accepted-unique"])
        self.assertEqual(self.snapshot().status, TaskStatus.completed)

    def test_download_failure_keeps_urls_usage_and_resumes_without_poll_or_post(self):
        self.phase = "download"; self.execute()
        state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.pending)
        self.assertEqual(len(state.assets), 1)
        self.assertEqual(state.cost, 2)
        self.assertEqual(state.result["usage"], {"tokens": 17})
        self.assertEqual(state.result["upstream_task_id"], "accepted-unique")
        self.phase = None; self.new_adapter(); self.execute()
        self.assertEqual(len(self.posts), 1); self.assertEqual(len(self.gets), 1)
        self.assertEqual(len(self.downloads), 3)
        self.assertEqual(len(self.snapshot().assets), 2)

    def test_checkpoint_crash_resumes_only_get_and_keeps_original_price(self):
        self.stop_after = "accepted"
        with self.assertRaises(ProcessExited): self.execute()
        self.assertEqual(self.gets, [])
        self.assertEqual(self.snapshot().result["upstream_task_id"], "accepted-unique")
        self.profile = replace(self.profile, unit_price=99)
        self.new_adapter(); self.execute()
        self.assertEqual(self.posts, ["POST"])
        self.assertEqual(self.gets, ["accepted-unique"])
        self.assertEqual(self.snapshot().cost, 4)

    def test_unknown_submit_result_never_posts_again(self):
        self.phase = "submit"; self.execute()
        self.assertEqual(self.snapshot().status, TaskStatus.pending)
        self.assertTrue(self.snapshot().result["recovery_required"])
        self.phase = None; self.new_adapter(); self.execute()
        self.assertEqual(self.posts, ["POST"]); self.assertEqual(self.gets, [])
        self.assertEqual(self.snapshot().status, TaskStatus.pending)

    def test_confirmed_upstream_failure_is_terminal(self):
        self.lease(); self.phase = "terminal"; self.run_claim()
        self.assertEqual(self.snapshot().status, TaskStatus.failed)
        self.assertFalse(self.snapshot().result["recovery_required"])
        self.assertEqual(self.dispatch_state(), "done")
        self.phase = None; self.new_adapter(); self.execute()
        self.assertEqual(self.posts, ["POST"])
        self.assertEqual(self.gets, ["accepted-unique"])
        self.assertEqual(self.snapshot().status, TaskStatus.failed)

    def test_checkpoint_failure_does_not_poll_or_submit_again(self):
        def fail_accepted(session):
            task = session.get(Task, self.task_id)
            steps = task.result.get("generation_progress", {}).get("steps", [])
            if steps and steps[0]["state"] == "accepted":
                raise OperationalError("synthetic checkpoint", {}, Exception("offline db"))
        event.listen(self.sessions, "before_commit", fail_accepted)
        try: self.execute()
        finally: event.remove(self.sessions, "before_commit", fail_accepted)
        self.assertEqual(self.gets, [])
        self.assertEqual(self.snapshot().result["upstream_task_id"], "accepted-unique")
        self.new_adapter(); self.execute()
        self.assertEqual(self.posts, ["POST"])
        # Persistent failure during a new checkpoint must propagate, with the
        # earlier committed accepted prefix still available from another session.
        with self.sessions() as db:
            task = db.get(Task, self.task_id)
            progress = json.loads(json.dumps(task.result["generation_progress"]))
            progress["steps"][0].update(state="accepted", storage_paths=[])
            progress["steps"][0].pop("output_urls", None)
            task.result = {"generation_progress": progress}; task.status = TaskStatus.pending
            db.commit()
        self.new_adapter()
        attempts = []
        gets_before = list(self.gets)
        def fail_all(session):
            attempts.append(1)
            task = session.get(Task, self.task_id)
            if len(attempts) > 1 and task.result.get("generation_progress"):
                raise OperationalError("synthetic persistent checkpoint", {}, Exception("offline db"))
        event.listen(self.sessions, "before_commit", fail_all)
        try:
            with self.assertRaises(OperationalError): self.execute()
        finally:
            event.remove(self.sessions, "before_commit", fail_all)
        self.assertEqual(self.snapshot().result["generation_progress"]["steps"][0]["upstream_task_id"], "accepted-unique")
        self.assertEqual(self.snapshot().status, TaskStatus.running)
        self.assertEqual(self.gets, gets_before)
        self.assertEqual(self.posts, ["POST"])

    def test_identity_change_refuses_recovery_and_preserves_context(self):
        self.phase = "poll"; self.execute(); original = self.snapshot().result["generation_progress"]
        self.phase = None
        for field, value in (("model_name", "other"), ("base_url", "https://other.invalid")):
            with self.subTest(field=field):
                profile = self.profile; self.profile = replace(profile, **{field: value})
                self.new_adapter(); self.execute(); self.profile = profile
                self.assertEqual(self.snapshot().result["generation_progress"]["request_model"], original["request_model"])
                self.assertEqual(self.snapshot().status, TaskStatus.pending)
                self.assertEqual(self.posts, ["POST"]); self.assertEqual(self.gets, ["accepted-unique"])

    def test_stale_lease_cannot_checkpoint_or_complete(self):
        self.lease(); self.revoke_after_first = True; self.execute("owner")
        state = self.snapshot()
        self.assertEqual(state.result["storage_paths"], [])
        self.assertEqual(state.assets, [])
        self.assertEqual(len(self.downloads), 1)
        self.assertEqual(state.status, TaskStatus.running)
        self.revoke_after_first = False
        self.expire_after_first = True
        with self.sessions() as db:
            task = db.get(Task, self.task_id); task.result = {}; task.status = TaskStatus.pending
            job = db.get(TaskDispatch, self.task_id); job.lease_owner = "owner"
            job.lease_until = datetime.now(timezone.utc)+timedelta(minutes=5); db.commit()
        self.new_adapter(); self.run_claim()
        self.assertEqual(self.dispatch_state(), "leased")
        self.assertEqual(self.snapshot().status, TaskStatus.running)

    def test_default_dispatch_keeps_review_until_recovered(self):
        self.lease(); self.phase = "poll"; self.run_claim()
        self.assertEqual(self.dispatch_state(), "review")
        self.assertEqual(self.snapshot().status, TaskStatus.pending)
        self.assertEqual(self.snapshot().result["queued_stage"], "review")
        self.phase = None; self.new_adapter()
        with self.sessions() as db:
            job = db.get(TaskDispatch, self.task_id); job.state = "leased"; job.lease_owner = "owner"
            job.lease_until = datetime.now(timezone.utc)+timedelta(minutes=5); db.commit()
        self.run_claim()
        self.assertEqual(self.dispatch_state(), "done")
        self.assertEqual(self.snapshot().status, TaskStatus.completed)
        self.assertEqual(self.posts, ["POST"])

    def test_expired_default_lease_keeps_saved_upstream_context(self):
        self.lease(); self.stop_after = "accepted"
        with self.assertRaises(ProcessExited): self.execute("owner")
        with self.sessions() as db:
            job = db.get(TaskDispatch, self.task_id); job.lease_until = datetime.now(timezone.utc)-timedelta(minutes=1)
            db.commit(); self.dispatch["recover_leases"](db); db.commit()
        self.assertEqual(self.dispatch_state(), "review")
        self.assertEqual(self.snapshot().result["upstream_task_id"], "accepted-unique")
        self.assertEqual(self.posts, ["POST"]); self.assertEqual(self.gets, [])

    def test_success_reexecution_keeps_assets_calls_and_ledgers_stable(self):
        self.execute(); old = self.snapshot()
        self.new_adapter(); self.execute(); state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.completed)
        self.assertFalse(state.result["recovery_required"])
        self.assertEqual(state.assets, old.assets)
        self.assertEqual(len(state.calls), 1); self.assertEqual(len(state.ledgers), 2)
        self.assertEqual(state.cost, 4)
        self.assertEqual(self.posts, ["POST"]); self.assertEqual(len(self.gets), 1)
        self.assertTrue(all(row[2]["usage_records"] == [{"tokens": 17}] for row in state.ledgers))
        # A distinct logical Task retains once-per-request pricing for two
        # output files, independently of the per-video control above.
        with self.sessions() as db:
            old_task = db.get(Task, self.task_id)
            task = Task(title="R20 per-request", workflow_id=old_task.workflow_id, project_id=old_task.project_id,
                        user_id=old_task.user_id, requested_provider=old_task.requested_provider,
                        payload=dict(old_task.payload), result={})
            db.add(task); db.flush(); self.task_id = task.id; db.commit()
        self.profile = replace(self.profile, pricing_unit="per_request")
        self.new_adapter(); self.execute(); once = self.snapshot()
        self.assertEqual(once.cost, 2)
        self.assertEqual(len(once.assets), 2)
        self.new_adapter(); self.execute()
        self.assertEqual(self.snapshot().assets, once.assets)
        self.assertEqual(self.snapshot().cost, 2)
        self.assertEqual(len(self.snapshot().calls), 1)
        self.assertEqual(len(self.snapshot().ledgers), 2)
        self.assertEqual(len(self.posts), 2)

    def test_comfy_and_ordinary_default_dispatch_contract_is_unchanged(self):
        self.lease()
        for lane, status, recovery, expected in (("default", TaskStatus.failed, False, "done"),
                                                   ("comfyui", TaskStatus.pending, False, "review"),
                                                   ("comfyui", TaskStatus.completed, False, "done")):
            with self.subTest(lane=lane, status=status):
                with self.sessions() as db:
                    job = db.get(TaskDispatch, self.task_id); job.lane = lane; job.state = "leased"; job.lease_owner = "owner"
                    job.lease_until = datetime.now(timezone.utc)+timedelta(minutes=5)
                    task = db.get(Task, self.task_id); task.status = status; task.result = {"recovery_required": recovery}; db.commit()
                mod = ModuleType("app.services.task_executor"); mod.execute_task = lambda *args, **kwargs: None
                with patch.dict("sys.modules", {mod.__name__: mod}): self.dispatch["run_claim"](self.task_id, "owner")
                self.assertEqual(self.dispatch_state(), expected)

    def test_real_poll_helper_distinguishes_terminal_failure_from_transport(self):
        ns = {**self.video_ns, "Request": Request, "URLError": URLError, "HTTPError": __import__("urllib.error", fromlist=["HTTPError"]).HTTPError,
              "json": json, "DASHSCOPE_TASK_POLL_PREFIX": "/tasks/", "_SUCCEEDED_STATUSES": {"SUCCEEDED"},
              "_FAILED_STATUSES": {"FAILED"}, "_dashscope_headers": lambda *args: {}, "sleep": lambda *args: None}
        load("app/services/provider_adapters/dashscope_video.py", ns, functions=["_poll_dashscope_video_result"])
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return b'{"output":{"task_status":"FAILED"}}'
        seen = []
        def response(request, **kwargs): seen.append((request.method, request.full_url)); return Response()
        ns["urlopen"] = response
        with self.assertRaises(self.video_ns["UpstreamTaskFailed"]): ns["_poll_dashscope_video_result"](self.profile, "accepted-unique")
        self.assertEqual(seen, [("GET", "https://provider.invalid/tasks/accepted-unique")])
        ns["urlopen"] = lambda *args, **kwargs: (_ for _ in ()).throw(URLError("offline"))
        with self.assertRaisesRegex(ValueError, "poll request failed"): ns["_poll_dashscope_video_result"](self.profile, "accepted-unique")


class FakeThread:
    def __init__(self, **kwargs): pass
    def start(self): pass
    def join(self, **kwargs): pass
