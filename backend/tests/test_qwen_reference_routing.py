from copy import deepcopy
from io import BytesIO
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from PIL import Image
import pytest

from app.core.config import ImageProviderProfile, settings
from app.scripts.prepare_qwen_reference_variants import build_bundle, verify_v11_dual, EDIT
from app.services.provider_adapters import comfyui as c
from app.services.model_registry import ProviderDefinition
from tests.test_comfyui_adapter import FakeRedis, PROMPT_ID


@pytest.fixture
def bundle(tmp_path):
    graph = {
        "470": {"class_type": "LoadImage", "inputs": {"image": "fixture.png"}},
        "502": {"class_type": "easy seed", "inputs": {"seed": 0}},
        "459:474": {"class_type": "TextEncodeQwenImage21", "inputs": {"images.image_1": ["470", 0], "resolution": 0}},
        "459:485": {"class_type": "BatchImagesNode", "inputs": {"images.image0": ["470", 0]}},
        "459:458": {"class_type": "KSampler", "inputs": {"seed": ["502", 0], "steps": 50, "cfg": 1}},
        "459:469": {"class_type": "QwenImage21Cache", "inputs": {"device": "gpu"}},
        "459:500": {"class_type": "TextGenerate", "inputs": {"prompt": "sample", "thinking": "disabled", "sampling_mode.seed": ["502", 0]}},
        "459:484": {"class_type": "ComfySwitchNode", "inputs": {"switch": False, "on_false": "sample"}},
        "459:456": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
        "459:468": {"class_type": "ComfySwitchNode", "inputs": {"switch": False}},
        "461": {"class_type": "SaveImageAdvanced", "inputs": {"filename_prefix": "sample", "images": ["459:485", 0]}},
    }
    raw = json.dumps(graph).encode()
    contract = {"filename": "v11.json", "sha256": hashlib.sha256(raw).hexdigest(), "capability": "image.edit",
                "version": "1.1", "reference_input_count": 1, "image_loaders": ["470"],
                "prompt": [["459:484", "on_false"], ["459:500", "prompt"]], "seed": [["502", "seed"]],
                "seed_consumers": [["459:458", "seed"], ["459:500", "sampling_mode.seed"]],
                "steps": ["459:458", "steps"], "steps_default": 50,
                "width": ["459:456", "width"], "height": ["459:456", "height"], "output_node": "461",
                "canvas_switch": ["459:468", "switch"], "resolution": ["459:474", "resolution"],
                "enhance_prompt": ["459:484", "switch"]}
    (tmp_path / "v11.json").write_bytes(raw)
    mapfile = tmp_path / "workflow-map.json"
    mapfile.write_text(json.dumps({EDIT: contract}))
    output = tmp_path / "candidate"
    report = build_bundle(mapfile, tmp_path, output)
    return output, report


def payload(count):
    return {"prompt": "Synthetic edit", "reference_images": [f"references/{i}.png" for i in range(count)]}


def test_v11_dual_only_adds_reference_node_and_links_preserving_all_v11_parameters(bundle):
    root, report = bundle
    single, base = c.load_workflow(root, EDIT)
    dual, mapping = c.load_workflow(root, EDIT, reference_count=2)
    verify_v11_dual(single, dual, base, mapping)
    assert dual["459:458"]["inputs"]["steps"] == 50
    assert dual["459:469"]["inputs"]["device"] == "gpu"
    assert dual["459:500"] == single["459:500"]
    assert dual["459:458"]["inputs"]["seed"] == ["502", 0]
    assert report[f"{EDIT}:2ref"]["gpu_tested"] is False
    for node, key, value in [("459:458", "steps", 25), ("459:469", "device", "auto"), ("459:500", "thinking", "enabled")]:
        changed = deepcopy(dual); changed[node]["inputs"][key] = value
        with pytest.raises(ValueError, match="outside the reference-input"):
            verify_v11_dual(single, changed, base, mapping)


def test_count_routing_and_capabilities_verify_exact_templates_and_reject_missing_counts(bundle):
    root, _ = bundle
    assert c.supported_reference_counts(root, EDIT) == [1, 2]
    hashes = []
    for count in (1, 2):
        _, mapping = c.select_workflow(root, EDIT, payload(count))
        assert c.reference_input_count(mapping) == count
        hashes.append(mapping["sha256"])
    assert hashes[0] != hashes[1]
    for count in (0, 3, 4):
        with pytest.raises(ValueError): c.select_workflow(root, EDIT, payload(count))
    from app.routers.providers import _comfy_reference_counts
    profile = SimpleNamespace(adapter_kind="comfyui", capabilities=["image.edit"], model_name=EDIT)
    with patch.object(settings, "comfyui_workflow_root", str(root)):
        assert _comfy_reference_counts(profile) == [1, 2]
        _, dual = c.load_workflow(root, EDIT, reference_count=2)
        (root / dual["filename"]).write_text("{}")
        assert _comfy_reference_counts(profile) == []
        with pytest.raises(ValueError, match="hash mismatch"): c.select_workflow(root, EDIT, payload(2))


def test_checkpoint_pins_variant_hash_and_count_and_legacy_single_bundle_remains_fixed(bundle):
    root, _ = bundle
    _, mapping = c.select_workflow(root, EDIT, payload(2))
    state = {"workflow_id": EDIT, "workflow_sha256": mapping["sha256"], "reference_input_count": 2}
    assert c.select_workflow(root, EDIT, payload(2), state)[1]["sha256"] == mapping["sha256"]
    with pytest.raises(ValueError, match="Workflow changed"): c.select_workflow(root, EDIT, payload(1), state)
    with pytest.raises(ValueError, match="count changed"): c.select_workflow(root, EDIT, payload(2), {**state, "reference_input_count": 1})
    manifest = json.loads((root / "workflow-map.json").read_text()); del manifest[EDIT]["reference_variants"]
    (root / "workflow-map.json").write_text(json.dumps(manifest))
    assert c.supported_reference_counts(root, EDIT) == [1]
    with pytest.raises(ValueError): c.select_workflow(root, EDIT, payload(2))


@pytest.mark.parametrize("node,key,value", [("459:458", "steps", 25), ("459:469", "device", "auto"), ("459:500", "thinking", "enabled")])
def test_runtime_rejects_legacy_parameters_even_when_admin_recalculates_variant_sha(bundle, node, key, value):
    root, _ = bundle
    graph, contract = c.load_workflow(root, EDIT, reference_count=2)
    graph[node]["inputs"][key] = value
    raw = json.dumps(graph).encode()
    (root / contract["filename"]).write_bytes(raw)
    manifest = json.loads((root / "workflow-map.json").read_text())
    manifest[EDIT]["reference_variants"]["2"]["sha256"] = hashlib.sha256(raw).hexdigest()
    (root / "workflow-map.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="outside the reference-input"):
        c.select_workflow(root, EDIT, payload(2))


def test_submission_contract_is_server_selected_and_checks_all_owned_references(bundle):
    root, _ = bundle
    with patch.object(settings, "comfyui_workflow_root", str(root)), patch.object(c, "owned_references", return_value=["a", "b"]) as owned:
        state = c.validate_submission(None, 8, EDIT, {**payload(2), "workflow_sha256": "client-forgery"})
        assert state["reference_input_count"] == 2 and state["workflow_sha256"] != "client-forgery"
        assert c.reference_input_count(owned.call_args.args[-1]) == 2


@pytest.mark.parametrize("count", [1, 2])
def test_actual_adapter_uploads_every_input_to_selected_graph_and_resumes_without_resubmit(bundle, count):
    root, _ = bundle
    stream = BytesIO(); Image.new("RGB", (32, 32), "red").save(stream, format="PNG"); png = stream.getvalue()
    calls, states, prompts = [], [], []
    def handler(request):
        calls.append(request.url.path)
        if request.url.path == "/system_stats": return httpx.Response(200, json={"devices": []})
        if request.url.path == "/upload/image": return httpx.Response(200, json={"name": f"image-{calls.count('/upload/image')}.png", "subfolder": "qmdh/42"})
        if request.url.path == "/prompt":
            prompts.append(json.loads(request.content)["prompt"])
            return httpx.Response(200, json={"prompt_id": PROMPT_ID, "node_errors": {}})
        if request.url.path.startswith("/history/"): return httpx.Response(200, json={PROMPT_ID: {"status": {"completed": True, "status_str": "success"}, "outputs": {"461": {"images": [{"filename": "out.png", "subfolder": "qmdh", "type": "output"}]}}}})
        if request.url.path == "/view": return httpx.Response(200, content=png)
        raise AssertionError(request.url)
    profile = ImageProviderProfile("synthetic-edit", "fixture", c.BASE_URL, EDIT, adapter_kind="comfyui")
    definition = ProviderDefinition("synthetic-edit", EDIT, ["image.edit"], adapter_kind="comfyui")
    adapter = c.ComfyUIProviderAdapter(definition, profile)
    _, mapping = c.select_workflow(root, EDIT, payload(count))
    initial = {"workflow_id": EDIT, "workflow_sha256": mapping["sha256"], "reference_input_count": count}
    adapter.bind_task(42, initial, lambda s: states.append(deepcopy(s)))
    client = httpx.Client
    from contextlib import contextmanager
    @contextmanager
    def sessions(): yield SimpleNamespace(get=lambda *args: SimpleNamespace(user_id=8))
    FakeRedis.values = {}
    with patch.object(settings, "comfyui_workflow_root", str(root)), patch.object(c, "Redis", FakeRedis), \
         patch.object(c.httpx, "Client", side_effect=lambda **kw: client(transport=httpx.MockTransport(handler), **kw)), \
         patch("app.database.SessionLocal", sessions), patch.object(c, "owned_references", return_value=[f"references/{i}.png" for i in range(count)]), \
         patch.object(c, "read_binary_asset", return_value=png), patch.object(c, "write_binary_asset", side_effect=lambda path, data: path):
        adapter.execute("image.edit", payload(count))
        assert calls.count("/upload/image") == count and len(prompts) == 1
        assert prompts[0]["470"]["inputs"]["image"] == "qmdh/42/image-1.png"
        if count == 2: assert prompts[0]["475"]["inputs"]["image"] == "qmdh/42/image-2.png"
        assert prompts[0]["459:458"]["inputs"]["steps"] == 50
        submitting = next(s for s in states if s.get("stage") == "submitting")
        assert submitting["workflow_sha256"] == mapping["sha256"]
        adapter.bind_task(42, {**submitting, "stage": "submitted", "prompt_id": PROMPT_ID}, lambda s: states.append(s))
        adapter.execute("image.edit", payload(count))
        assert len(prompts) == 1 and calls.count("/upload/image") == count


def test_acceptance_persists_contract_before_dispatch_and_duplicate_submission_keeps_original_pin(bundle):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.core.auth import get_current_auth_user
    from app.core.config import AuthUserProfile
    from app.database import get_db
    from app.models import Workflow, Task
    from app.routers import tasks
    from tests.test_task_dispatch import DispatchTests
    fixture = DispatchTests(methodName="runTest"); fixture.setUp()
    root, _ = bundle
    try:
        with fixture.sessions() as db: db.get(Workflow, fixture.workflow).provider_capability = "image.edit"; db.commit()
        app = FastAPI(); app.include_router(tasks.router)
        def session():
            with fixture.sessions() as db: yield db
        app.dependency_overrides[get_db] = session
        app.dependency_overrides[get_current_auth_user] = lambda: AuthUserProfile(name="dispatch-fixture", user_id=fixture.user, role="designer", token="fixture", project_codes=("DISPATCH",))
        provider = ProviderDefinition("comfy-fixture", EDIT, ["image.edit"], adapter_kind="comfyui")
        body = {"title": "Synthetic", "workflow_key": "image-generate", "project_code": "DISPATCH", "requested_provider": "comfy-fixture", "submission_key": "qwen-variant-test", "payload": payload(2)}
        with patch.object(tasks, "get_provider_map", return_value={"comfy-fixture": provider}), patch.object(tasks, "get_provider_definition", return_value=provider), patch.object(settings, "task_execution_mode", "redis"), patch.object(settings, "comfyui_workflow_root", str(root)), patch.object(c, "owned_references", return_value=["a", "b"]), patch.object(tasks, "enqueue_task"):
            client = TestClient(app); first = client.post("/tasks", json=body); assert first.status_code == 202, first.text
            with fixture.sessions() as db:
                pin = db.get(Task, first.json()["id"]).result["comfyui"]
                assert pin["reference_input_count"] == 2
            manifest = json.loads((root / "workflow-map.json").read_text()); del manifest[EDIT]["reference_variants"]
            (root / "workflow-map.json").write_text(json.dumps(manifest))
            second = client.post("/tasks", json=body); assert second.status_code == 202 and second.json()["id"] == first.json()["id"]
            with fixture.sessions() as db: assert db.get(Task, first.json()["id"]).result["comfyui"] == pin
    finally: fixture.tearDown()
