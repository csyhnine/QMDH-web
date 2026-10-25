"""R20-F: real image polling protocols, durable ORM and original billing."""
import base64
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from io import BytesIO
import json
from threading import Event
from types import ModuleType
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.request import Request

from PIL import Image
from sqlalchemy import event
from sqlalchemy.exc import OperationalError
from tests.test_review_partial_image_progress import PartialImageProgressTests, ProcessExited, load
from tests.test_review_async_recovery import FakeThread
from app.models import Task, TaskDispatch, TaskStatus


class AsyncImageRecoveryBase(PartialImageProgressTests):
    protocol = "haodeya"

    def setUp(self):
        super().setUp()
        self.phase = None; self.stop_state = None; self.requests = []
        self.immediate = False; self.url_only = False; self.redirect = False
        self.b64 = False; self.single_output_steps = False
        self.profile = replace(self.profile, base_url="https://modelscope.cn.invalid/v1" if self.protocol == "modelscope" else "https://provider.invalid/v1")
        self.plan.adapter_mode = "modelscope_async" if self.protocol == "modelscope" else "haodeya_async_image"
        self.plan.endpoint_path = "/images/generations"
        self.base64_images = []
        for number in (1, 2):
            buffer = BytesIO(); Image.new("RGB", (1, 1), (number, 1, 1)).save(buffer, format="PNG")
            self.base64_images.append(base64.b64encode(buffer.getvalue()).decode())
        self.namespace.update(Request=Request, HTTPError=HTTPError, URLError=URLError,
                              urlopen=self.http, sleep=lambda *args: None,
                              _submit_image_generation_request=self.submit_async, _persist_generated_image=self.persist_async)
        load("app/services/task_executor.py", self.namespace, functions=[
            "_uses_modelscope_async_mode", "_extract_image_data", "_normalize_image_candidates", "_normalize_image_candidate", "_normalize_image_url_value",
            "_poll_modelscope_image_result", "_poll_haodeya_async_image_result", "_extract_toapis_poll_image_data",
            "_extract_toapis_task_id", "_extract_toapis_polling_url", "_haodeya_async_poll_url", "_haodeya_async_api_root", "_profile_adapter_config",
            "_task_payload_result_fields"])
        self.make_adapter()
        def stop_after_commit(session):
            if self.stop_state:
                steps = self.snapshot().result.get("generation_progress", {}).get("steps", [])
                if steps and steps[-1].get("state") == self.stop_state:
                    self.stop_state = None; raise ProcessExited()
        event.listen(self.sessions, "after_commit", stop_after_commit)
        self.addCleanup(event.remove, self.sessions, "after_commit", stop_after_commit)
        self.dispatch = load("app/services/task_dispatch.py", {"SessionLocal": self.sessions, "Task": Task, "TaskDispatch": TaskDispatch,
                            "TaskStatus": TaskStatus, "Event": Event, "Thread": FakeThread, "timezone": timezone, "timedelta": timedelta,
                            "select": self.namespace["select"], "utcnow": lambda: datetime.now(timezone.utc)}, functions=["run_claim"])

    def submit_async(self, **kwargs):
        self.submissions.append(len(self.submissions)+1)
        if self.phase == "submit": raise URLError("synthetic lost submit response")
        result = {"model": "r19-model", "usage": {"input_tokens": 11}}
        if self.immediate: result["data"] = self.image_data()
        elif self.url_only:
            if self.protocol == "haodeya": result["polling_url"] = "https://fixture.invalid/saved-poll"
        else: result["task_id" if self.protocol == "modelscope" else "id"] = "accepted-" + str(len(self.submissions))
        return result

    def image_data(self):
        if self.single_output_steps:
            return [{"url": f"https://fixture.invalid/image-{len(self.submissions)}.png"}]
        if self.b64: return [{"b64_json": value} for value in self.base64_images]
        return [{"url": f"https://fixture.invalid/image-{number}.png"} for number in (1, 2)]

    def http(self, request, **kwargs):
        self.assertEqual(request.method, "GET")
        step = self.snapshot().result["generation_progress"]["steps"][-1]
        self.assertEqual(step["query_context"]["polling_url"], request.full_url)
        self.requests.append(request.full_url)
        if self.phase == "poll": raise URLError("synthetic query transport")
        if self.phase == "redirect-fault" and len(self.requests) == 2: raise URLError("synthetic followup transport")
        status = "FAILED" if self.phase == "terminal" else "SUCCEED"
        response = {"task_status": status, "status": "failed" if self.phase == "terminal" else "completed",
                    "data": self.image_data(), "model": "r19-model", "usage": {"input_tokens": 17}, "request_id": "known-query"}
        if self.redirect and len(self.requests) == 1:
            response.update(task_status="RUNNING", status="processing", data=[], polling_url="https://fixture.invalid/next-poll")
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return json.dumps(response).encode()
        return Response()

    def persist_async(self, **kwargs):
        item = kwargs["image_payload"]
        number = self.base64_images.index(item["b64_json"])+1 if "b64_json" in item else int(item["url"].rsplit("-", 1)[1].split(".")[0])
        if number == 2 and self.phase == "download": raise URLError("synthetic second output download")
        return super().persist(image_payload={"fixture_number": number})

    def lease(self):
        with self.sessions() as db:
            db.add(TaskDispatch(task_id=self.task_id, user_id=db.get(Task, self.task_id).user_id, lane="default", state="leased",
                                lease_owner="owner", lease_until=datetime.now(timezone.utc)+timedelta(minutes=5))); db.commit()

    def run_claim(self):
        module = ModuleType("app.services.task_executor"); module.execute_task = self.namespace["execute_task"]
        with patch.dict("sys.modules", {module.__name__: module}): self.dispatch["run_claim"](self.task_id, "owner")

    def test_accepted_poll_failure_resumes_original_receipt_without_duplicate_post(self):
        self.make_adapter(strategy=True); self.phase = "poll"; self.execute(); state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.pending); self.assertTrue(state.result["recovery_required"])
        self.assertEqual(state.result["upstream_task_id"], "accepted-1")
        self.assertIn("accepted-1", json.dumps(state.calls)); self.assertEqual(len(state.calls), 1)
        self.phase = None; self.make_adapter(strategy=True); self.execute()
        self.assertEqual(self.snapshot().status, TaskStatus.completed); self.assertEqual(self.submissions, [1])
        self.assertEqual(len(self.snapshot().assets), 2)

    def test_partial_download_resumes_saved_output_urls_without_poll_or_post(self):
        self.phase = "download"; self.execute(); state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.pending); self.assertEqual(len(state.assets), 1)
        self.assertEqual(state.cost, 2); self.assertEqual(state.result["usage"], {"input_tokens": 17})
        self.assertTrue(state.result["billing"]["additional_cost_unknown"])
        self.phase = None; self.make_adapter(); self.execute()
        self.assertEqual(len(self.requests), 1); self.assertEqual(self.submissions, [1])
        self.assertEqual(len(self.persisted), 2); self.assertEqual(len(self.snapshot().assets), 2)

    def test_accepted_checkpoint_crash_keeps_original_model_and_price(self):
        self.stop_state = "accepted"
        with self.assertRaises(ProcessExited): self.execute()
        self.assertEqual(self.requests, []); self.assertEqual(self.snapshot().result["upstream_task_id"], "accepted-1")
        self.profile = replace(self.profile, unit_price=99); self.make_adapter(); self.execute()
        self.assertEqual(self.snapshot().cost, 4); self.assertEqual(self.submissions, [1])
        self.assertEqual(self.snapshot().result["generation_progress"]["request_model"], "r19-model")

    def test_unknown_submit_without_receipt_is_never_posted_again(self):
        self.phase = "submit"; self.execute(); self.assertEqual(self.snapshot().status, TaskStatus.pending)
        self.phase = None; self.make_adapter(); self.execute()
        self.assertEqual(self.submissions, [1]); self.assertEqual(self.requests, [])
        self.assertEqual(self.snapshot().status, TaskStatus.pending)

    def test_confirmed_failure_is_terminal_even_after_bad_local_input(self):
        self.phase = "terminal"; self.execute(); state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.failed); self.assertFalse(state.result["recovery_required"])
        self.assertEqual(state.result["usage"], {"input_tokens": 17})
        with self.sessions() as db:
            task = db.get(Task, self.task_id); task.payload = {**task.payload, "prompt": ""}; db.commit()
        self.phase = None; self.make_adapter(); self.execute()
        self.assertEqual(self.snapshot().status, TaskStatus.failed)
        self.assertEqual(self.snapshot().result["upstream_task_id"], "accepted-1")
        self.assertEqual(self.submissions, [1]); self.assertEqual(len(self.requests), 1)

    def test_stale_lease_stops_new_checkpoint_and_later_output_io(self):
        self.lease(); self.revoke_after_first = True; self.execute("owner"); state = self.snapshot()
        self.assertEqual(state.assets, []); self.assertEqual(len(self.persisted), 1)
        self.assertEqual(self.submissions, [1]); self.assertNotEqual(state.status, TaskStatus.completed)

    def test_checkpoint_failure_stops_query_and_persistent_fault_keeps_prefix(self):
        failed = False
        def once(session):
            nonlocal failed
            task = session.get(Task, self.task_id); steps = task.result.get("generation_progress", {}).get("steps", [])
            if not failed and steps and steps[-1].get("state") == "accepted":
                failed = True; raise OperationalError("synthetic commit", {}, Exception("db"))
        event.listen(self.sessions, "before_commit", once)
        try: self.execute()
        finally: event.remove(self.sessions, "before_commit", once)
        self.assertEqual(self.requests, []); self.assertEqual(self.snapshot().result["upstream_task_id"], "accepted-1")
        count = 0
        def persistent(session):
            nonlocal count
            count += 1
            if count > 1: raise OperationalError("persistent commit", {}, Exception("db"))
        self.make_adapter(); event.listen(self.sessions, "before_commit", persistent)
        try:
            with self.assertRaises(OperationalError): self.execute()
        finally: event.remove(self.sessions, "before_commit", persistent)
        self.assertEqual(self.snapshot().result["upstream_task_id"], "accepted-1"); self.assertEqual(self.requests, [])
        self.assertEqual(self.submissions, [1])

    def test_default_dispatch_reviews_then_explicitly_resumes_same_task(self):
        self.lease(); self.phase = "poll"; self.run_claim()
        with self.sessions() as db: self.assertEqual(db.get(TaskDispatch, self.task_id).state, "review")
        self.phase = None; self.make_adapter()
        with self.sessions() as db:
            job = db.get(TaskDispatch, self.task_id); job.state = "leased"; job.lease_owner = "owner"
            job.lease_until = datetime.now(timezone.utc)+timedelta(minutes=5); db.commit()
        self.run_claim()
        with self.sessions() as db: self.assertEqual(db.get(TaskDispatch, self.task_id).state, "done")
        self.assertEqual(self.snapshot().status, TaskStatus.completed); self.assertEqual(self.submissions, [1])

    def test_model_endpoint_count_drift_and_preflight_keep_accepted_context(self):
        self.phase = "poll"; self.execute(); self.phase = None
        model = self.plan.body["model"]; self.plan.body["model"] = "changed"; self.make_adapter(); self.execute()
        self.assertEqual(self.snapshot().status, TaskStatus.pending); self.plan.body["model"] = model
        profile = self.profile; self.profile = replace(profile, base_url=profile.base_url + "/changed")
        self.make_adapter(); self.execute(); self.assertEqual(self.snapshot().status, TaskStatus.pending); self.profile = profile
        with self.sessions() as db:
            task = db.get(Task, self.task_id); task.payload = {**task.payload, "image_count": 3}; db.commit()
        self.make_adapter(); self.execute(); self.assertEqual(self.snapshot().status, TaskStatus.pending)
        with self.sessions() as db:
            task = db.get(Task, self.task_id); task.payload = {**task.payload, "image_count": 2, "prompt": ""}; db.commit()
        self.make_adapter(); self.execute(); state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.pending); self.assertEqual(state.result["upstream_task_id"], "accepted-1")
        self.assertEqual(self.submissions, [1]); self.assertEqual(len(self.requests), 1)

    def test_immediate_outputs_per_request_and_reexecution_do_not_duplicate(self):
        self.immediate = True; self.profile = replace(self.profile, pricing_unit="per_request"); self.make_adapter(); self.execute()
        state = self.snapshot(); self.assertEqual(state.status, TaskStatus.completed); self.assertEqual(state.cost, 2)
        self.assertEqual(self.requests, []); ids = list(state.assets)
        self.make_adapter(); self.execute(); state = self.snapshot()
        self.assertEqual(state.assets, ids); self.assertEqual(self.submissions, [1]); self.assertEqual(len(state.calls), 1)
        self.assertEqual(len(state.ledgers), 2)

    def test_url_only_receipt_or_missing_required_id_is_not_reposted(self):
        self.url_only = True; self.execute(); state = self.snapshot()
        self.assertEqual(self.submissions, [1])
        if self.protocol == "haodeya":
            self.assertEqual(state.status, TaskStatus.completed); self.assertEqual(self.requests, ["https://fixture.invalid/saved-poll"])
        else:
            self.assertEqual(state.status, TaskStatus.pending); self.assertEqual(self.requests, [])
            self.make_adapter(); self.execute(); self.assertEqual(self.submissions, [1])

    def test_poll_callback_commits_usage_and_next_query_address_before_retry(self):
        self.redirect = True; self.phase = "redirect-fault"; self.execute(); state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.pending); self.assertEqual(state.result["usage"], {"input_tokens": 17})
        self.phase = None; self.make_adapter(); self.execute()
        expected = "https://fixture.invalid/next-poll" if self.protocol == "haodeya" else self.profile.base_url + "/tasks/accepted-1"
        self.assertEqual(self.requests[-1], expected); self.assertEqual(self.submissions, [1])

    def test_base64_output_bytes_are_not_stored_and_original_id_is_requeried(self):
        self.b64 = True; self.phase = "download"; self.execute(); state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.pending); self.assertEqual(len(state.assets), 1)
        serialized = json.dumps(state.result["generation_progress"])
        self.assertNotIn(self.base64_images[0], serialized); self.assertNotIn(self.base64_images[1], serialized)
        self.phase = None; self.make_adapter(); self.execute()
        self.assertEqual(self.snapshot().status, TaskStatus.completed); self.assertEqual(self.submissions, [1])
        self.assertEqual(len(self.requests), 2); self.assertEqual(len(self.persisted), 2)
        with self.sessions() as db:
            original = db.get(Task, self.task_id)
            task = Task(title="immediate bytes checkpoint", workflow_id=original.workflow_id, project_id=original.project_id,
                        user_id=original.user_id, requested_provider=original.requested_provider, payload=dict(original.payload), result={})
            db.add(task); db.flush(); self.task_id = task.id; db.commit()
        self.immediate = True; self.make_adapter()
        def stop_after_last_path(session):
            steps = self.snapshot().result.get("generation_progress", {}).get("steps", [])
            if steps and steps[-1]["state"] == "persisting" and len(steps[-1]["storage_paths"]) == 2:
                raise ProcessExited()
        event.listen(self.sessions, "after_commit", stop_after_last_path)
        try:
            with self.assertRaises(ProcessExited): self.execute()
        finally: event.remove(self.sessions, "after_commit", stop_after_last_path)
        self.assertEqual(len(self.snapshot().assets), 2)
        self.make_adapter(); self.execute()
        self.assertEqual(self.snapshot().status, TaskStatus.completed)
        self.assertEqual(self.submissions, [1, 2]); self.assertEqual(len(self.requests), 2)

    def test_batch_continues_only_steps_that_were_never_submitted(self):
        self.single_output_steps = True; self.stop_state = "completed"
        with self.assertRaises(ProcessExited): self.execute()
        self.assertEqual(self.submissions, [1]); self.assertEqual(len(self.snapshot().assets), 1)
        self.make_adapter(); self.execute(); self.assertEqual(self.submissions, [1, 2])
        self.assertEqual(len(self.requests), 2); self.assertEqual(len(self.snapshot().assets), 2)
        self.assertEqual(self.snapshot().cost, 4)

    def test_legacy_partial_without_query_identity_stays_readable_for_review(self):
        self.phase = "download"; self.execute(); state = self.snapshot()
        with self.sessions() as db:
            task = db.get(Task, self.task_id); result = dict(task.result); progress = dict(result["generation_progress"])
            progress.pop("kind", None); progress.pop("query_identity", None)
            for step in progress["steps"]: step.pop("query_context", None)
            result["generation_progress"] = progress; task.result = result; db.commit()
        self.phase = None; self.make_adapter(); self.execute(); state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.pending); self.assertEqual(len(state.assets), 1)
        self.assertEqual(state.cost, 2); self.assertEqual(self.submissions, [1]); self.assertEqual(len(self.requests), 1)


class HaodeyaImageRecoveryTests(AsyncImageRecoveryBase):
    protocol = "haodeya"


class ModelScopeImageRecoveryTests(AsyncImageRecoveryBase):
    protocol = "modelscope"
