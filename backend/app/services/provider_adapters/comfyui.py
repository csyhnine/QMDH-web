"""Private ComfyUI text-to-image adapter. Workflows are administrator files.

No blind submit retry, no global interrupt, and no automatic GPU lock expiry:
after an ambiguous submit or disconnect an operator must reconcile the prompt.
"""
from __future__ import annotations

from copy import deepcopy
import hashlib
from io import BytesIO
import json
from pathlib import Path, PurePosixPath
import secrets
from time import monotonic, sleep
from typing import Callable
from uuid import uuid4, UUID

import httpx
from PIL import Image
from redis import Redis

from app.core.config import ImageProviderProfile, settings
from app.services.media_storage import write_binary_asset
from app.services.model_registry import ProviderDefinition
from app.services.provider_adapters.base import ExecutionOutcome, ProviderExecutionError, RequestDiagnostics

BASE_URL = "http://comfy-visitor:8188"
GPU_LOCK = "qmdh:comfyui:gpu:owner"
WORKFLOWS = {"qwen_image_2_1_t2i", "z_image_turbo"}
MAX_IMAGE_BYTES = 32 * 1024 * 1024
MAX_PIXELS = 4096 * 4096


def _integer(value, name: str, low: int, high: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise ValueError(f"ComfyUI {name} must be an integer in {low}..{high}")
    return value


def load_workflow(root: Path, workflow_id: str) -> tuple[dict, dict]:
    if workflow_id not in WORKFLOWS:
        raise ValueError("ComfyUI workflow is not enabled; first release supports text-to-image only")
    root = root.resolve()
    mapping = json.loads((root / "workflow-map.json").read_text(encoding="utf-8-sig"))[workflow_id]
    file = (root / mapping["filename"]).resolve()
    if file.parent != root or file.stat().st_size > 2 * 1024 * 1024:
        raise ValueError("Invalid ComfyUI workflow file")
    raw = file.read_bytes()
    if hashlib.sha256(raw).hexdigest() != mapping["sha256"]:
        raise ValueError("ComfyUI workflow hash mismatch")
    graph = json.loads(raw.decode("utf-8-sig"))
    if not isinstance(graph, dict) or mapping["capability"] != "image.generate":
        raise ValueError("Invalid ComfyUI API graph")
    return graph, mapping


def prepare_graph(graph: dict, mapping: dict, payload: dict, *, seed: int, prefix: str) -> dict:
    graph = deepcopy(graph)
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt or len(prompt) > 16000:
        raise ValueError("ComfyUI requires a prompt of 1..16000 characters")
    if _integer(payload.get("image_count", 1), "image_count", 1, 1) != 1 or _integer(payload.get("batch_size", 1), "batch_size", 1, 1) != 1:
        raise ValueError("ComfyUI first release supports one image per task")
    if any(payload.get(k) for k in ("reference_image", "reference_images", "source_image", "source_images", "image", "images", "image_urls")):
        raise ValueError("ComfyUI text-to-image cannot accept reference images")
    for field, value in (("prompt", prompt), ("seed", seed)):
        for node_id, input_name in mapping[field]:
            graph[node_id]["inputs"][input_name] = value
    if "enhance_prompt" in mapping:
        node, field = mapping["enhance_prompt"]
        graph[node]["inputs"][field] = False
    # Freeze sampler/model/steps/CFG; UI parameters must not silently pretend to apply.
    for field in ("steps", "cfg", "sampler", "scheduler", "enhance_prompt", "negative_prompt", "megapixels"):
        if payload.get(field) not in (None, "", False):
            raise ValueError(f"ComfyUI {field} is fixed by the approved workflow")
    width, height = payload.get("width"), payload.get("height")
    if (width is None) != (height is None):
        raise ValueError("ComfyUI width and height must be supplied together")
    if width is None:
        ratios = {"1:1": (1024, 1024), "16:9": (1344, 768), "9:16": (768, 1344),
                  "4:3": (1152, 896), "3:4": (896, 1152), "3:2": (1216, 832), "2:3": (832, 1216)}
        ratio = str(payload.get("aspect_ratio") or "1:1")
        if ratio not in ratios:
            raise ValueError("Unsupported ComfyUI aspect ratio; supply explicit width/height")
        width, height = ratios[ratio]
    resolution = str(payload.get("resolution") or "1k").lower()
    if resolution not in ("1k", "", "default"):
        raise ValueError("ComfyUI larger resolution presets require validation; use explicit width/height")
    for field, value in (("width", width), ("height", height)):
        value = _integer(value, field, 256, 2048)
        if value % 8:
            raise ValueError("ComfyUI dimensions must be multiples of 8")
        node, input_name = mapping[field]
        # Replace the actual link to ResolutionSelector, not its ineffective defaults.
        graph[node]["inputs"][input_name] = value
        graph[node]["inputs"]["batch_size"] = 1
    if width * height > 2048 * 2048:
        raise ValueError("ComfyUI pixel budget exceeded")
    graph[mapping["output_node"]]["inputs"]["filename_prefix"] = prefix
    return graph


def output_reference(history: dict, prompt_id: str, output_node: str) -> dict | None:
    record = history.get(prompt_id)
    if not record:
        return None
    status = record.get("status", {})
    messages = status.get("messages", [])
    if status.get("status_str") == "error" or any(
        isinstance(m, list) and m and m[0] in ("execution_error", "execution_interrupted") for m in messages
    ):
        raise ValueError(f"ComfyUI execution failed for prompt {prompt_id}")
    if status.get("completed") is not True:
        return None
    images = record.get("outputs", {}).get(output_node, {}).get("images", [])
    if len(images) != 1:
        raise ValueError("ComfyUI completed without exactly one approved saved image")
    ref = images[0]
    filename, subfolder = ref.get("filename", ""), ref.get("subfolder", "")
    if (ref.get("type") != "output" or not isinstance(filename, str) or not filename
            or not isinstance(subfolder, str) or "/" in filename or "\\" in filename
            or any(c in filename + subfolder for c in ("\0", ":", "\\"))
            or PurePosixPath(subfolder).is_absolute() or ".." in PurePosixPath(subfolder).parts
            or filename in (".", "..")):
        raise ValueError("Unsafe ComfyUI output reference")
    return {"filename": filename, "subfolder": subfolder, "type": "output"}


class ComfyUIProviderAdapter:
    def __init__(self, definition: ProviderDefinition, profile: ImageProviderProfile):
        self.definition, self.profile = definition, profile
        self.task_id: int | None = None
        self.state: dict = {}
        self.checkpoint: Callable[[dict], None] | None = None

    def bind_task(self, task_id: int, state: dict, checkpoint: Callable[[dict], None]):
        self.task_id, self.state, self.checkpoint = task_id, dict(state), checkpoint

    def _save(self, **changes):
        self.state = {**self.state, **changes}
        if self.checkpoint is None:
            raise ValueError("ComfyUI requires a durable QMDH task checkpoint")
        self.checkpoint(dict(self.state))

    def execute(self, capability: str, payload: dict) -> ExecutionOutcome:
        diagnostics = RequestDiagnostics("comfyui", "/prompt", BASE_URL + "/prompt",
                                         min(float(self.profile.timeout_seconds), 600), "comfyui", capability)
        try:
            return self._execute(capability, payload)
        except Exception as exc:
            raise ProviderExecutionError(str(exc), diagnostics=diagnostics) from exc

    def _execute(self, capability: str, payload: dict) -> ExecutionOutcome:
        if capability != "image.generate" or self.profile.base_url.rstrip("/") != BASE_URL:
            raise ValueError("ComfyUI requires image.generate and the fixed private visitor URL")
        if not self.task_id or self.checkpoint is None:
            raise ValueError("ComfyUI cannot submit without a durable task context")
        graph, mapping = load_workflow(Path(settings.comfyui_workflow_root), self.profile.model_name)
        if self.state and self.state.get("workflow_sha256") != mapping["sha256"]:
            raise ValueError("ComfyUI saved workflow version differs; reconcile existing prompt first")
        seed = self.state.get("seed", payload.get("seed"))
        if seed is None:
            seed = secrets.randbelow(2**53)
        seed = _integer(seed, "seed", 0, 2**53 - 1)
        graph = prepare_graph(graph, mapping, payload, seed=seed, prefix=f"qmdh_task_{self.task_id}")
        started = monotonic()
        budget = max(10.0, min(float(self.profile.timeout_seconds), 600.0))
        deadline = started + budget
        redis = Redis.from_url(settings.redis_url, decode_responses=True, socket_timeout=5, socket_connect_timeout=5)
        owner = str(self.task_id)
        prior = redis.get(GPU_LOCK)
        # Even same-task duplicate workers must not run concurrently. The lock is
        # deliberately retained on uncertainty and can only be reconciled manually.
        if prior is not None or not redis.set(GPU_LOCK, owner, nx=True):
            raise ValueError("ComfyUI GPU is occupied or awaiting reconciliation; no task was submitted")
        safe_release = True
        try:
            with httpx.Client(base_url=BASE_URL, trust_env=False, follow_redirects=False) as client:
                def request(method, path, *, limit=4 * 1024 * 1024, **kwargs):
                    remaining = deadline - monotonic()
                    if remaining <= 0:
                        raise TimeoutError("ComfyUI task timed out; upstream may still run, reconcile before retry")
                    with client.stream(method, path, timeout=httpx.Timeout(min(30.0, remaining), connect=min(5.0, remaining)), **kwargs) as response:
                        response.raise_for_status()
                        data = bytearray()
                        for chunk in response.iter_bytes():
                            if monotonic() >= deadline or len(data) + len(chunk) > limit:
                                raise ValueError("ComfyUI response exceeded time/size budget")
                            data.extend(chunk)
                        return bytes(data)

                prompt_id = self.state.get("prompt_id")
                if self.state.get("stage") in ("submitting", "submitted") and not prompt_id:
                    safe_release = False
                    raise ValueError("ComfyUI prior submission is uncertain; do not resubmit")
                if not prompt_id:
                    # Connectivity check is read-only and happens before submit intent.
                    json.loads(request("GET", "/system_stats"))
                    # Persist intent before POST so a lost response never triggers a
                    # second GPU run automatically. FRP/ComfyUI has no idempotency guarantee.
                    self._save(stage="submitting", seed=seed, workflow_id=self.profile.model_name,
                               workflow_sha256=mapping["sha256"], client_id=str(uuid4()))
                    safe_release = False
                    submitted = json.loads(request("POST", "/prompt", json={"prompt": graph, "client_id": self.state["client_id"]}))
                    if submitted.get("node_errors") or not submitted.get("prompt_id"):
                        raise ValueError("ComfyUI submission response invalid; reconcile before retry")
                    prompt_id = str(UUID(submitted["prompt_id"]))
                    self._save(stage="submitted", prompt_id=prompt_id)
                prompt_id = str(UUID(prompt_id))
                safe_release = False
                while True:
                    history = json.loads(request("GET", f"/history/{prompt_id}"))
                    try:
                        ref = output_reference(history, prompt_id, mapping["output_node"])
                    except ValueError:
                        terminal = history.get(prompt_id, {}).get("status", {})
                        if terminal.get("completed") is True or terminal.get("status_str") == "error":
                            safe_release = True
                        raise
                    if ref is not None:
                        safe_release = True  # Upstream execution is confirmed terminal.
                        self._save(stage="downloading", output=ref)
                        image = request("GET", "/view", params=ref, limit=MAX_IMAGE_BYTES)
                        with Image.open(BytesIO(image)) as im:
                            if im.format not in ("PNG", "JPEG", "WEBP") or im.width * im.height > MAX_PIXELS:
                                raise ValueError("ComfyUI output is not an approved image")
                            width, height = im.size
                            extension = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}[im.format]
                            im.verify()
                        storage = write_binary_asset(f"generated/comfyui/task-{self.task_id}/{prompt_id}.{extension}", image)
                        self._save(stage="downloaded", storage_path=storage, output_sha256=hashlib.sha256(image).hexdigest())
                        return ExecutionOutcome(self.profile.model_name, max(1, round((monotonic() - started) * 1000)),
                                                0.0, self.profile.pricing_currency, True, {
                            "summary": "ComfyUI image saved to QMDH storage", "adapter_mode": "comfyui",
                            "storage_path": storage, "storage_paths": [storage], "output_count": 1,
                            "requested_image_count": 1, "output_width": width, "output_height": height,
                            "upstream_task_id": prompt_id, "comfyui": dict(self.state),
                            "billing": {"cost": 0, "currency": self.profile.pricing_currency, "note": "Local GPU price not configured"},
                        })
                    sleep(min(2.0, max(0.0, deadline - monotonic())))
        finally:
            if safe_release:
                redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, GPU_LOCK, owner)
            redis.close()
