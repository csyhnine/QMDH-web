"""R20-D/E: single-output Grok/Bigjpg use durable accepted-task recovery."""
import ast
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from io import BytesIO
import json
import mimetypes
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request

from PIL import Image
from tests.test_review_async_recovery import AsyncRecoveryTests, ProcessExited, load
from app.models import Task, TaskDispatch, TaskStatus, Workflow


class SingleOutputRecoveryBase(AsyncRecoveryTests):
    kind = "grok"

    def setUp(self):
        self.adapter_ready = False
        super().setUp()
        self.url_only = False
        self.query_options = []
        self.selected_strategy = "synthetic-" + self.kind
        if self.kind == "grok":
            self.profile = replace(self.profile, model_name="happyhorse-1.1-t2v-5s")
        else:
            with self.sessions() as db:
                task = db.get(Task, self.task_id)
                db.get(Workflow, task.workflow_id).provider_capability = "image.upscale"
                task.payload = {**task.payload, "source_image": "https://fixture.invalid/source.png"}; db.commit()
        buffer = BytesIO(); Image.new("RGB", (1, 1), (3, 4, 5)).save(buffer, format="PNG")
        self.binary = buffer.getvalue()
        pricing = load("app/services/provider_adapters/video_common.py", {}, functions=["resolve_profile_tier_unit_price", "calculate_tiered_media_billing", "calculate_video_billing"])
        ns = {**self.video_ns, **pricing, "replace": replace, "sha256": sha256, "json": json,
              "datetime": datetime, "randint": lambda *args: 1234, "mimetypes": mimetypes, "urlparse": urlparse,
              "HAODEYA_GROK_VIDEO_STRATEGY": "synthetic-grok", "BIGJPG_UPSCALE_STRATEGY": "synthetic-bigjpg",
              "resolve_strategy_for_capability": lambda **kwargs: self.selected_strategy,
              "resolve_public_media_url": lambda path: path,
              "_submit_haodeya_grok_video_task": self.submit_video, "_poll_haodeya_grok_video_result": self.poll_video,
              "_download_haodeya_grok_video_content": self.download_content,
              "persist_generated_video_bytes": lambda **kwargs: self.write_output("generated/single.png", kwargs["video_bytes"]),
              "_submit_bigjpg_task": self.submit_video, "_poll_bigjpg_result": self.poll_video,
              "_download_upscaled_image": lambda url, **kwargs: (self.download_content(None, url), "image/png"),
              "write_binary_asset": self.write_output}
        self.relative = "app/services/provider_adapters/" + ("haodeya_grok_video.py" if self.kind == "grok" else "bigjpg_upscale.py")
        self.class_name = "HaodeyaGrokVideoProviderAdapter" if self.kind == "grok" else "BigjpgUpscaleProviderAdapter"
        from tests.test_review_partial_image_progress import BACKEND
        tree = ast.parse((BACKEND / self.relative).read_text(encoding="utf-8"))
        declarations = [n for n in tree.body if isinstance(n, (ast.Assign, ast.AnnAssign))]
        exec(compile(ast.fix_missing_locations(ast.Module(body=declarations, type_ignores=[])), self.relative, "exec"), ns)
        load(self.relative, ns, classes=[self.class_name], functions=[
            "_extract_task_id", "_extract_task_status", "_extract_polling_url", "_extract_output_url",
            "_resolve_grok_sku", "_apply_grok_sku_admin_override", "_grok_sku_billing_tier",
            "_build_haodeya_grok_request_body", "_build_happyhorse_request_body", "_collect_reference_paths", "_reject_seedance_asset_protocol",
            "_resolve_source_image", "_normalize_style", "_normalize_noise", "_normalize_x2", "_x2_to_factor_label",
            "_build_storage_path", "_extension_for_downloaded_image", "_extension_from_image_bytes", "_normalize_image_extension"])
        self.video_ns = ns
        load("app/services/task_executor.py", self.namespace, functions=["_task_payload_result_fields"])
        self.namespace.update(resolve_strategy_for_capability=lambda **kwargs: self.selected_strategy,
                              DASHSCOPE_ASYNC_VIDEO_STRATEGY="synthetic-dashscope", HAODEYA_GROK_VIDEO_STRATEGY="synthetic-grok",
                              VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY="synthetic-ark", VOLCENGINE_CV_JIMENG_VIDEO_STRATEGY="synthetic-jimeng",
                              BIGJPG_UPSCALE_STRATEGY="synthetic-bigjpg")
        self.adapter_ready = True
        self.new_adapter()

    def new_adapter(self, wrapper=False):
        if not getattr(self, "adapter_ready", False): return super().new_adapter(wrapper=wrapper)
        adapter = self.video_ns[self.class_name](self.definition, self.profile)
        if wrapper:
            outer = object.__new__(self.namespace["StrategyProviderAdapter"])
            outer.profile, outer.definition = self.profile, self.definition
            outer.dashscope_video_adapter = self.video_ns["DashScopeVideoProviderAdapter"](self.definition, self.profile)
            setattr(outer, "haodeya_grok_video_adapter" if self.kind == "grok" else "bigjpg_upscale_adapter", adapter)
            adapter = outer
        self.adapter = adapter; self.namespace["get_provider_adapter"] = lambda *args: adapter

    def submit_video(self, *args, **kwargs):
        self.posts.append("POST")
        if self.phase == "submit": raise URLError("synthetic lost response")
        if self.kind == "bigjpg": return {"tid": "accepted-unique", "remaining_api_calls": 19}
        return {"id": "" if self.url_only else "accepted-unique", "polling_url": "https://fixture.invalid/poll/saved"}

    def poll_video(self, profile, task_id, **kwargs):
        step = self.snapshot().result["generation_progress"]["steps"][0]
        self.assertEqual(step.get("upstream_task_id"), task_id)
        self.gets.append(task_id); self.query_options.append(dict(kwargs))
        if self.phase == "poll": raise URLError("synthetic offline query")
        if self.phase == "terminal": raise self.video_ns["UpstreamTaskFailed"]("synthetic explicit failure")
        if self.kind == "bigjpg": return {task_id: {"status": "success", "url": "https://fixture.invalid/upscaled.png"}}
        return {"id": "accepted-unique", "status": "completed", "usage": {"tokens": 17}}

    def download_content(self, profile, task_id):
        self.downloads.append(task_id)
        step = self.snapshot().result["generation_progress"]["steps"][0]
        self.assertTrue(step["output_urls"])
        if self.phase == "download": raise URLError("synthetic download failed")
        return self.binary

    def write_output(self, path, data):
        target = self.temporary / path; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
        self.persisted.append(path)
        if self.revoke_after_first or self.expire_after_first:
            with self.sessions() as db:
                job = db.get(TaskDispatch, self.task_id)
                if self.revoke_after_first: job.lease_owner = "new-owner"
                if self.expire_after_first: job.lease_until = datetime.now(timezone.utc)-timedelta(minutes=1)
                db.commit()
        return path

    def test_download_failure_keeps_urls_usage_and_resumes_without_poll_or_post(self):
        self.phase = "download"; self.execute(); state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.pending); self.assertEqual(state.assets, [])
        self.assertEqual(state.cost, 0); self.assertTrue(state.result["billing"]["additional_cost_unknown"])
        self.assertTrue(state.result["generation_progress"]["steps"][0]["output_urls"])
        self.assertEqual(state.result["upstream_task_id"], "accepted-unique")
        if self.kind == "grok": self.assertEqual(state.result["usage"], {"tokens": 17})
        self.phase = None; self.new_adapter(); self.execute()
        self.assertEqual(len(self.posts), 1); self.assertEqual(len(self.gets), 1)
        self.assertEqual(len(self.downloads), 2); self.assertEqual(len(self.snapshot().assets), 1)

    def test_checkpoint_crash_resumes_only_get_and_keeps_original_price(self):
        self.stop_after = "accepted"
        with self.assertRaises(ProcessExited): self.execute()
        self.assertEqual(self.gets, []); self.assertEqual(self.snapshot().result["upstream_task_id"], "accepted-unique")
        self.profile = replace(self.profile, unit_price=99); self.new_adapter(); self.execute()
        self.assertEqual(self.posts, ["POST"]); self.assertEqual(self.gets, ["accepted-unique"])
        self.assertEqual(self.snapshot().cost, 2)

    def test_success_reexecution_keeps_assets_calls_and_ledgers_stable(self):
        self.execute(); old = self.snapshot(); self.new_adapter(); self.execute(); state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.completed); self.assertFalse(state.result["recovery_required"])
        self.assertEqual(state.assets, old.assets); self.assertEqual(len(state.assets), 1)
        self.assertEqual(len(state.calls), 1); self.assertEqual(len(state.ledgers), 2); self.assertEqual(state.cost, 2)
        self.assertEqual(self.posts, ["POST"]); self.assertEqual(len(self.gets), 1)
        with Image.open(self.temporary / state.assets[0][1]) as image: self.assertEqual(image.size, (1, 1))
        self.assertEqual(state.result["billing"]["pricing_unit"], "per_video")
        # This is a new logical Task; Grok keeps its original forced per_video
        # contract, whereas Bigjpg keeps the configured per_request contract.
        with self.sessions() as db:
            old_task = db.get(Task, self.task_id)
            task = Task(title="single-request", workflow_id=old_task.workflow_id, project_id=old_task.project_id,
                        user_id=old_task.user_id, requested_provider=old_task.requested_provider, payload=dict(old_task.payload), result={})
            db.add(task); db.flush(); self.task_id = task.id; db.commit()
        self.profile = replace(self.profile, pricing_unit="per_request")
        self.new_adapter(); self.execute(); self.new_adapter(); self.execute()
        self.assertEqual(self.snapshot().cost, 2)
        self.assertEqual(self.snapshot().result["billing"]["pricing_unit"], "per_video" if self.kind == "grok" else "per_request")
        self.assertEqual(len(self.posts), 2); self.assertEqual(len(self.snapshot().calls), 1)

    def test_confirmed_upstream_failure_is_terminal(self):
        super().test_confirmed_upstream_failure_is_terminal()
        self.profile = replace(self.profile, model_name="invalid-after-confirmed-failure")
        if self.kind == "bigjpg":
            with self.sessions() as db:
                task = db.get(Task, self.task_id); task.payload = {**task.payload, "source_image": ""}; db.commit()
        self.new_adapter(); self.execute(); state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.failed)
        self.assertFalse(state.result["recovery_required"])
        self.assertEqual(state.result["generation_progress"]["steps"][0]["state"], "failed")
        self.assertEqual(state.result["upstream_task_id"], "accepted-unique")
        self.assertEqual(self.posts, ["POST"]); self.assertEqual(self.gets, ["accepted-unique"])

    def test_real_poll_helper_distinguishes_terminal_failure_from_transport(self):
        ns = {**self.video_ns, "Request": Request, "HTTPError": HTTPError, "URLError": URLError, "json": json,
              "sleep": lambda *args: None, "_haodeya_headers": lambda *args: {}}
        name = "_poll_haodeya_grok_video_result" if self.kind == "grok" else "_poll_bigjpg_result"
        load(self.relative, ns, functions=[name])
        seen = []
        data = {"status": "failed"} if self.kind == "grok" else {"accepted-unique": {"status": "failed"}}
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self): return json.dumps(data).encode()
        def respond(request, **kwargs): seen.append(request); return Response()
        ns["urlopen"] = respond
        options = {"polling_url": "https://fixture.invalid/poll/saved"} if self.kind == "grok" else {}
        with self.assertRaises(self.video_ns["UpstreamTaskFailed"]): ns[name](self.profile, "accepted-unique", **options)
        self.assertEqual(seen[0].method, "GET")
        self.assertEqual(seen[0].full_url, "https://fixture.invalid/poll/saved" if self.kind == "grok" else "https://provider.invalid/task/accepted-unique")
        ns["urlopen"] = lambda *args, **kwargs: (_ for _ in ()).throw(URLError("offline"))
        with self.assertRaisesRegex(ValueError, "request failed"): ns[name](self.profile, "accepted-unique", **options)


class GrokRecoveryTests(SingleOutputRecoveryBase):
    kind = "grok"

    def test_polling_url_only_receipt_survives_stop_and_recovers_content_id(self):
        self.url_only = True; self.stop_after = "accepted"
        with self.assertRaises(ProcessExited): self.execute()
        step = self.snapshot().result["generation_progress"]["steps"][0]
        self.assertEqual(step["polling_url"], "https://fixture.invalid/poll/saved")
        self.assertFalse(step.get("upstream_task_id")); self.assertEqual(self.gets, [])
        self.phase = "poll"; self.new_adapter(); self.execute()
        self.assertEqual(self.snapshot().status, TaskStatus.pending)
        self.phase = None; self.new_adapter(); self.execute()
        self.assertEqual(self.posts, ["POST"]); self.assertEqual(self.gets, ["", ""])
        self.assertTrue(all(o["polling_url"] == "https://fixture.invalid/poll/saved" for o in self.query_options))
        self.assertEqual(self.downloads, ["accepted-unique"])
        self.assertEqual(self.snapshot().result["upstream_task_id"], "accepted-unique")
        self.assertEqual(self.snapshot().status, TaskStatus.completed)

    def test_sku_billing_snapshot_and_preflight_failure_keep_accepted_context(self):
        original = {"upstream_sku_t2v_5s": "happyhorse-1.1-t2v-10s", "unit_price_2k": 7}
        self.profile = replace(self.profile, adapter_config=original)
        self.new_adapter(wrapper=True); self.stop_after = "accepted"
        with self.assertRaises(ProcessExited): self.execute()
        self.profile = replace(self.profile, adapter_config={**original, "upstream_sku_t2v_5s": "unsupported-model"})
        self.new_adapter(wrapper=True); self.execute()
        self.assertEqual(self.snapshot().status, TaskStatus.pending)
        self.assertEqual(self.snapshot().result["generation_progress"]["request_model"], "happyhorse-1.1-t2v-10s")
        self.assertEqual(self.snapshot().result["upstream_task_id"], "accepted-unique")
        self.assertEqual(len(self.posts), 1); self.assertEqual(self.gets, [])
        self.profile = replace(self.profile, adapter_config={**original, "unit_price_2k": 99})
        self.new_adapter(wrapper=True); self.execute()
        state = self.snapshot(); self.assertEqual(state.status, TaskStatus.completed)
        self.assertEqual(state.cost, 7); self.assertEqual(state.result["video_sku"], "happyhorse-1.1-t2v-10s")
        self.assertEqual(state.result["grok_video_mode"], "t2v"); self.assertEqual(state.result["upstream_download"], "content")
        self.assertEqual(self.posts, ["POST"])


class BigjpgRecoveryTests(SingleOutputRecoveryBase):
    kind = "bigjpg"

    def test_upscale_metadata_source_identity_and_image_result_are_preserved(self):
        with self.sessions() as db:
            task = db.get(Task, self.task_id); task.payload = {**task.payload, "upscale_style": "art", "upscale_noise": "1", "upscale_x2": "3"}; db.commit()
        self.new_adapter(wrapper=True); self.phase = "poll"; self.execute()
        state = self.snapshot(); self.assertEqual(state.status, TaskStatus.pending)
        self.assertEqual(state.result["upscale_style"], "art"); self.assertEqual(state.result["upscale_x2"], "3")
        self.assertEqual(state.result["remaining_api_calls"], 19)
        self.assertEqual(state.result["requested_image_count"], 1); self.assertNotIn("requested_video_count", state.result)
        self.assertIn("source_identity", state.result["generation_progress"]["query_context"])
        with self.sessions() as db:
            task = db.get(Task, self.task_id); task.payload = {**task.payload, "upscale_x2": "4"}; db.commit()
        self.phase = None; self.new_adapter(wrapper=True); self.execute()
        self.assertEqual(self.snapshot().status, TaskStatus.pending); self.assertEqual(len(self.gets), 1)
        self.assertEqual(self.snapshot().result["upscale_x2"], "3")
        with self.sessions() as db:
            task = db.get(Task, self.task_id); task.payload = {**task.payload, "source_image": ""}; db.commit()
        self.new_adapter(wrapper=True); self.execute()
        self.assertEqual(self.snapshot().status, TaskStatus.pending)
        self.assertEqual(self.snapshot().result["upstream_task_id"], "accepted-unique")
        self.assertEqual(self.snapshot().result["upscale_x2"], "3")
        self.assertEqual(len(self.posts), 1); self.assertEqual(len(self.gets), 1)
        with self.sessions() as db:
            task = db.get(Task, self.task_id); task.payload = {**task.payload, "upscale_x2": "3", "source_image": "https://fixture.invalid/source.png"}; db.commit()
        self.new_adapter(wrapper=True); self.execute(); state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.completed); self.assertEqual(state.result["upscale_factor"], "8x")
        self.assertEqual(state.result["upstream_output_url"], "https://fixture.invalid/upscaled.png")
        self.assertEqual(len(self.posts), 1); self.assertEqual(len(state.assets), 1)
        completed_assets = list(state.assets)
        with self.sessions() as db:
            task = db.get(Task, self.task_id); task.payload = {**task.payload, "source_image": ""}; db.commit()
        self.new_adapter(wrapper=True); self.execute(); state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.pending); self.assertEqual(state.cost, 2)
        self.assertEqual(state.assets, completed_assets); self.assertEqual(len(state.calls), 1)
        self.assertEqual(len(state.ledgers), 2); self.assertEqual(len(self.posts), 1)
        with self.sessions() as db:
            task = db.get(Task, self.task_id); task.payload = {**task.payload, "source_image": "https://fixture.invalid/source.png"}; db.commit()
        self.new_adapter(wrapper=True); self.execute(); state = self.snapshot()
        self.assertEqual(state.status, TaskStatus.completed); self.assertEqual(state.cost, 2)
        self.assertEqual(state.assets, completed_assets); self.assertEqual(len(state.calls), 1)
        self.assertEqual(len(self.posts), 1)
