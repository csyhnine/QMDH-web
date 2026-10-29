"""R20-B/C: real Ark/Jimeng adapters share the accepted durability matrix."""
from dataclasses import replace
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request
from urllib.parse import urlencode

from tests.test_review_async_recovery import AsyncRecoveryTests, load
from app.models import Task, TaskStatus


class VolcengineRecoveryBase(AsyncRecoveryTests):
    kind = "ark"

    def setUp(self):
        self.adapter_ready = False
        super().setUp()
        self.profile = replace(self.profile, api_secret="synthetic-secret-unused")
        self.query_options = []
        self.selected_strategy = "synthetic-" + self.kind
        ns = {**self.video_ns, "replace": replace,
              "VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY": "synthetic-ark", "ARK_VIDEO_TASKS_ENDPOINT_PATH": "/contents/generations/tasks",
              "VOLCENGINE_CV_JIMENG_VIDEO_STRATEGY": "synthetic-jimeng",
              "resolve_strategy_for_capability": lambda **kwargs: self.selected_strategy,
              "_submit_ark_video_task": self.submit_video, "_poll_ark_video_result": self.poll_video,
              "_submit_jimeng_video_task": self.submit_video, "_poll_jimeng_video_result": self.poll_video}
        self.relative = "app/services/provider_adapters/volcengine_" + self.kind + "_video.py"
        self.class_name = "VolcengineArkVideoProviderAdapter" if self.kind == "ark" else "VolcengineJimengVideoProviderAdapter"
        load(self.relative, ns, classes=[self.class_name],
             functions=["_candidate_sources", "_extract_task_id", "_extract_task_status", "_extract_request_id", "_extract_usage",
                        "_ark_video_request_body", "_jimeng_config", "_jimeng_video_submit_body"])
        self.video_ns = ns
        self.namespace.update(resolve_strategy_for_capability=lambda **kwargs: self.selected_strategy,
                              DASHSCOPE_ASYNC_VIDEO_STRATEGY="synthetic-dashscope",
                              HAODEYA_GROK_VIDEO_STRATEGY="synthetic-grok",
                              VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY="synthetic-ark",
                              VOLCENGINE_CV_JIMENG_VIDEO_STRATEGY="synthetic-jimeng")
        self.adapter_ready = True
        self.new_adapter()

    def new_adapter(self, wrapper=False):
        if not getattr(self, "adapter_ready", False):
            return super().new_adapter(wrapper=wrapper)
        adapter = self.video_ns[self.class_name](self.definition, self.profile)
        if wrapper:
            outer = object.__new__(self.namespace["StrategyProviderAdapter"])
            outer.profile, outer.definition = self.profile, self.definition
            outer.dashscope_video_adapter = self.video_ns["DashScopeVideoProviderAdapter"](self.definition, self.profile)
            setattr(outer, "ark_video_adapter" if self.kind == "ark" else "jimeng_video_adapter", adapter)
            adapter = outer
        self.adapter = adapter
        self.namespace["get_provider_adapter"] = lambda *args: adapter

    def poll_video(self, profile, task_id, **kwargs):
        self.query_options.append(dict(kwargs))
        return super().poll_video(profile, task_id)

    def test_real_poll_helper_distinguishes_terminal_failure_from_transport(self):
        ns = {**self.video_ns, "Request": Request, "HTTPError": HTTPError, "URLError": URLError, "json": json,
              "urlencode": urlencode,
              "_SUCCEEDED_STATUSES": {"SUCCEEDED"}, "_FAILED_STATUSES": {"FAILED"}, "sleep": lambda *args: None,
              "_ark_headers": lambda *args: {}, "_volcengine_signed_headers": lambda **kwargs: {}}
        name = "_poll_ark_video_result" if self.kind == "ark" else "_poll_jimeng_video_result"
        load(self.relative, ns, functions=[name, "_signed_cv_request"])
        seen = []
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return b'{"output":{"task_status":"FAILED"}}'
        def respond(request, **kwargs): seen.append(request); return Response()
        ns["urlopen"] = respond
        options = {} if self.kind == "ark" else {"result_action": "CVSync2AsyncGetResult", "version": "2022-08-31", "req_key": "r20-model"}
        with self.assertRaises(self.video_ns["UpstreamTaskFailed"]): ns[name](self.profile, "accepted-unique", **options)
        self.assertEqual(len(seen), 1)
        if self.kind == "ark":
            self.assertEqual(seen[0].method, "GET")
            self.assertEqual(seen[0].full_url, "https://provider.invalid/contents/generations/tasks/accepted-unique")
        else:
            self.assertEqual(seen[0].method, "POST")
            self.assertIn("Action=CVSync2AsyncGetResult", seen[0].full_url)
            self.assertNotIn("SubmitTask", seen[0].full_url)
            self.assertEqual(json.loads(seen[0].data), {"req_key": "r20-model", "task_id": "accepted-unique"})
        ns["urlopen"] = lambda *args, **kwargs: (_ for _ in ()).throw(URLError("offline"))
        with self.assertRaisesRegex(ValueError, "request failed"): ns[name](self.profile, "accepted-unique", **options)


class ArkRecoveryTests(VolcengineRecoveryBase):
    kind = "ark"

    def test_actual_request_model_is_saved_and_drift_is_refused(self):
        with self.sessions() as db:
            task = db.get(Task, self.task_id)
            task.payload = {**task.payload, "request_body": {"model": "actual-body-model", "prompt": "private-body"}}
            db.commit()
        self.new_adapter(wrapper=True); self.phase = "poll"; self.execute()
        state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.pending)
        self.assertEqual(state.result["generation_progress"]["request_model"], "actual-body-model")
        self.assertNotIn("private-body", json.dumps(state.result["generation_progress"]))
        with self.sessions() as db:
            task = db.get(Task, self.task_id); task.payload = {**task.payload, "request_body": {"model": "changed-body-model"}}; db.commit()
        self.phase = None; self.new_adapter(wrapper=True); self.execute()
        self.assertEqual(self.snapshot().status, TaskStatus.pending)
        self.assertEqual(len(self.posts), 1); self.assertEqual(len(self.gets), 1)
        with self.sessions() as db:
            task = db.get(Task, self.task_id); task.payload = {**task.payload, "request_body": {"model": "actual-body-model"}}; db.commit()
        self.new_adapter(wrapper=True); self.execute()
        self.assertEqual(self.snapshot().status, TaskStatus.completed)
        self.assertEqual(len(self.posts), 1); self.assertEqual(len(self.gets), 2)
        self.assertEqual(self.snapshot().result["response_model"], "actual-body-model")


class JimengRecoveryTests(VolcengineRecoveryBase):
    kind = "jimeng"

    def test_query_context_keeps_accepted_req_key_and_refuses_config_drift(self):
        config = {"req_key": "config-key", "result_action": "FixtureGetResult", "version": "fixture-version", "region": "fixture-region", "service": "fixture-service"}
        self.profile = replace(self.profile, adapter_config=config)
        with self.sessions() as db:
            task = db.get(Task, self.task_id)
            task.payload = {**task.payload, "request_body": {"req_key": "accepted-body-key", "prompt": "private-body"}}
            db.commit()
        self.new_adapter(wrapper=True); self.phase = "poll"; self.execute()
        original = self.snapshot().result["generation_progress"]
        self.assertEqual(original["request_model"], "accepted-body-key")
        self.assertEqual(original["query_context"], {**config, "req_key": "accepted-body-key"})
        self.assertEqual(self.query_options[-1], {"result_action": "FixtureGetResult", "version": "fixture-version", "req_key": "accepted-body-key"})
        for secret in (self.profile.api_key, self.profile.api_secret, "private-body"):
            self.assertNotIn(secret, json.dumps(original))
        self.phase = None
        for key in ("result_action", "version", "region", "service"):
            with self.subTest(key=key):
                self.profile = replace(self.profile, adapter_config={**config, key: "changed"})
                self.new_adapter(wrapper=True); self.execute()
                self.assertEqual(self.snapshot().status, TaskStatus.pending)
                self.assertEqual(self.snapshot().result["generation_progress"]["query_context"], original["query_context"])
                self.assertEqual(len(self.posts), 1); self.assertEqual(len(self.gets), 1)
        self.profile = replace(self.profile, adapter_config=config)
        self.new_adapter(wrapper=True); self.execute()
        self.assertEqual(self.snapshot().status, TaskStatus.completed)
        self.assertEqual(len(self.posts), 1); self.assertEqual(len(self.gets), 2)
        self.assertEqual(self.query_options[-1]["req_key"], "accepted-body-key")
