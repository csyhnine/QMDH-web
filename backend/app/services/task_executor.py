from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime
from random import randint, uniform
from time import perf_counter, sleep
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from redis import Redis
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import ImageProviderProfile, settings
from app.database import SessionLocal
from app.models import Asset, AssetType, Project, ProviderCall, Task, TaskStatus, Workflow
from app.services.media_storage import write_base64_asset, write_preview_svg
from app.services.model_registry import ProviderDefinition, get_provider_definition


@dataclass(frozen=True)
class ExecutionOutcome:
    model_name: str
    latency_ms: int
    cost: float
    outbound: bool
    result: dict


class ProviderAdapter:
    def __init__(self, definition: ProviderDefinition):
        self.definition = definition

    def execute(self, capability: str, payload: dict) -> ExecutionOutcome:
        raise NotImplementedError


class SimulatedProviderAdapter(ProviderAdapter):
    def execute(self, capability: str, payload: dict) -> ExecutionOutcome:
        base_latency = {
            "image.generate": randint(18_000, 45_000),
            "image.edit": randint(12_000, 30_000),
            "document.generate": randint(4_000, 9_000),
            "text.generate": randint(2_000, 6_000),
            "video.generate": randint(60_000, 120_000),
        }
        base_cost = {
            "image.generate": uniform(2.5, 8.5),
            "image.edit": uniform(1.8, 5.0),
            "document.generate": uniform(0.4, 2.2),
            "text.generate": uniform(0.2, 1.4),
            "video.generate": uniform(12.0, 35.0),
        }
        latency_ms = base_latency.get(capability, 3_000)
        cost = round(base_cost.get(capability, 1.0), 2)
        prompt_summary = str(payload.get("prompt") or payload.get("edit_prompt") or payload.get("deliverable") or "QMDH")
        requested_count = _requested_image_count(payload)
        preview_paths = [
            _materialize_preview_asset(
                provider_name=self.definition.provider_name,
                capability=capability,
                prompt_summary=prompt_summary,
            )
            for _ in range(requested_count)
        ]
        result = {
            "summary": f"{self.definition.provider_name} completed a simulated {capability} run.",
            "payload_keys": list(payload.keys()),
            "adapter_mode": "simulated",
            "storage_path": preview_paths[0],
            "storage_paths": preview_paths,
            "requested_image_count": requested_count,
            "output_count": len(preview_paths),
        }
        return ExecutionOutcome(
            model_name=self.definition.model_name,
            latency_ms=latency_ms,
            cost=cost,
            outbound=self.definition.outbound,
            result=result,
        )


class OpenAIImageProviderAdapter(ProviderAdapter):
    def __init__(self, definition: ProviderDefinition, profile: ImageProviderProfile):
        super().__init__(definition)
        self.profile = profile

    def execute(self, capability: str, payload: dict) -> ExecutionOutcome:
        if capability != "image.generate":
            raise ValueError(f"{self.definition.provider_name} does not support {capability}")

        prompt = str(payload.get("prompt") or "").strip()
        if not prompt:
            raise ValueError("Image generation payload is missing prompt")

        requested_count = _requested_image_count(payload)
        request_body = {
            "model": self.profile.model_name,
            "prompt": prompt,
            "size": _openai_size_for_payload(payload),
            "quality": self.profile.quality,
            "output_format": self.profile.output_format,
        }

        detail = payload.get("prompt_supplement")
        if detail:
            request_body["prompt"] = f"{prompt}\n\nAdditional guidance: {detail}"

        headers = {
            "Authorization": f"Bearer {self.profile.api_key}",
            "Content-Type": "application/json",
        }
        if _uses_modelscope_async_mode(self.profile):
            headers["X-ModelScope-Async-Mode"] = "true"

        started_at = perf_counter()
        storage_paths: list[str] = []
        usage_records: list[dict] = []
        response_models: list[str] = []

        while len(storage_paths) < requested_count:
            response_payload = _submit_image_generation_request(
                base_url=self.profile.base_url,
                body=request_body,
                headers=headers,
                timeout_seconds=self.profile.timeout_seconds,
            )

            if _uses_modelscope_async_mode(self.profile):
                data = _poll_modelscope_image_result(self.profile, response_payload)
            else:
                data = response_payload.get("data") or []

            if not data:
                raise ValueError("Image generation returned no image data")

            response_model = str(response_payload.get("model", self.profile.model_name))
            if response_model not in response_models:
                response_models.append(response_model)

            usage_payload = response_payload.get("usage")
            if isinstance(usage_payload, dict):
                usage_records.append(usage_payload)

            for item in data:
                storage_paths.append(
                    _persist_generated_image(
                        provider_name=self.definition.provider_name,
                        image_payload=item,
                        prompt=prompt,
                        output_format=self.profile.output_format,
                    )
                )
                if len(storage_paths) >= requested_count:
                    break

        latency_ms = max(1, round((perf_counter() - started_at) * 1000))
        result = {
            "summary": f"{self.definition.provider_name} completed a live {capability} run.",
            "payload_keys": list(payload.keys()),
            "adapter_mode": "modelscope_async" if _uses_modelscope_async_mode(self.profile) else "openai",
            "storage_path": storage_paths[0],
            "storage_paths": storage_paths,
            "response_model": response_models[0] if response_models else self.profile.model_name,
            "response_models": response_models,
            "usage": usage_records[-1] if usage_records else {},
            "usage_records": usage_records,
            "requested_image_count": requested_count,
            "output_count": len(storage_paths),
        }

        return ExecutionOutcome(
            model_name=self.profile.model_name,
            latency_ms=latency_ms,
            cost=0.0,
            outbound=self.definition.outbound,
            result=result,
        )


def _materialize_preview_asset(*, provider_name: str, capability: str, prompt_summary: str) -> str:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    relative_path = f"generated/{provider_name}/{capability.replace('.', '-')}-{timestamp}-{randint(1000, 9999)}.svg"
    return write_preview_svg(
        relative_path,
        title=provider_name,
        eyebrow=capability,
        detail=prompt_summary,
        accent_seed=f"{provider_name}-{capability}-{timestamp}",
    )


def get_provider_adapter(provider_name: str) -> ProviderAdapter:
    definition = get_provider_definition(provider_name)
    if definition.adapter_kind == "openai_compatible":
        return OpenAIImageProviderAdapter(definition, settings.get_image_provider_profile(provider_name))
    return SimulatedProviderAdapter(definition)


def _openai_size_for_payload(payload: dict) -> str:
    aspect_ratio = str(payload.get("aspect_ratio") or "").strip()
    mapping = {
        "1:1": "1024x1024",
        "16:9": "1536x1024",
        "4:3": "1536x1024",
        "3:2": "1536x1024",
        "2:3": "1024x1536",
        "9:16": "1024x1536",
    }
    return mapping.get(aspect_ratio, "auto")


def _requested_image_count(payload: dict) -> int:
    raw_value = payload.get("image_count", 1)
    try:
        count = int(raw_value)
    except (TypeError, ValueError):
        count = 1
    return max(1, min(4, count))


def _submit_image_generation_request(*, base_url: str, body: dict, headers: dict[str, str], timeout_seconds: float) -> dict:
    request = Request(
        url=f"{base_url.rstrip('/')}/images/generations",
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise ValueError(f"Image generation failed with HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise ValueError(f"Image generation request failed: {exc.reason}") from exc


def _persist_generated_image(*, provider_name: str, image_payload: dict, prompt: str, output_format: str) -> str:
    if image_url := image_payload.get("url"):
        return str(image_url)

    b64_json = image_payload.get("b64_json")
    if not b64_json:
        raise ValueError("Image generation response did not include url or b64_json")

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    extension = output_format.lower().strip() or "png"
    if extension == "jpg":
        extension = "jpeg"

    safe_stub = "".join(char if char.isalnum() else "-" for char in prompt.lower())[:40].strip("-") or "image"
    relative_path = f"generated/{provider_name}/{timestamp}-{safe_stub}-{randint(1000, 9999)}.{extension}"
    return write_base64_asset(relative_path, str(b64_json))


def _uses_modelscope_async_mode(profile: ImageProviderProfile) -> bool:
    return "modelscope.cn" in profile.base_url


def _poll_modelscope_image_result(profile: ImageProviderProfile, submit_payload: dict) -> list[dict]:
    task_id = str(submit_payload.get("task_id") or "").strip()
    if not task_id:
        raise ValueError(f"{profile.provider_name} did not return a task_id for async image generation")

    deadline = perf_counter() + max(profile.timeout_seconds, 180.0)
    last_payload: dict[str, object] = submit_payload

    while perf_counter() < deadline:
        poll_request = Request(
            url=f"{profile.base_url.rstrip('/')}/tasks/{task_id}",
            headers={
                "Authorization": f"Bearer {profile.api_key}",
                "X-ModelScope-Task-Type": "image_generation",
            },
            method="GET",
        )

        try:
            with urlopen(poll_request, timeout=profile.timeout_seconds) as response:
                last_payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise ValueError(f"ModelScope async poll failed with HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise ValueError(f"ModelScope async poll request failed: {exc.reason}") from exc

        task_status = str(last_payload.get("task_status") or "").upper()
        if task_status == "SUCCEED":
            image_candidates = []
            outputs = last_payload.get("outputs") or {}
            if isinstance(outputs, dict):
                image_candidates = outputs.get("images") or outputs.get("output_images") or outputs.get("image_urls") or []
            if not image_candidates:
                image_candidates = (
                    last_payload.get("output_images")
                    or last_payload.get("images")
                    or last_payload.get("image_urls")
                    or []
                )

            normalized: list[dict] = []
            if isinstance(image_candidates, list):
                for item in image_candidates:
                    if isinstance(item, str):
                        normalized.append({"url": item})
                    elif isinstance(item, dict):
                        normalized.append(item)
            if normalized:
                return normalized
            raise ValueError(f"ModelScope async task succeeded but returned no image outputs: {last_payload}")

        if task_status == "FAILED":
            raise ValueError(f"ModelScope async task failed: {last_payload}")

        sleep(5)

    raise ValueError(f"ModelScope async task timed out before completion: {last_payload}")


def _asset_type_for_capability(capability: str) -> AssetType | None:
    mapping = {
        "image.generate": AssetType.image,
        "image.edit": AssetType.image,
        "video.generate": AssetType.video,
    }
    return mapping.get(capability)


def _build_asset_tags(task: Task, workflow: Workflow) -> list[str]:
    tags = [workflow.category, workflow.key, task.requested_provider, task.classification.value]
    if style := task.payload.get("style"):
        tags.append(str(style))
    if deliverable := task.payload.get("deliverable"):
        tags.append(str(deliverable))
    return list(dict.fromkeys(tag.strip() for tag in tags if str(tag).strip()))


def _build_asset_name(task: Task, workflow: Workflow, index: int, total: int) -> str:
    prefix = "generated" if workflow.provider_capability == "image.generate" else "edited"
    if workflow.provider_capability == "video.generate":
        prefix = "video"
    suffix = f" #{index}" if total > 1 else ""
    return f"{task.title} / {prefix}{suffix}"


def _materialize_assets(db: Session, task: Task, workflow: Workflow, project: Project) -> list[Asset]:
    asset_type = _asset_type_for_capability(workflow.provider_capability)
    if not asset_type:
        return []

    existing = list(db.scalars(select(Asset).where(Asset.source_task_id == task.id).order_by(Asset.id.asc())).all())
    if existing:
        return existing

    storage_paths_raw = task.result.get("storage_paths")
    if isinstance(storage_paths_raw, list):
        storage_paths = [str(path) for path in storage_paths_raw if str(path).strip()]
    else:
        single_path = task.result.get("storage_path")
        storage_paths = [str(single_path)] if single_path else []

    if not storage_paths:
        return []

    prompt_text = (
        task.payload.get("prompt")
        or task.payload.get("edit_prompt")
        or task.payload.get("prompt_supplement")
        or task.result.get("summary")
    )

    tags = _build_asset_tags(task, workflow)
    prompt_value = str(prompt_text) if prompt_text else None
    total = len(storage_paths)
    assets: list[Asset] = []

    for index, storage_path in enumerate(storage_paths, start=1):
        asset = Asset(
            name=_build_asset_name(task, workflow, index, total),
            asset_type=asset_type,
            project_id=project.id,
            source_task_id=task.id,
            storage_path=storage_path,
            prompt_text=prompt_value,
            tags=tags,
        )
        db.add(asset)
        db.flush()
        assets.append(asset)

    return assets


def execute_task(task_id: int) -> None:
    with SessionLocal() as db:
        task = db.get(Task, task_id)
        if not task:
            return

        workflow = db.scalar(select(Workflow).where(Workflow.id == task.workflow_id))
        project = db.scalar(select(Project).where(Project.id == task.project_id))
        if not workflow or not project:
            task.status = TaskStatus.failed
            task.result = {"error": "Task dependencies not found"}
            db.commit()
            return

        task.status = TaskStatus.running
        db.commit()

        try:
            adapter = get_provider_adapter(task.requested_provider)
            outcome = adapter.execute(workflow.provider_capability, task.payload)
            task.status = TaskStatus.completed
            task.latency_ms = outcome.latency_ms
            task.cost = outcome.cost
            task.result = outcome.result

            db.add(
                ProviderCall(
                    task_id=task.id,
                    provider_name=task.requested_provider,
                    model_name=outcome.model_name,
                    capability=workflow.provider_capability,
                    cost=outcome.cost,
                    latency_ms=outcome.latency_ms,
                    outbound=outcome.outbound,
                    request_summary={
                        "classification": task.classification.value,
                        "project_code": project.code,
                        "keys": list(task.payload.keys()),
                        "execution": asdict(outcome),
                    },
                )
            )

            try:
                assets = _materialize_assets(db, task, workflow, project)
                if assets:
                    task.result = {
                        **task.result,
                        "asset_id": assets[0].id,
                        "asset_storage_path": assets[0].storage_path,
                        "asset_ids": [asset.id for asset in assets],
                        "asset_storage_paths": [asset.storage_path for asset in assets],
                    }
            except Exception as asset_exc:
                task.result = {
                    **task.result,
                    "asset_warning": f"Asset materialization skipped: {asset_exc}",
                }
        except Exception as exc:
            task.status = TaskStatus.failed
            task.result = {"error": str(exc)}

        db.commit()


def enqueue_task(task_id: int) -> None:
    client = Redis.from_url(settings.redis_url, decode_responses=True)
    client.lpush(settings.redis_queue_name, str(task_id))
