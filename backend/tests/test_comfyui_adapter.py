import hashlib
from io import BytesIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx
from PIL import Image

from app.core.config import ImageProviderProfile, settings
from app.services.model_registry import ProviderDefinition
from app.services.provider_adapters import comfyui as c
from app.services.provider_adapters.base import ProviderExecutionError

PROMPT_ID = "2d3ee7de-4e2d-4d27-bf75-8a6bd1019f64"


class FakeRedis:
    values = {}

    @classmethod
    def from_url(cls, *args, **kwargs):
        return cls()

    def get(self, key):
        return self.values.get(key)

    def set(self, key, value, nx=False):
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    def eval(self, script, count, key, value):
        if self.values.get(key) == value:
            del self.values[key]

    def close(self):
        pass


class ComfyUIAdapterTests(unittest.TestCase):
    def setUp(self):
        FakeRedis.values = {}
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.graph = {
            "13": {"class_type": "ResolutionSelector", "inputs": {"width": 777}},
            "459:456": {"class_type": "EmptyLatentImage", "inputs": {"width": ["13", 0], "height": ["13", 1], "batch_size": 1}},
            "459:474": {"class_type": "ComfySwitchNode", "inputs": {"switch": False, "on_false": "sample"}},
            "459:471": {"class_type": "TextGenerate", "inputs": {"prompt": "sample", "sampling_mode.seed": 0}},
            "459:458": {"class_type": "KSampler", "inputs": {"seed": 0}},
            "461": {"class_type": "SaveImageAdvanced", "inputs": {"filename_prefix": "sample"}},
        }
        self.mapping = {"filename": "t2i.json", "sha256": "", "capability": "image.generate",
                        "prompt": [["459:474", "on_false"], ["459:471", "prompt"]],
                        "seed": [["459:458", "seed"], ["459:471", "sampling_mode.seed"]],
                        "width": ["459:456", "width"], "height": ["459:456", "height"],
                        "output_node": "461", "enhance_prompt": ["459:474", "switch"]}
        self._write_workflow()
        self.profile = ImageProviderProfile("local-comfy", "transport-authenticated", c.BASE_URL,
                                            "qwen_image_2_1_t2i", adapter_kind="comfyui", timeout_seconds=30)
        self.definition = ProviderDefinition("local-comfy", self.profile.model_name, ["image.generate"], adapter_kind="comfyui")
        self.adapter = c.ComfyUIProviderAdapter(self.definition, self.profile)
        self.saved = []
        self.adapter.bind_task(42, {}, lambda state: self.saved.append(state))
        self.calls = []
        self.png = BytesIO()
        Image.new("RGB", (32, 32), "red").save(self.png, format="PNG")

    def _write_workflow(self):
        raw = json.dumps(self.graph).encode()
        (self.root / "t2i.json").write_bytes(raw)
        self.mapping["sha256"] = hashlib.sha256(raw).hexdigest()
        (self.root / "workflow-map.json").write_text(json.dumps({"qwen_image_2_1_t2i": self.mapping}))

    def tearDown(self):
        self.temp.cleanup()

    def history(self, **status):
        return {PROMPT_ID: {"status": {"completed": True, "status_str": "success", **status},
                            "outputs": {"461": {"images": [{"filename": "result.png", "subfolder": "qmdh", "type": "output"}]}}}}

    def handler(self, request):
        self.calls.append(request)
        if request.url.path == "/system_stats":
            return httpx.Response(200, json={"devices": []})
        if request.url.path == "/prompt":
            return httpx.Response(200, json={"prompt_id": PROMPT_ID, "node_errors": {}})
        if request.url.path.startswith("/history/"):
            return httpx.Response(200, json=self.history())
        if request.url.path == "/view":
            return httpx.Response(200, content=self.png.getvalue())
        raise AssertionError(request.url)

    def run_adapter(self, handler=None, **payload):
        original_client = httpx.Client
        client = original_client(transport=httpx.MockTransport(handler or self.handler), base_url=c.BASE_URL,
                                 trust_env=False, follow_redirects=False)
        with patch.object(settings, "comfyui_workflow_root", str(self.root)), patch.object(c, "Redis", FakeRedis), \
             patch.object(c.httpx, "Client", return_value=client), \
             patch.object(c, "write_binary_asset", side_effect=lambda path, data: path):
            return self.adapter.execute("image.generate", {"prompt": "a synthetic test", "seed": 0, **payload})

    def test_qwen_effective_bindings_and_template_immutability(self):
        graph = c.prepare_graph(self.graph, self.mapping, {"prompt": "new", "width": 768, "height": 1024}, seed=0, prefix="qmdh_task_42")
        self.assertEqual(graph["459:474"]["inputs"]["on_false"], "new")
        self.assertEqual(graph["459:471"]["inputs"]["prompt"], "new")
        self.assertEqual(graph["459:471"]["inputs"]["sampling_mode.seed"], 0)
        self.assertEqual(graph["459:456"]["inputs"]["width"], 768)
        self.assertEqual(self.graph["459:456"]["inputs"]["width"], ["13", 0])

    def test_success_uses_exact_prompt_output_and_persists_before_submit(self):
        outcome = self.run_adapter()
        self.assertEqual(outcome.result["upstream_task_id"], PROMPT_ID)
        self.assertIn("task-42", outcome.result["storage_path"])
        self.assertEqual(self.saved[0]["stage"], "submitting")
        self.assertEqual(self.saved[1]["prompt_id"], PROMPT_ID)
        self.assertEqual(self.saved[-1]["stage"], "downloaded")
        self.assertNotIn(c.GPU_LOCK, FakeRedis.values)
        posted = json.loads(next(r.content for r in self.calls if r.method == "POST"))
        self.assertEqual(posted["prompt"]["461"]["inputs"]["filename_prefix"], "qmdh_task_42")

    def test_no_submit_retry_after_ambiguous_response_and_gpu_stays_locked(self):
        def handler(request):
            if request.url.path == "/prompt":
                self.calls.append(request)
                raise httpx.ReadTimeout("response lost")
            return self.handler(request)
        with self.assertRaises(ProviderExecutionError):
            self.run_adapter(handler)
        self.assertEqual(sum(r.method == "POST" for r in self.calls), 1)
        self.assertEqual(FakeRedis.values[c.GPU_LOCK], "42")
        self.assertEqual(self.saved[-1]["stage"], "submitting")

    def test_gpu_busy_does_not_submit(self):
        FakeRedis.values[c.GPU_LOCK] = "other-task"
        with self.assertRaisesRegex(ProviderExecutionError, "GPU"):
            self.run_adapter()
        self.assertEqual(self.calls, [])
        self.assertEqual(FakeRedis.values[c.GPU_LOCK], "other-task")

    def test_offline_preflight_does_not_leave_gpu_locked(self):
        def handler(request):
            raise httpx.ConnectError("offline")
        with self.assertRaises(ProviderExecutionError):
            self.run_adapter(handler)
        self.assertNotIn(c.GPU_LOCK, FakeRedis.values)
        self.assertEqual(self.saved, [])

    def test_completed_error_reports_failure_and_releases_lock(self):
        def handler(request):
            if request.url.path.startswith("/history/"):
                return httpx.Response(200, json=self.history(completed=False, status_str="error"))
            return self.handler(request)
        with self.assertRaisesRegex(ProviderExecutionError, "execution failed"):
            self.run_adapter(handler)
        self.assertNotIn(c.GPU_LOCK, FakeRedis.values)

    def test_hash_tampering_rejected_before_network(self):
        (self.root / "t2i.json").write_text("{}")
        with self.assertRaisesRegex(ProviderExecutionError, "hash mismatch"):
            self.run_adapter()
        self.assertEqual(self.calls, [])

    def test_reference_images_and_unverified_edit_rejected(self):
        with self.assertRaises(ProviderExecutionError):
            self.run_adapter(reference_images=["private.png"])
        with self.assertRaises(ValueError):
            c.load_workflow(self.root, "qwen_image_2_1_image_edit")

    def test_bad_dimensions_and_batch_rejected(self):
        for args in ({"width": 1024}, {"width": 257, "height": 1024}, {"image_count": 2}, {"resolution": "4k"}):
            with self.subTest(args=args), self.assertRaises(ProviderExecutionError):
                self.run_adapter(**args)

    def test_output_reference_rejects_traversal_and_input_type(self):
        for patch_ref in ({"filename": "../x.png"}, {"subfolder": "../input"}, {"subfolder": "C:\\temp"}, {"type": "input"}):
            history = self.history()
            history[PROMPT_ID]["outputs"]["461"]["images"][0].update(patch_ref)
            with self.subTest(patch_ref=patch_ref), self.assertRaises(ValueError):
                c.output_reference(history, PROMPT_ID, "461")
        self.assertIsNone(c.output_reference({}, PROMPT_ID, "461"))

    def test_checkpoint_resume_does_not_submit_twice(self):
        self.adapter.bind_task(42, {"prompt_id": PROMPT_ID, "seed": 0, "stage": "submitted", "workflow_sha256": self.mapping["sha256"]}, self.saved.append)
        self.run_adapter()
        self.assertFalse(any(r.method == "POST" for r in self.calls))

    def test_invalid_image_is_not_materialized(self):
        def handler(request):
            if request.url.path == "/view":
                return httpx.Response(200, content=b"not an image")
            return self.handler(request)
        with self.assertRaises(ProviderExecutionError):
            self.run_adapter(handler)
        self.assertNotEqual(self.saved[-1]["stage"], "downloaded")

    def test_adapter_factory_selects_real_comfy_not_simulated(self):
        from app.services.task_executor import get_provider_adapter
        with patch("app.services.task_executor.get_provider_definition", return_value=self.definition), \
             patch("app.services.task_executor.get_image_provider_profile", return_value=self.profile):
            self.assertIsInstance(get_provider_adapter("local-comfy"), c.ComfyUIProviderAdapter)

    def test_task_executor_keeps_prompt_checkpoint_when_network_fails(self):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from app.database import Base
        from app.models import Project, Task, TaskStatus, Workflow, User
        from app.services import task_executor as executor
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        sessions = sessionmaker(bind=engine)
        with sessions() as db:
            user = User(name="synthetic-comfy", display_name="Synthetic", role="designer",
                        password_hash="test-only-not-a-password", is_active=True, project_codes=[])
            project = Project(code="COMFY-TEST", name="Synthetic", owner_user_id=None)
            workflow = Workflow(key="comfy-test", name="Synthetic", description="", category="image",
                                priority="P1", version="v1", provider_capability="image.generate")
            db.add_all([project, workflow, user]); db.flush()
            task = Task(title="Synthetic", status=TaskStatus.pending, workflow_id=workflow.id,
                        project_id=project.id, user_id=user.id, requested_provider="local-comfy", payload={"prompt": "synthetic"}, result={})
            db.add(task); db.commit(); task_id = task.id
        def fail_after_checkpoint(capability, payload):
            self.adapter._save(stage="submitted", prompt_id=PROMPT_ID)
            raise ValueError("test network failure after prompt accepted")
        with patch.object(executor, "SessionLocal", sessions), \
             patch.object(executor, "get_provider_adapter", return_value=self.adapter), \
             patch.object(self.adapter, "execute", side_effect=fail_after_checkpoint):
            executor.execute_task(task_id)
        with sessions() as db:
            task = db.get(Task, task_id)
            self.assertEqual(task.status, TaskStatus.failed)
            self.assertEqual(task.result["comfyui"]["prompt_id"], PROMPT_ID)
        engine.dispose()
