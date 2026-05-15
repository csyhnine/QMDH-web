from __future__ import annotations

import json
import mimetypes
from base64 import b64encode
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from random import randint
from time import perf_counter, sleep
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from redis import Redis
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import ImageProviderProfile, settings
from app.database import SessionLocal
from app.models import Asset, AssetType, Project, ProviderCall, Task, TaskStatus, Workflow
from app.services.media_storage import (
    media_root_path,
    write_base64_asset,
    write_binary_asset,
    write_preview_svg,
)
from app.services.model_registry import ProviderDefinition, get_image_provider_profile, get_provider_definition

WHITE_CANVAS_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yh3cAAAAASUVORK5CYII="
)


@dataclass(frozen=True)
class ExecutionOutcome:
    model_name: str
    latency_ms: int
    cost: float
    cost_currency: str
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
            "image.generate": 0.0,
            "image.edit": 0.0,
            "document.generate": 0.0,
            "text.generate": 0.0,
            "video.generate": 0.0,
        }
        latency_ms = base_latency.get(capability, 3_000)
        cost = round(base_cost.get(capability, 0.0), 2)
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
            "billing": {
                "cost": cost,
                "currency": "CNY",
                "pricing_unit": "simulated",
                "unit_price": 0.0,
                "billable_units": 0,
                "source": "simulated_unpriced",
            },
        }
        return ExecutionOutcome(
            model_name=self.definition.model_name,
            latency_ms=latency_ms,
            cost=cost,
            cost_currency="CNY",
            outbound=self.definition.outbound,
            result=result,
        )


class OpenAIImageProviderAdapter(ProviderAdapter):
    def __init__(self, definition: ProviderDefinition, profile: ImageProviderProfile):
        super().__init__(definition)
        self.profile = profile

    def execute(self, capability: str, payload: dict) -> ExecutionOutcome:
        if capability not in {"image.generate", "image.edit"}:
            raise ValueError(f"{self.definition.provider_name} does not support {capability}")

        prompt = str(payload.get("prompt") or payload.get("edit_prompt") or "").strip()
        if not prompt:
            raise ValueError("Image task payload is missing prompt")

        requested_count = _requested_image_count(payload)
        reference_result: dict[str, object] = {}
        prompt_for_generation = prompt
        reference_image = _extract_reference_image(payload)
        image_edit_bridge_url = ""
        if capability == "image.edit":
            image_edit_bridge_url, reference_result = _build_image_edit_bridge_request(
                profile=self.profile,
                reference_image=reference_image,
            )
        elif _uses_image_edit_bridge(self.profile):
            image_edit_bridge_url, reference_result = _build_image_edit_bridge_request(
                profile=self.profile,
                reference_image=reference_image,
            )
        elif reference_image:
            prompt_for_generation, reference_result = _apply_reference_image_to_prompt(
                profile=self.profile,
                prompt=prompt,
                reference_image=reference_image,
            )

        request_body = {
            "model": self.profile.model_name,
            "prompt": prompt_for_generation,
            "size": _openai_size_for_payload(payload),
            "quality": self.profile.quality,
            "output_format": self.profile.output_format,
        }
        if image_edit_bridge_url:
            request_body["image_url"] = image_edit_bridge_url

        detail = payload.get("prompt_supplement")
        if detail:
            request_body["prompt"] = f"{prompt_for_generation}\n\nAdditional guidance: {detail}"

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
                data = _extract_image_data(response_payload)
                if not data:
                    data = _poll_modelscope_image_result(self.profile, response_payload)
            else:
                data = _extract_image_data(response_payload)

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
                        timeout_seconds=self.profile.timeout_seconds,
                    )
                )
                if len(storage_paths) >= requested_count:
                    break

        latency_ms = max(1, round((perf_counter() - started_at) * 1000))
        billing = _calculate_image_billing(profile=self.profile, output_count=len(storage_paths))
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
            "billing": billing,
            **reference_result,
        }

        return ExecutionOutcome(
            model_name=self.profile.model_name,
            latency_ms=latency_ms,
            cost=billing["cost"],
            cost_currency=billing["currency"],
            outbound=self.definition.outbound,
            result=result,
        )


def _calculate_image_billing(*, profile: ImageProviderProfile, output_count: int) -> dict:
    unit_price = round(float(profile.unit_price or 0.0), 6)
    pricing_unit = (profile.pricing_unit or "per_image").strip() or "per_image"
    currency = (profile.pricing_currency or "CNY").strip().upper() or "CNY"
    billable_units = output_count if pricing_unit == "per_image" else 1
    if pricing_unit not in {"per_image", "per_request"}:
        pricing_unit = "per_image"
        billable_units = output_count
    cost = round(unit_price * billable_units, 4)
    return {
        "cost": cost,
        "currency": currency,
        "pricing_unit": pricing_unit,
        "unit_price": unit_price,
        "billable_units": billable_units,
        "source": "provider_profile",
    }


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


def get_provider_adapter(provider_name: str, db: Session | None = None) -> ProviderAdapter:
    definition = get_provider_definition(provider_name, db)
    if definition.adapter_kind == "openai_compatible":
        return OpenAIImageProviderAdapter(definition, get_image_provider_profile(provider_name, db))
    return SimulatedProviderAdapter(definition)


def _extract_reference_image(payload: dict) -> str:
    for key in ("reference_image", "source_image", "image"):
        value = str(payload.get(key) or "").strip()
        if value:
            return value
    return ""


def _uses_image_edit_bridge(profile: ImageProviderProfile) -> bool:
    identity = f"{profile.provider_name} {profile.model_name}".lower()
    return "firered" in identity or "image-edit" in identity


def _build_image_edit_bridge_request(
    *, profile: ImageProviderProfile, reference_image: str
) -> tuple[str, dict[str, object]]:
    if reference_image:
        return _reference_image_to_model_url(reference_image), {
            "reference_image_used": True,
            "reference_image_mode": "image_edit_bridge",
            "image_edit_bridge_used": True,
            "image_edit_bridge_mode": "reference_image",
            "image_edit_bridge_provider": profile.provider_name,
        }

    return WHITE_CANVAS_DATA_URL, {
        "reference_image_used": False,
        "reference_image_mode": "image_edit_bridge",
        "image_edit_bridge_used": True,
        "image_edit_bridge_mode": "white_canvas",
        "image_edit_bridge_provider": profile.provider_name,
    }


def _apply_reference_image_to_prompt(
    *, profile: ImageProviderProfile, prompt: str, reference_image: str
) -> tuple[str, dict[str, object]]:
    reference_mode = profile.reference_mode.strip().lower()
    if reference_mode in {"", "disabled", "none", "off"}:
        return prompt, {
            "reference_image_used": False,
            "reference_image_mode": "disabled",
            "reference_image_warning": "Reference image was uploaded but this provider profile has reference_mode disabled.",
        }

    if reference_mode != "caption_prompt":
        raise ValueError(
            f"Unsupported reference_mode for {profile.provider_name}: {profile.reference_mode}. "
            "Use caption_prompt or disabled."
        )

    caption_models = _reference_caption_model_candidates(profile)
    if not caption_models:
        raise ValueError(
            f"{profile.provider_name} reference_mode=caption_prompt requires reference_caption_model"
        )

    reference_caption = ""
    used_caption_model = ""
    caption_errors: list[str] = []
    for caption_model in caption_models:
        try:
            reference_caption = _caption_reference_image(
                profile=profile,
                model_name=caption_model,
                reference_image=reference_image,
                user_prompt=prompt,
            )
            used_caption_model = caption_model
            break
        except ValueError as exc:
            caption_errors.append(f"{caption_model}: {exc}")

    if not reference_caption:
        return prompt, {
            "reference_image_used": False,
            "reference_image_mode": "caption_prompt",
            "reference_image_warning": (
                "Reference image caption failed, so the task fell back to text-only generation. "
                + " | ".join(caption_errors)
            ),
        }

    enriched_prompt = (
        f"{prompt}\n\n"
        "Use the following reference image analysis as visual guidance. "
        "Keep the user's text prompt as the primary objective, and borrow only relevant visual structure, "
        "style, material, lighting, and composition cues from the reference.\n"
        f"Reference image analysis: {reference_caption}"
    )
    return enriched_prompt, {
        "reference_image_used": True,
        "reference_image_mode": "caption_prompt",
        "reference_caption_model": used_caption_model,
        "reference_caption": reference_caption,
    }


def _reference_caption_model_candidates(profile: ImageProviderProfile) -> list[str]:
    candidates = [
        profile.reference_caption_model or _default_reference_caption_model(profile),
        *profile.reference_caption_fallback_models,
    ]
    return list(dict.fromkeys(candidate for candidate in candidates if candidate))


def _default_reference_caption_model(profile: ImageProviderProfile) -> str:
    if "modelscope.cn" in profile.base_url:
        return "Qwen/Qwen3-VL-8B-Instruct"
    return ""


def _caption_reference_image(
    *, profile: ImageProviderProfile, model_name: str, reference_image: str, user_prompt: str
) -> str:
    request_body = {
        "model": model_name,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            f"{profile.reference_caption_prompt}\n\n"
                            f"User image-generation prompt: {user_prompt}"
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": _reference_image_to_model_url(reference_image)},
                    },
                ],
            }
        ],
        "max_tokens": 420,
        "temperature": 0.2,
    }
    headers = {
        "Authorization": f"Bearer {profile.api_key}",
        "Content-Type": "application/json",
    }
    request = Request(
        url=f"{profile.base_url.rstrip('/')}/chat/completions",
        data=json.dumps(request_body).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urlopen(request, timeout=profile.timeout_seconds) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise ValueError(f"Reference image caption failed with HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise ValueError(f"Reference image caption request failed: {exc.reason}") from exc

    caption = _extract_chat_message_content(response_payload)
    if not caption:
        raise ValueError(f"Reference image caption returned no text: {response_payload}")
    return caption


def _reference_image_to_model_url(reference_image: str) -> str:
    normalized = reference_image.strip()
    if normalized.startswith(("http://", "https://", "data:image/")):
        return normalized

    media_prefix = settings.media_url_prefix.rstrip("/")
    if normalized.startswith(f"{media_prefix}/"):
        relative_path = normalized.removeprefix(f"{media_prefix}/")
    else:
        relative_path = normalized.lstrip("/")

    media_root = media_root_path().resolve()
    file_path = (media_root / Path(relative_path)).resolve()
    if media_root not in file_path.parents and file_path != media_root:
        raise ValueError("Reference image path is outside media storage")
    if not file_path.exists() or not file_path.is_file():
        raise ValueError(f"Reference image file not found: {reference_image}")

    mime_type = mimetypes.guess_type(file_path.name)[0] or "image/png"
    encoded = b64encode(file_path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _extract_chat_message_content(response_payload: dict) -> str:
    choices = response_payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""

    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(message, dict):
        return ""

    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "\n".join(part.strip() for part in parts if part.strip())
    return ""


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


def _extension_for_downloaded_image(image_url: str, content_type: str | None, fallback: str) -> str:
    if content_type:
        guessed = mimetypes.guess_extension(content_type.split(";", 1)[0].strip().lower(), strict=False)
        if guessed:
            extension = guessed.lstrip(".")
            return "jpeg" if extension == "jpg" else extension

    suffix = Path(urlparse(image_url).path).suffix.lower().lstrip(".")
    if suffix:
        return "jpeg" if suffix == "jpg" else suffix

    normalized = fallback.lower().strip() or "png"
    return "jpeg" if normalized == "jpg" else normalized


def _download_generated_image(image_url: str, *, timeout_seconds: float) -> tuple[bytes, str | None]:
    try:
        with urlopen(image_url, timeout=timeout_seconds) as response:
            payload = response.read()
            content_type = None
            if hasattr(response, "headers") and response.headers is not None:
                content_type = response.headers.get("Content-Type")
            return payload, content_type
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise ValueError(f"Generated image download failed with HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise ValueError(f"Generated image download failed: {exc.reason}") from exc


def _persist_generated_image(
    *,
    provider_name: str,
    image_payload: dict,
    prompt: str,
    output_format: str,
    timeout_seconds: float,
) -> str:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_stub = "".join(char if char.isalnum() else "-" for char in prompt.lower())[:40].strip("-") or "image"

    if image_url := image_payload.get("url"):
        image_bytes, content_type = _download_generated_image(str(image_url), timeout_seconds=timeout_seconds)
        extension = _extension_for_downloaded_image(str(image_url), content_type, output_format)
        relative_path = f"generated/{provider_name}/{timestamp}-{safe_stub}-{randint(1000, 9999)}.{extension}"
        return write_binary_asset(relative_path, image_bytes)

    b64_json = image_payload.get("b64_json")
    if not b64_json:
        raise ValueError("Image generation response did not include url or b64_json")

    extension = output_format.lower().strip() or "png"
    if extension == "jpg":
        extension = "jpeg"

    relative_path = f"generated/{provider_name}/{timestamp}-{safe_stub}-{randint(1000, 9999)}.{extension}"
    return write_base64_asset(relative_path, str(b64_json))


def _uses_modelscope_async_mode(profile: ImageProviderProfile) -> bool:
    return "modelscope.cn" in profile.base_url


def _extract_image_data(payload: dict) -> list[dict]:
    if data := payload.get("data"):
        return _normalize_image_candidates(data)

    outputs = payload.get("outputs")
    if isinstance(outputs, dict):
        for key in ("images", "output_images", "image_urls"):
            if candidates := outputs.get(key):
                return _normalize_image_candidates(candidates)

    for key in ("images", "output_images", "image_urls"):
        if candidates := payload.get(key):
            return _normalize_image_candidates(candidates)

    return []


def _normalize_image_candidates(candidates: object) -> list[dict]:
    if not isinstance(candidates, list):
        return []

    normalized: list[dict] = []
    for item in candidates:
        if isinstance(item, str):
            normalized.append({"url": item})
        elif isinstance(item, dict):
            normalized.append(item)
    return normalized


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
            normalized = _extract_image_data(last_payload)
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
            adapter = get_provider_adapter(task.requested_provider, db)
            outcome = adapter.execute(workflow.provider_capability, task.payload)
            task.status = TaskStatus.completed
            task.latency_ms = outcome.latency_ms
            task.cost = outcome.cost
            task.cost_currency = outcome.cost_currency
            task.result = outcome.result

            db.add(
                ProviderCall(
                    task_id=task.id,
                    provider_name=task.requested_provider,
                    model_name=outcome.model_name,
                    capability=workflow.provider_capability,
                    cost=outcome.cost,
                    cost_currency=outcome.cost_currency,
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
