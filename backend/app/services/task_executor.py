from __future__ import annotations

import json
import logging
import mimetypes
import re
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
from app.services.provider_strategy import (
    CHAT_MODALITIES_IMAGE_EDIT_STRATEGY,
    CHAT_MODALITIES_IMAGE_STRATEGY,
    OPENAI_IMAGE_EDITS_STRATEGY,
    OPENAI_IMAGES_STRATEGY,
    resolve_strategy_for_capability,
)
from app.services.usage_ledger import ensure_usage_ledger_for_task

WHITE_CANVAS_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yh3cAAAAASUVORK5CYII="
)

logger = logging.getLogger(__name__)

_HTTP_FAILURE_PATTERN = re.compile(r"^(?P<stage>.+?) failed with HTTP (?P<status>\d+): (?P<detail>.*)$", re.IGNORECASE | re.DOTALL)
_REQUEST_FAILURE_PATTERN = re.compile(r"^(?P<stage>.+?) request failed: (?P<detail>.*)$", re.IGNORECASE | re.DOTALL)
_HTML_ERROR_PATTERN = re.compile(r"<!doctype html|<html\b", re.IGNORECASE)


@dataclass(frozen=True)
class ExecutionOutcome:
    model_name: str
    latency_ms: int
    cost: float
    cost_currency: str
    outbound: bool
    result: dict


@dataclass(frozen=True)
class ImageRequestPlan:
    endpoint_path: str
    body: dict
    headers: dict[str, str]
    reference_result: dict[str, object]
    adapter_mode: str
    effective_capability: str
    strategy: str


@dataclass(frozen=True)
class RequestDiagnostics:
    strategy: str
    endpoint_path: str
    request_url: str
    timeout_seconds: float
    adapter_mode: str
    effective_capability: str


class ProviderExecutionError(Exception):
    def __init__(self, message: str, *, diagnostics: RequestDiagnostics):
        super().__init__(message)
        self.diagnostics = diagnostics


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
        request_plan = _build_image_request_plan(
            profile=self.profile,
            definition=self.definition,
            capability=capability,
            payload=payload,
            prompt=prompt,
        )
        diagnostics = _request_diagnostics_for_plan(self.profile, request_plan)

        try:
            started_at = perf_counter()
            storage_paths: list[str] = []
            usage_records: list[dict] = []
            response_models: list[str] = []

            while len(storage_paths) < requested_count:
                response_payload = _submit_image_generation_request(
                    base_url=self.profile.base_url,
                    body=request_plan.body,
                    headers=request_plan.headers,
                    timeout_seconds=self.profile.timeout_seconds,
                    endpoint_path=request_plan.endpoint_path,
                )

                if _uses_modelscope_async_mode(self.profile) and request_plan.endpoint_path.startswith("/images/"):
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
                "adapter_mode": request_plan.adapter_mode,
                "storage_path": storage_paths[0],
                "storage_paths": storage_paths,
                "response_model": response_models[0] if response_models else self.profile.model_name,
                "response_models": response_models,
                "usage": usage_records[-1] if usage_records else {},
                "usage_records": usage_records,
                "requested_image_count": requested_count,
                "output_count": len(storage_paths),
                "billing": billing,
                **_request_diagnostics_payload(diagnostics),
                **request_plan.reference_result,
            }

            return ExecutionOutcome(
                model_name=self.profile.model_name,
                latency_ms=latency_ms,
                cost=billing["cost"],
                cost_currency=billing["currency"],
                outbound=self.definition.outbound,
                result=result,
            )
        except Exception as exc:
            raise ProviderExecutionError(str(exc), diagnostics=diagnostics) from exc


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


def _request_diagnostics_for_plan(profile: ImageProviderProfile, plan: ImageRequestPlan) -> RequestDiagnostics:
    return RequestDiagnostics(
        strategy=plan.strategy,
        endpoint_path=plan.endpoint_path,
        request_url=f"{profile.base_url.rstrip('/')}{plan.endpoint_path}",
        timeout_seconds=float(profile.timeout_seconds),
        adapter_mode=plan.adapter_mode,
        effective_capability=plan.effective_capability,
    )


def _request_diagnostics_payload(diagnostics: RequestDiagnostics) -> dict[str, object]:
    return {
        "request_strategy": diagnostics.strategy,
        "request_endpoint": diagnostics.endpoint_path,
        "request_url": diagnostics.request_url,
        "request_timeout_seconds": diagnostics.timeout_seconds,
        "request_adapter_mode": diagnostics.adapter_mode,
        "effective_capability": diagnostics.effective_capability,
    }


def _build_image_request_plan(
    *,
    profile: ImageProviderProfile,
    definition: ProviderDefinition,
    capability: str,
    payload: dict,
    prompt: str,
) -> ImageRequestPlan:
    requested_strategy = resolve_strategy_for_capability(
        capability=capability,
        provider_name=profile.provider_name,
        model_name=profile.model_name,
        base_url=profile.base_url,
        strategies=profile.strategies,
    )
    if not requested_strategy:
        raise ValueError(f"{profile.provider_name} does not define a request strategy for {capability}")

    reference_images = _extract_reference_images(payload)
    effective_capability = capability
    strategy = requested_strategy

    if (
        capability == "image.generate"
        and reference_images
        and "image.edit" in definition.capabilities
    ):
        edit_strategy = resolve_strategy_for_capability(
            capability="image.edit",
            provider_name=profile.provider_name,
            model_name=profile.model_name,
            base_url=profile.base_url,
            strategies=profile.strategies,
        )
        if edit_strategy in {OPENAI_IMAGE_EDITS_STRATEGY, CHAT_MODALITIES_IMAGE_EDIT_STRATEGY}:
            effective_capability = "image.edit"
            strategy = edit_strategy

    if strategy == OPENAI_IMAGES_STRATEGY:
        return _build_openai_images_plan(
            profile=profile,
            requested_capability=capability,
            effective_capability=effective_capability,
            payload=payload,
            prompt=prompt,
        )
    if strategy == OPENAI_IMAGE_EDITS_STRATEGY:
        return _build_openai_image_edits_plan(
            profile=profile,
            requested_capability=capability,
            effective_capability=effective_capability,
            payload=payload,
            prompt=prompt,
        )
    if strategy == CHAT_MODALITIES_IMAGE_STRATEGY:
        return _build_chat_modalities_image_plan(
            profile=profile,
            requested_capability=capability,
            payload=payload,
            prompt=prompt,
        )
    if strategy == CHAT_MODALITIES_IMAGE_EDIT_STRATEGY:
        return _build_chat_modalities_image_edit_plan(
            profile=profile,
            requested_capability=capability,
            effective_capability=effective_capability,
            payload=payload,
            prompt=prompt,
        )

    raise ValueError(f"Unsupported request strategy for {profile.provider_name}: {strategy}")


def _build_openai_headers(profile: ImageProviderProfile, *, async_images: bool = False) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {profile.api_key}",
        "Content-Type": "application/json",
    }
    if async_images and _uses_modelscope_async_mode(profile):
        headers["X-ModelScope-Async-Mode"] = "true"
    return headers


def _openai_image_request_body(
    *,
    profile: ImageProviderProfile,
    payload: dict,
    prompt: str,
) -> dict[str, object]:
    body: dict[str, object] = {
        "model": profile.model_name,
        "prompt": prompt,
        "size": _openai_size_for_payload(payload),
        "quality": profile.quality,
        "output_format": profile.output_format,
    }
    detail = str(payload.get("prompt_supplement") or "").strip()
    if detail:
        body["prompt"] = f"{prompt}\n\nAdditional guidance: {detail}"
    return body


def _build_openai_images_plan(
    *,
    profile: ImageProviderProfile,
    requested_capability: str,
    effective_capability: str,
    payload: dict,
    prompt: str,
) -> ImageRequestPlan:
    reference_images = _extract_reference_images(payload)
    reference_image = reference_images[0] if reference_images else ""
    prompt_for_generation = prompt
    reference_result: dict[str, object] = {}
    image_edit_bridge_url = ""

    if effective_capability == "image.edit":
        if _uses_image_edit_bridge(profile):
            image_edit_bridge_url, reference_result = _build_image_edit_bridge_request(
                profile=profile,
                reference_image=reference_image,
            )
        elif reference_image:
            prompt_for_generation, reference_result = _apply_reference_image_to_prompt(
                profile=profile,
                prompt=prompt,
                reference_image=reference_image,
            )
        else:
            raise ValueError("Image edit task requires a reference image for this provider profile")
    elif _uses_image_edit_bridge(profile):
        image_edit_bridge_url, reference_result = _build_image_edit_bridge_request(
            profile=profile,
            reference_image=reference_image,
        )
    elif reference_image:
        prompt_for_generation, reference_result = _apply_reference_image_to_prompt(
            profile=profile,
            prompt=prompt,
            reference_image=reference_image,
        )

    body = _openai_image_request_body(profile=profile, payload=payload, prompt=prompt_for_generation)
    if image_edit_bridge_url:
        body["image_url"] = image_edit_bridge_url

    return ImageRequestPlan(
        endpoint_path="/images/generations",
        body=body,
        headers=_build_openai_headers(profile, async_images=True),
        reference_result=reference_result,
        adapter_mode="modelscope_async" if _uses_modelscope_async_mode(profile) else "openai",
        effective_capability=effective_capability,
        strategy=OPENAI_IMAGES_STRATEGY,
    )


def _build_openai_image_edits_plan(
    *,
    profile: ImageProviderProfile,
    requested_capability: str,
    effective_capability: str,
    payload: dict,
    prompt: str,
) -> ImageRequestPlan:
    reference_images = _extract_reference_images(payload)
    if not reference_images:
        raise ValueError("Image edit task requires a reference image for this provider profile")

    body = _openai_image_request_body(profile=profile, payload=payload, prompt=prompt)
    body["images"] = [{"image_url": _reference_image_to_model_url(item)} for item in reference_images]

    reference_result: dict[str, object] = {
        "reference_image_used": True,
        "reference_image_mode": "native_image_edit",
        "reference_image_count": len(reference_images),
        "native_image_edit_used": True,
        "native_image_edit_endpoint": "images.edits",
        "native_image_edit_provider": profile.provider_name,
    }
    if requested_capability != effective_capability:
        reference_result["native_image_edit_fallback_from"] = requested_capability

    return ImageRequestPlan(
        endpoint_path="/images/edits",
        body=body,
        headers=_build_openai_headers(profile, async_images=True),
        reference_result=reference_result,
        adapter_mode="modelscope_async" if _uses_modelscope_async_mode(profile) else "openai",
        effective_capability=effective_capability,
        strategy=OPENAI_IMAGE_EDITS_STRATEGY,
    )


def _build_chat_modalities_image_plan(
    *,
    profile: ImageProviderProfile,
    requested_capability: str,
    payload: dict,
    prompt: str,
) -> ImageRequestPlan:
    content = prompt
    detail = str(payload.get("prompt_supplement") or "").strip()
    if detail:
        content = f"{prompt}\n\nAdditional guidance: {detail}"
    body = {
        "model": profile.model_name,
        "messages": [{"role": "user", "content": content}],
        "modalities": ["image", "text"],
        "image_config": {"aspect_ratio": str(payload.get("aspect_ratio") or "1:1").strip() or "1:1"},
        "stream": False,
    }
    return ImageRequestPlan(
        endpoint_path="/chat/completions",
        body=body,
        headers=_build_openai_headers(profile),
        reference_result={},
        adapter_mode="chat_modalities_image",
        effective_capability="image.generate",
        strategy=CHAT_MODALITIES_IMAGE_STRATEGY,
    )


def _build_chat_modalities_image_edit_plan(
    *,
    profile: ImageProviderProfile,
    requested_capability: str,
    effective_capability: str,
    payload: dict,
    prompt: str,
) -> ImageRequestPlan:
    reference_images = _extract_reference_images(payload)
    if not reference_images:
        raise ValueError("Image edit task requires a reference image for this provider profile")

    detail = str(payload.get("prompt_supplement") or "").strip()
    text_prompt = f"{prompt}\n\nAdditional guidance: {detail}" if detail else prompt
    content: list[dict[str, object]] = [{"type": "text", "text": text_prompt}]
    for item in reference_images:
        content.append({"type": "image_url", "image_url": {"url": _reference_image_to_model_url(item)}})

    reference_result: dict[str, object] = {
        "reference_image_used": True,
        "reference_image_mode": "chat_modalities_image_edit",
        "reference_image_count": len(reference_images),
    }
    if requested_capability != effective_capability:
        reference_result["chat_modalities_image_edit_fallback_from"] = requested_capability

    body = {
        "model": profile.model_name,
        "messages": [{"role": "user", "content": content}],
        "modalities": ["image", "text"],
        "image_config": {"aspect_ratio": str(payload.get("aspect_ratio") or "1:1").strip() or "1:1"},
        "stream": False,
    }
    return ImageRequestPlan(
        endpoint_path="/chat/completions",
        body=body,
        headers=_build_openai_headers(profile),
        reference_result=reference_result,
        adapter_mode="chat_modalities_image",
        effective_capability=effective_capability,
        strategy=CHAT_MODALITIES_IMAGE_EDIT_STRATEGY,
    )


def _extract_reference_images(payload: dict) -> list[str]:
    for key in ("reference_images", "source_images"):
        raw_value = payload.get(key)
        if isinstance(raw_value, list):
            values = [str(item or "").strip() for item in raw_value]
            cleaned = [value for value in values if value]
            if cleaned:
                return cleaned[:4]

    for key in ("reference_image", "source_image", "image"):
        value = str(payload.get(key) or "").strip()
        if value:
            return [value]
    return []


def _extract_reference_image(payload: dict) -> str:
    reference_images = _extract_reference_images(payload)
    return reference_images[0] if reference_images else ""


def _reference_image_result_fields(payload: dict) -> dict[str, object]:
    reference_images = _extract_reference_images(payload)
    return {
        "reference_image_supplied": bool(reference_images),
        "reference_image_count": len(reference_images),
        "reference_image_storage_path": reference_images[0] if reference_images else "",
        "reference_image_storage_paths": reference_images,
    }


def _task_payload_result_fields(payload: dict) -> dict[str, str]:
    return {
        "prompt": str(payload.get("prompt") or "").strip(),
        "edit_prompt": str(payload.get("edit_prompt") or "").strip(),
        "style": str(payload.get("style") or "").strip(),
        "aspect_ratio": str(payload.get("aspect_ratio") or "").strip(),
        "resolution": str(payload.get("resolution") or "").strip(),
        "deliverable": str(payload.get("deliverable") or "").strip(),
        "prompt_supplement": str(payload.get("prompt_supplement") or "").strip(),
    }


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


def _submit_image_generation_request(
    *,
    base_url: str,
    body: dict,
    headers: dict[str, str],
    timeout_seconds: float,
    endpoint_path: str = "/images/generations",
) -> dict:
    request = Request(
        url=f"{base_url.rstrip('/')}{endpoint_path}",
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

    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        if isinstance(message, dict):
            if candidates := message.get("images"):
                return _normalize_image_candidates(candidates)

            content = message.get("content")
            if isinstance(content, list):
                normalized: list[dict] = []
                for item in content:
                    if not isinstance(item, dict):
                        continue
                    image_url = item.get("image_url")
                    if isinstance(image_url, dict) and image_url.get("url"):
                        normalized.append({"url": image_url["url"]})
                        continue
                    if isinstance(image_url, str):
                        normalized.append({"url": image_url})
                        continue
                    if item.get("b64_json"):
                        normalized.append({"b64_json": item["b64_json"]})
                        continue
                    if item.get("data"):
                        normalized.append({"b64_json": item["data"]})
                if normalized:
                    return normalized

    return []


def _normalize_image_candidates(candidates: object) -> list[dict]:
    if not isinstance(candidates, list):
        return []

    normalized: list[dict] = []
    for item in candidates:
        normalized_item = _normalize_image_candidate(item)
        if normalized_item:
            normalized.append(normalized_item)
    return normalized


def _normalize_image_candidate(item: object) -> dict | None:
    if isinstance(item, str):
        return _normalize_image_url_value(item)

    if not isinstance(item, dict):
        return None

    if item.get("url"):
        return _normalize_image_url_value(str(item["url"]))

    if item.get("b64_json"):
        return {"b64_json": item["b64_json"]}

    if item.get("data"):
        return {"b64_json": item["data"]}

    image_url = item.get("image_url")
    if isinstance(image_url, dict) and image_url.get("url"):
        return _normalize_image_url_value(str(image_url["url"]))
    if isinstance(image_url, str):
        return _normalize_image_url_value(image_url)

    return None


def _normalize_image_url_value(value: str) -> dict | None:
    normalized = str(value or "").strip()
    if not normalized:
        return None
    if normalized.startswith("data:image/") and ";base64," in normalized:
        return {"b64_json": normalized.split(";base64,", 1)[1]}
    return {"url": normalized}


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


def _sanitize_error_text(raw: object, *, limit: int = 320) -> str:
    text = " ".join(str(raw or "").replace("\r", " ").replace("\n", " ").split()).strip()
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1].rstrip()}…"


def _stage_metadata(raw_stage: str) -> tuple[str, str]:
    normalized = raw_stage.strip().lower()
    mapping = (
        ("image generation", ("image_generation_request", "调用生图接口")),
        ("generated image download", ("generated_image_download", "下载生成结果")),
        ("reference image caption", ("reference_image_caption", "分析参考图")),
        ("modelscope async poll", ("async_result_poll", "轮询异步结果")),
    )
    for marker, payload in mapping:
        if marker in normalized:
            return payload
    return ("task_execution", "执行任务")


def _build_failure_result(exc: Exception, *, capability: str, provider_name: str) -> dict[str, object]:
    raw_message = str(exc).strip() or "Unknown task execution error"
    sanitized = _sanitize_error_text(raw_message, limit=520)
    default_summary = "任务执行失败，请稍后重试或联系管理员检查模型配置。"
    default_hint = "若持续失败，请记录任务 ID、模型名称和失败时间，交给管理员排查。"

    http_match = _HTTP_FAILURE_PATTERN.match(raw_message)
    if http_match:
        stage_code, stage_label = _stage_metadata(http_match.group("stage"))
        status_code = int(http_match.group("status"))
        upstream_body = _sanitize_error_text(http_match.group("detail"), limit=380)
        upstream_is_html = bool(_HTML_ERROR_PATTERN.search(http_match.group("detail")))

        if status_code in {401, 403}:
            summary = f"{stage_label}失败：上游拒绝了当前凭证或权限。"
            hint = "请在后台模型管理检查 API Key、模型权限和账号状态。"
        elif status_code == 404:
            summary = f"{stage_label}失败：上游接口或模型地址不存在。"
            hint = "请检查 base_url、接口路径和模型名称是否与当前厂商兼容。"
        elif status_code == 429:
            summary = f"{stage_label}失败：上游触发了限流。"
            hint = "请稍后重试，或在后台切换额度更稳定的模型。"
        elif status_code >= 500:
            summary = f"{stage_label}失败：上游模型服务当前异常。"
            hint = "请稍后重试；若持续失败，请让管理员检查上游服务状态。"
        else:
            summary = f"{stage_label}失败：上游返回 HTTP {status_code}。"
            hint = default_hint

        detail = (
            f"阶段：{stage_code}；HTTP 状态：{status_code}；"
            f"错误信息：{'Upstream returned an HTML error page.' if upstream_is_html else upstream_body or sanitized}"
        )
        return {
            "error": summary,
            "error_summary": summary,
            "error_detail": detail,
            "error_code": f"upstream_http_{status_code}",
            "error_stage": stage_code,
            "error_hint": hint,
            "error_raw": upstream_body or sanitized,
            "failed_capability": capability,
            "failed_provider": provider_name,
        }

    request_match = _REQUEST_FAILURE_PATTERN.match(raw_message)
    if request_match:
        stage_code, stage_label = _stage_metadata(request_match.group("stage"))
        detail = _sanitize_error_text(request_match.group("detail"), limit=380)
        summary = f"{stage_label}失败：无法连接上游模型服务。"
        hint = "请检查服务器网络、base_url 地址以及目标厂商服务是否可达。"
        return {
            "error": summary,
            "error_summary": summary,
            "error_detail": f"阶段：{stage_code}；网络错误：{detail}",
            "error_code": "upstream_network_error",
            "error_stage": stage_code,
            "error_hint": hint,
            "error_raw": detail,
            "failed_capability": capability,
            "failed_provider": provider_name,
        }

    lowered = raw_message.lower()
    if "timed out" in lowered or "timeout" in lowered:
        summary = "任务执行失败：上游模型服务响应超时。"
        hint = "请稍后重试；若经常超时，请让管理员调大超时或切换更稳定的模型。"
        return {
            "error": summary,
            "error_summary": summary,
            "error_detail": f"阶段：task_execution；错误信息：{sanitized}",
            "error_code": "upstream_timeout",
            "error_stage": "task_execution",
            "error_hint": hint,
            "error_raw": sanitized,
            "failed_capability": capability,
            "failed_provider": provider_name,
        }

    if "returned no image data" in lowered or "returned no image outputs" in lowered:
        summary = "任务执行失败：上游没有返回可用的生成结果。"
        hint = "请让管理员检查当前模型是否真的支持该能力，或是否需要调整请求参数。"
        return {
            "error": summary,
            "error_summary": summary,
            "error_detail": f"阶段：task_execution；错误信息：{sanitized}",
            "error_code": "empty_generation_result",
            "error_stage": "task_execution",
            "error_hint": hint,
            "error_raw": sanitized,
            "failed_capability": capability,
            "failed_provider": provider_name,
        }

    return {
        "error": default_summary,
        "error_summary": default_summary,
        "error_detail": f"阶段：task_execution；错误信息：{sanitized}",
        "error_code": "task_execution_error",
        "error_stage": "task_execution",
        "error_hint": default_hint,
        "error_raw": sanitized,
        "failed_capability": capability,
        "failed_provider": provider_name,
    }


def _diagnostics_from_exception(exc: Exception) -> dict[str, object]:
    if isinstance(exc, ProviderExecutionError):
        return _request_diagnostics_payload(exc.diagnostics)
    return {}


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
            task.result = {
                "error": "任务执行失败：缺少工作流或项目依赖。",
                "error_summary": "任务执行失败：缺少工作流或项目依赖。",
                "error_detail": "Task dependencies not found before execution could start.",
                "error_code": "task_dependencies_missing",
                "error_stage": "task_bootstrap",
                "error_hint": "请检查项目、工作流和任务关联数据是否完整。",
            }
            db.commit()
            return

        task.status = TaskStatus.running
        task.result = {
            **(task.result if isinstance(task.result, dict) else {}),
            "queued_stage": "running",
            **_task_payload_result_fields(task.payload),
        }
        db.commit()

        try:
            adapter = get_provider_adapter(task.requested_provider, db)
            outcome = adapter.execute(workflow.provider_capability, task.payload)
            task.status = TaskStatus.completed
            task.latency_ms = outcome.latency_ms
            task.cost = outcome.cost
            task.cost_currency = outcome.cost_currency
            task.result = outcome.result
            task.result = {
                **task.result,
                "execution_mode": settings.task_execution_mode,
                "queued_stage": "completed",
                **_reference_image_result_fields(task.payload),
                **_task_payload_result_fields(task.payload),
            }

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
            db.flush()

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
            request_diagnostics = _diagnostics_from_exception(exc)
            failure = _build_failure_result(
                exc,
                capability=workflow.provider_capability,
                provider_name=task.requested_provider,
            )
            task.result = {
                **failure,
                **request_diagnostics,
                "execution_mode": settings.task_execution_mode,
            }
            task.result = {
                **task.result,
                "queued_stage": "failed",
                **_reference_image_result_fields(task.payload),
                **_task_payload_result_fields(task.payload),
            }

            try:
                provider_definition = get_provider_definition(task.requested_provider, db)
                failed_model_name = provider_definition.model_name
                failed_outbound = provider_definition.outbound
            except Exception:
                failed_model_name = task.requested_provider
                failed_outbound = True

            db.add(
                ProviderCall(
                    task_id=task.id,
                    provider_name=task.requested_provider,
                    model_name=failed_model_name,
                    capability=workflow.provider_capability,
                    cost=0.0,
                    cost_currency=task.cost_currency or "CNY",
                    latency_ms=0,
                    outbound=failed_outbound,
                    request_summary={
                        "classification": task.classification.value,
                        "project_code": project.code,
                        "keys": list(task.payload.keys()),
                        "request_diagnostics": request_diagnostics,
                        "failure": failure,
                    },
                )
            )
            db.flush()
            logger.error(
                "task execution failed",
                extra={
                    "task_id": task.id,
                    "project_code": project.code,
                    "provider_name": task.requested_provider,
                    "error_code": failure.get("error_code"),
                    "error_detail": failure.get("error_detail"),
                    "execution_mode": settings.task_execution_mode,
                    **request_diagnostics,
                },
                exc_info=True,
            )

        ensure_usage_ledger_for_task(
            db,
            task,
            ledger_source="task.execute",
        )
        db.commit()


def build_enqueue_failure_result(exc: Exception) -> dict[str, object]:
    message = _sanitize_error_text(str(exc) or exc.__class__.__name__, limit=320)
    summary = "Task could not be queued for execution."
    return {
        "error": summary,
        "error_summary": summary,
        "error_detail": f"Queue enqueue failed: {message}",
        "error_code": "task_enqueue_failed",
        "error_stage": "task_enqueue",
        "error_hint": "Check Redis connectivity and queue configuration, then retry the task.",
        "error_raw": message,
    }


def mark_task_enqueue_failed(
    db: Session,
    task: Task,
    exc: Exception,
    *,
    ledger_source: str = "task.enqueue",
) -> dict[str, object]:
    failure = build_enqueue_failure_result(exc)
    task.status = TaskStatus.failed
    task.result = {
        **(task.result if isinstance(task.result, dict) else {}),
        **failure,
        "execution_mode": settings.task_execution_mode,
        "queued_stage": "failed",
    }
    ensure_usage_ledger_for_task(db, task, ledger_source=ledger_source)
    db.flush()
    return failure


def enqueue_task(task_id: int) -> None:
    client = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        client.lpush(settings.redis_queue_name, str(task_id))
    finally:
        client.close()
