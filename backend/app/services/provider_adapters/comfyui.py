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
from PIL import Image, UnidentifiedImageError
from redis import Redis
from redis.exceptions import RedisError

from app.core.config import ImageProviderProfile, settings
from app.services.media_storage import write_binary_asset, read_binary_asset, coerce_relative_media_path
from app.services.model_registry import ProviderDefinition
from app.services.provider_adapters.base import ExecutionOutcome, ProviderExecutionError, RequestDiagnostics

BASE_URL = "http://comfy-visitor:8188"
GPU_LOCK = "qmdh:comfyui:gpu:owner"
WORKFLOWS = {"qwen_image_2_1_t2i", "z_image_turbo", "qwen_image_2_1_image_edit"}
MAX_IMAGE_BYTES = 32 * 1024 * 1024
MAX_PIXELS = 4096 * 4096


class ComfyDeferred(ProviderExecutionError):
    """Connectivity/ownership uncertainty: retain original job, never suggest rerun."""


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
    if not isinstance(graph, dict) or mapping["capability"] not in ("image.generate", "image.edit"):
        raise ValueError("Invalid ComfyUI API graph")
    return graph, mapping


def prepare_graph(graph: dict, mapping: dict, payload: dict, *, seed: int, prefix: str) -> dict:
    graph = deepcopy(graph)
    prompt = str(payload.get("prompt") or "").strip()
    supplement = str(payload.get("prompt_supplement") or "").strip()
    if supplement:
        prompt += "\n\n" + supplement
    if not prompt or len(prompt) > 16000:
        raise ValueError("ComfyUI requires a prompt of 1..16000 characters")
    if _integer(payload.get("image_count", 1), "image_count", 1, 1) != 1 or _integer(payload.get("batch_size", 1), "batch_size", 1, 1) != 1:
        raise ValueError("ComfyUI first release supports one image per task")
    editing = mapping["capability"] == "image.edit"
    if not editing and any(payload.get(k) for k in ("reference_image", "reference_images", "source_image", "source_images", "image", "images", "image_urls")):
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
    source_canvas = False
    width, height = payload.get("width"), payload.get("height")
    if (width is None) != (height is None):
        raise ValueError("ComfyUI width and height must be supplied together")
    if width is None:
        ratios = {"1:1": (1024, 1024), "16:9": (1280, 720), "9:16": (720, 1280),
                  "4:3": (1152, 864), "3:4": (864, 1152), "3:2": (1248, 832), "2:3": (832, 1248), "21:9": (1568, 672)}
        ratio = str(payload.get("aspect_ratio") or "1:1")
        if ratio in ("匹配比例", "智能", "auto", "automatic", "smart"):
            ratio = "1:1"
        source_canvas = editing and ratio in ("遵循原图", "遵循原图比例", "原图比例", "原图", "source", "match_source", "follow_source")
        if source_canvas:
            ratio = "1:1"  # unused latent; image branch below preserves source dimensions
        if ratio not in ratios:
            raise ValueError("Unsupported ComfyUI aspect ratio; supply explicit width/height")
        width, height = ratios[ratio]
    resolution = str(payload.get("resolution") or "1k").lower()
    if resolution not in ("1k", "2k", "4k", "", "default"):
        raise ValueError("ComfyUI larger resolution presets require validation; use explicit width/height")
    if payload.get("width") is None:
        scale = {"2k": 2, "4k": 4}.get(resolution, 1)
        # Presets use 1/4/16 megapixel budgets; keep every edge <= 4096.
        factor = min(scale, 4096 / max(width, height))
        width, height = round(width * factor / 8) * 8, round(height * factor / 8) * 8
    for field, value in (("width", width), ("height", height)):
        value = _integer(value, field, 256, 4096)
        if value % 8:
            raise ValueError("ComfyUI dimensions must be multiples of 8")
        node, input_name = mapping[field]
        # Replace the actual link to ResolutionSelector, not its ineffective defaults.
        graph[node]["inputs"][input_name] = value
        graph[node]["inputs"]["batch_size"] = 1
    if width * height > MAX_PIXELS:
        raise ValueError("ComfyUI pixel budget exceeded")
    if editing:
        node, field = mapping["canvas_switch"]
        graph[node]["inputs"][field] = not (payload.get("width") is None and source_canvas)
        node, field = mapping["resolution"]
        graph[node]["inputs"][field] = 0
    graph[mapping["output_node"]]["inputs"]["filename_prefix"] = prefix
    return graph


def reference_paths(payload):
    values = payload.get("reference_images") or payload.get("source_images") or []
    if not isinstance(values, list) or len(values) != 2 or not all(isinstance(p, str) for p in values):
        raise ValueError("本机 Qwen 图像编辑需要两张图片：第一张为目标图，第二张为参考图。")
    return values


def owned_references(db, user_id, payload):
    from sqlalchemy import select
    from app.models import Asset, Task, ReferenceUpload
    from urllib.parse import urlparse, unquote
    paths = []
    for value in reference_paths(payload):
        if value.startswith(("https://", "http://")):
            parsed = urlparse(value)
            allowed = {urlparse(settings.frontend_origin).netloc, urlparse(settings.public_media_base_url).netloc}
            if parsed.netloc not in allowed or parsed.query or parsed.fragment:
                raise ValueError("参考图必须来自当前用户的平台素材，不能使用外部地址。")
            value = unquote(parsed.path)
        path = coerce_relative_media_path(value)
        if ".." in PurePosixPath(path).parts or ":" in path:
            raise ValueError("Invalid reference path")
        upload = db.get(ReferenceUpload, path)
        asset = db.scalar(select(Asset.id).join(Task, Asset.source_task_id == Task.id)
                          .where(Asset.storage_path == path, Task.user_id == user_id))
        if not (upload and upload.user_id == user_id) and asset is None:
            raise ValueError("参考图不属于当前用户；旧上传图请重新上传。")
        data = read_binary_asset(path)
        if len(data) > MAX_IMAGE_BYTES:
            raise ValueError("参考图超过 32MB。")
        try:
            with Image.open(BytesIO(data)) as im:
                if im.format not in ("PNG", "JPEG", "WEBP") or im.width * im.height > MAX_PIXELS:
                    raise ValueError("参考图须为 PNG/JPEG/WebP，最多 1600 万像素。")
                im.verify()
        except (UnidentifiedImageError, OSError, SyntaxError) as exc:
            raise ValueError("参考图文件无法解码，请重新上传有效图片。") from exc
        paths.append(path)
    return paths


def validate_submission(db, user_id, workflow_id, payload):
    graph, mapping = load_workflow(Path(settings.comfyui_workflow_root), workflow_id)
    _integer(payload.get("image_count", 1), "image_count", 1, 3)
    prepare_graph(graph, mapping, {**payload, "image_count": 1}, seed=0, prefix="validation")
    if mapping["capability"] == "image.edit":
        owned_references(db, user_id, payload)


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
            uncertain = self.state.get("stage") in ("submitting", "submitted")
            retryable_status = isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code in (429, 500, 502, 503, 504)
            if (uncertain and "ComfyUI execution failed" not in str(exc)) or isinstance(exc, (httpx.TransportError, TimeoutError, OSError, RedisError)) or retryable_status or "GPU is occupied" in str(exc):
                raise ComfyDeferred(str(exc), diagnostics=diagnostics) from exc
            raise ProviderExecutionError(str(exc), diagnostics=diagnostics) from exc

    def _execute(self, capability: str, payload: dict) -> ExecutionOutcome:
        count = _integer(payload.get("image_count", 1), "image_count", 1, 3)
        completed = deepcopy(self.state.get("batch_outputs", []))
        if len(completed) > count:
            raise ValueError("Saved batch count differs; reconcile before retry")
        while len(completed) < count:
            outcome = self._execute_one(capability, {**payload, "image_count": 1})
            # Per-image entries must remain flat: embedding the live checkpoint
            # would point back to this batch list on the second image.
            completed.append({k: v for k, v in outcome.result.items() if k != "comfyui"})
            seed = (self.state["seed"] + 1) % (2**53)
            self._save(stage="between_images", prompt_id=None, client_id=None, seed=seed, batch_outputs=deepcopy(completed))
        last = completed[-1]
        self._save(stage="downloaded")
        return ExecutionOutcome(self.profile.model_name, sum(i.get("elapsed_ms", 1) for i in completed),
                                0.0, self.profile.pricing_currency, True, {
            **last, "storage_paths": [i["storage_path"] for i in completed], "output_count": count,
            "requested_image_count": count, "comfyui": dict(self.state),
        })

    def _execute_one(self, capability: str, payload: dict) -> ExecutionOutcome:
        if capability not in ("image.generate", "image.edit") or self.profile.base_url.rstrip("/") != BASE_URL:
            raise ValueError("ComfyUI requires the fixed private visitor URL")
        if not self.task_id or self.checkpoint is None:
            raise ValueError("ComfyUI cannot submit without a durable task context")
        graph, mapping = load_workflow(Path(settings.comfyui_workflow_root), self.profile.model_name)
        if capability != mapping["capability"]:
            raise ValueError("ComfyUI workflow capability mismatch")
        if self.state and self.state.get("workflow_sha256") != mapping["sha256"]:
            raise ValueError("ComfyUI saved workflow version differs; reconcile existing prompt first")
        if self.state.get("stage") == "downloaded" and self.state.get("prompt_id") and self.state.get("storage_path"):
            # A worker may die after durable download but before booking assets.
            # ComfyUI history can be lost on restart; the verified server file is
            # sufficient evidence and must not require another GPU execution.
            prompt = str(UUID(self.state["prompt_id"]))
            path = self.state["storage_path"]
            if path not in [f"generated/comfyui/task-{self.task_id}/{prompt}.{ext}" for ext in ("png", "jpg", "webp")]:
                raise ValueError("Invalid saved ComfyUI output path")
            try:
                data = read_binary_asset(path)
            except FileNotFoundError:
                data = None
            if data and hashlib.sha256(data).hexdigest() == self.state.get("output_sha256"):
                with Image.open(BytesIO(data)) as im:
                    width, height = im.size
                    im.verify()
                self._save(stage="downloaded")  # fence the execution lease
                redis = Redis.from_url(settings.redis_url, decode_responses=True, socket_timeout=5, socket_connect_timeout=5)
                try:
                    redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, GPU_LOCK, str(self.task_id))
                finally:
                    redis.close()
                return ExecutionOutcome(self.profile.model_name, 1, 0.0, self.profile.pricing_currency, True, {
                    "summary": "ComfyUI verified saved output recovered", "adapter_mode": "comfyui", "elapsed_ms": 1,
                    "storage_path": path, "storage_paths": [path], "output_count": 1, "requested_image_count": 1,
                    "output_width": width, "output_height": height, "upstream_task_id": prompt, "comfyui": dict(self.state),
                    "billing": {"cost": 0, "currency": self.profile.pricing_currency, "note": "Local GPU price not configured"},
                })
        if capability == "image.edit" and payload.get("width") is None and str(payload.get("aspect_ratio")) in ("遵循原图", "遵循原图比例", "原图比例", "原图", "source", "match_source", "follow_source") and payload.get("resolution") in ("1k", "2k", "4k"):
            from app.database import SessionLocal
            from app.models import Task
            with SessionLocal() as db:
                task = db.get(Task, self.task_id)
                paths = owned_references(db, task.user_id, payload)
            with Image.open(BytesIO(read_binary_asset(paths[0]))) as im:
                w, h = im.size
            target = {"1k": 1024, "2k": 2048, "4k": 4096}[payload["resolution"]]
            factor = min(target / max(w, h), (target * target / (w * h)) ** .5)
            payload = {**payload, "width": max(256, round(w * factor / 8) * 8), "height": max(256, round(h * factor / 8) * 8)}
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
        if prior == owner:
            # Only the durable dispatcher with a live lease may resume an owner.
            from app.database import SessionLocal
            from app.models import TaskDispatch
            from datetime import datetime, timezone
            with SessionLocal() as db:
                job = db.get(TaskDispatch, self.task_id)
                until = job.lease_until if job else None
                if until and until.tzinfo is None:
                    until = until.replace(tzinfo=timezone.utc)
                if not job or job.state != "leased" or not until or until <= datetime.now(timezone.utc):
                    raise ValueError("ComfyUI resume requires an active execution lease")
        elif prior is not None or not redis.set(GPU_LOCK, owner, nx=True):
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
                            if monotonic() >= deadline:
                                raise TimeoutError("ComfyUI response exceeded time budget")
                            if len(data) + len(chunk) > limit:
                                raise ValueError("ComfyUI response exceeded size budget")
                            data.extend(chunk)
                        return bytes(data)

                prompt_id = self.state.get("prompt_id")
                if self.state.get("stage") in ("submitting", "submitted") and not prompt_id:
                    safe_release = False
                    queue = json.loads(request("GET", "/queue"))
                    history = json.loads(request("GET", "/history", params={"max_items": 200}))
                    candidates = list(queue.get("queue_running", [])) + list(queue.get("queue_pending", []))
                    candidates += [v.get("prompt", []) for v in history.values()]
                    matches = {str(item[1]) for item in candidates if len(item) > 3 and
                               isinstance(item[3], dict) and item[3].get("client_id") == self.state.get("client_id")}
                    if len(matches) != 1:
                        raise ValueError("ComfyUI submission uncertain; retained for reconciliation, never resubmitted")
                    prompt_id = str(UUID(matches.pop()))
                    self._save(stage="submitted", prompt_id=prompt_id)
                if not prompt_id:
                    # Connectivity check is read-only and happens before submit intent.
                    json.loads(request("GET", "/system_stats"))
                    if capability == "image.edit":
                        from app.database import SessionLocal
                        from app.models import Task
                        with SessionLocal() as db:
                            task = db.get(Task, self.task_id)
                            paths = owned_references(db, task.user_id, payload)
                        for index, (node, path) in enumerate(zip(mapping["image_loaders"], paths)):
                            uploaded = json.loads(request("POST", "/upload/image", files={"image":
                                (f"qmdh_{self.task_id}_{index}.png", read_binary_asset(path), "application/octet-stream")},
                                data={"type": "input", "overwrite": "false", "subfolder": f"qmdh/{self.task_id}"}))
                            name, folder = uploaded.get("name"), uploaded.get("subfolder", "")
                            if not isinstance(name, str) or not name or "/" in name or "\\" in name or ":" in name or name in (".", "..") or ".." in PurePosixPath(folder).parts or PurePosixPath(folder).is_absolute() or ":" in folder or "\\" in folder:
                                raise ValueError("Unsafe ComfyUI upload reference")
                            graph[node]["inputs"]["image"] = f"{folder}/{name}" if folder else name
                    # Persist intent before POST so a lost response never triggers a
                    # second GPU run automatically. FRP/ComfyUI has no idempotency guarantee.
                    self._save(stage="submitting", seed=seed, workflow_id=self.profile.model_name,
                               workflow_sha256=mapping["sha256"], client_id=str(uuid4()))
                    safe_release = False
                    try:
                        submitted = json.loads(request("POST", "/prompt", json={"prompt": graph, "client_id": self.state["client_id"]}))
                    except httpx.HTTPStatusError as exc:
                        if exc.response.status_code == 400:
                            safe_release = True
                            self._save(stage="rejected")
                        raise
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
                            self._save(stage="upstream_failed")
                        raise
                    if ref is not None:
                        safe_release = True  # Upstream execution is confirmed terminal.
                        self._save(stage="downloading", output=ref, upstream_terminal=True)
                        image = request("GET", "/view", params=ref, limit=MAX_IMAGE_BYTES)
                        try:
                            with Image.open(BytesIO(image)) as im:
                                if im.format not in ("PNG", "JPEG", "WEBP") or im.width * im.height > MAX_PIXELS:
                                    raise ValueError("ComfyUI output is not an approved image")
                                width, height = im.size
                                extension = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}[im.format]
                                im.verify()
                        except (UnidentifiedImageError, OSError, SyntaxError) as exc:
                            raise ValueError("ComfyUI returned an invalid image") from exc
                        storage = write_binary_asset(f"generated/comfyui/task-{self.task_id}/{prompt_id}.{extension}", image)
                        self._save(stage="downloaded", storage_path=storage, output_sha256=hashlib.sha256(image).hexdigest())
                        elapsed_ms = max(1, round((monotonic() - started) * 1000))
                        return ExecutionOutcome(self.profile.model_name, elapsed_ms,
                                                0.0, self.profile.pricing_currency, True, {
                            "summary": "ComfyUI image saved to QMDH storage", "adapter_mode": "comfyui", "elapsed_ms": elapsed_ms,
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
