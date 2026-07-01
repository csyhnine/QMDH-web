from __future__ import annotations

import json
import mimetypes
from datetime import datetime
from random import randint
from time import perf_counter, sleep
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from app.core.config import ImageProviderProfile
from app.services.media_storage import write_binary_asset
from app.services.model_registry import ProviderDefinition
from app.services.provider_adapters.base import ExecutionOutcome, ProviderExecutionError, RequestDiagnostics
from app.services.provider_adapters.video_common import (
    calculate_video_billing,
    resolve_public_media_url,
)
from app.services.provider_strategy import BIGJPG_UPSCALE_STRATEGY, resolve_strategy_for_capability

BIGJPG_TASK_ENDPOINT = "/task/"
_SUCCEEDED_STATUSES = {"success", "succeeded", "completed"}
_FAILED_STATUSES = {"error", "failed", "failure"}
_VALID_STYLES = {"art", "photo"}
_VALID_NOISE = {"-1", "0", "1", "2", "3"}
_VALID_X2 = {"1", "2", "3", "4"}
_IMAGE_EXTENSIONS = frozenset({"png", "jpg", "jpeg", "webp"})


class BigjpgUpscaleProviderAdapter:
    def __init__(self, definition: ProviderDefinition, profile: ImageProviderProfile):
        self.definition = definition
        self.profile = profile

    def execute(self, capability: str, payload: dict) -> ExecutionOutcome:
        if capability != "image.upscale":
            raise ValueError(f"{self.definition.provider_name} does not support {capability}")

        strategy = resolve_strategy_for_capability(
            capability=capability,
            provider_name=self.profile.provider_name,
            model_name=self.profile.model_name,
            base_url=self.profile.base_url,
            strategies=self.profile.strategies,
        )
        if strategy != BIGJPG_UPSCALE_STRATEGY:
            raise ValueError(f"{self.definition.provider_name} does not define a Bigjpg upscale strategy")

        source_image = _resolve_source_image(payload)
        if not source_image:
            raise ValueError("Upscale task payload is missing source_image or reference_image")

        style = _normalize_style(payload)
        noise = _normalize_noise(payload)
        x2 = _normalize_x2(payload)
        input_url = resolve_public_media_url(source_image)
        if not input_url.startswith(("http://", "https://")):
            raise ValueError("放大原图必须解析为公网可访问的 http(s) URL")

        endpoint_path = BIGJPG_TASK_ENDPOINT
        diagnostics = RequestDiagnostics(
            strategy=BIGJPG_UPSCALE_STRATEGY,
            endpoint_path=endpoint_path,
            request_url=f"{self.profile.base_url.rstrip('/')}{endpoint_path}",
            timeout_seconds=float(self.profile.timeout_seconds),
            adapter_mode="bigjpg_async_upscale",
            effective_capability="image.upscale",
        )

        try:
            started_at = perf_counter()
            submit_payload = _submit_bigjpg_task(
                profile=self.profile,
                style=style,
                noise=noise,
                x2=x2,
                input_url=input_url,
            )
            task_id = _extract_task_id(submit_payload)
            final_payload = _poll_bigjpg_result(self.profile, task_id)
            output_url = _extract_output_url(final_payload, task_id)
            image_bytes, content_type = _download_upscaled_image(
                output_url,
                timeout_seconds=float(self.profile.timeout_seconds),
            )
            extension = _extension_for_downloaded_image(
                output_url,
                content_type,
                self.profile.output_format,
                image_bytes,
            )
            storage_path = write_binary_asset(
                _build_storage_path(self.definition.provider_name, extension),
                image_bytes,
            )
            latency_ms = max(1, round((perf_counter() - started_at) * 1000))
            billing = calculate_video_billing(profile=self.profile, output_count=1)
            result = {
                "summary": f"{self.definition.provider_name} completed a live image.upscale run.",
                "payload_keys": list(payload.keys()),
                "adapter_mode": "bigjpg_async_upscale",
                "storage_path": storage_path,
                "storage_paths": [storage_path],
                "response_model": self.profile.model_name,
                "response_models": [self.profile.model_name],
                "requested_image_count": 1,
                "output_count": 1,
                "billing": billing,
                "upstream_task_id": task_id,
                "upstream_status": _extract_task_status(final_payload, task_id),
                "upstream_output_url": output_url,
                "upscale_style": style,
                "upscale_noise": noise,
                "upscale_x2": x2,
                "upscale_factor": _x2_to_factor_label(x2),
                "source_image_url": input_url,
                "remaining_api_calls": submit_payload.get("remaining_api_calls"),
                "request_strategy": diagnostics.strategy,
                "request_endpoint": diagnostics.endpoint_path,
                "request_url": diagnostics.request_url,
                "request_timeout_seconds": diagnostics.timeout_seconds,
                "request_adapter_mode": diagnostics.adapter_mode,
                "effective_capability": diagnostics.effective_capability,
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


def _build_storage_path(provider_name: str, extension: str) -> str:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return f"generated/{provider_name}/upscale-{timestamp}-{randint(1000, 9999)}.{extension}"


def _download_upscaled_image(image_url: str, *, timeout_seconds: float) -> tuple[bytes, str]:
    request = Request(image_url, headers={"User-Agent": "QMDH-web/1.0"})
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            content_type = str(response.headers.get("Content-Type", "")).split(";", 1)[0].strip().lower()
            return response.read(), content_type
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise ValueError(f"Upscaled image download failed with HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise ValueError(f"Upscaled image download request failed: {exc.reason}") from exc


def _extension_from_image_bytes(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def _normalize_image_extension(extension: str) -> str | None:
    normalized = extension.strip().lower().lstrip(".")
    if normalized == "jpeg":
        return "jpg"
    return normalized if normalized in _IMAGE_EXTENSIONS else None


def _extension_for_downloaded_image(
    image_url: str,
    content_type: str,
    output_format: str,
    image_bytes: bytes,
) -> str:
    sniffed = _extension_from_image_bytes(image_bytes)
    if sniffed:
        return sniffed

    normalized_type = content_type.split(";", 1)[0].strip().lower() if content_type else ""
    if normalized_type.startswith("image/"):
        guessed = mimetypes.guess_extension(normalized_type, strict=False)
        if guessed and (extension := _normalize_image_extension(guessed)):
            return extension

    parsed = urlparse(image_url)
    suffix = parsed.path.rsplit(".", 1)[-1] if "." in parsed.path else ""
    if extension := _normalize_image_extension(suffix):
        return extension

    normalized = _normalize_image_extension(output_format or "png")
    return normalized or "png"


def _resolve_source_image(payload: dict) -> str:
    for key in ("source_image", "reference_image"):
        value = str(payload.get(key) or "").strip()
        if value:
            return value
    for key in ("source_images", "reference_images"):
        raw = payload.get(key)
        if isinstance(raw, list):
            for item in raw:
                value = str(item or "").strip()
                if value:
                    return value
    return ""


def _normalize_style(payload: dict) -> str:
    value = str(payload.get("upscale_style") or payload.get("style") or "photo").strip().lower()
    return value if value in _VALID_STYLES else "photo"


def _normalize_noise(payload: dict) -> str:
    value = str(payload.get("upscale_noise") or payload.get("noise") or "0").strip()
    return value if value in _VALID_NOISE else "0"


def _normalize_x2(payload: dict) -> str:
    for key in ("upscale_x2", "upscale_scale"):
        raw = payload.get(key)
        if raw is not None and str(raw).strip():
            value = str(raw).strip()
            return value if value in _VALID_X2 else "2"

    raw = payload.get("resolution")
    value = str(raw or "2").strip().lower()
    mapping = {
        "2": "1",
        "2x": "1",
        "4": "2",
        "4x": "2",
        "8": "3",
        "8x": "3",
        "16": "4",
        "16x": "4",
    }
    if value in mapping:
        return mapping[value]
    return value if value in _VALID_X2 else "2"


def _x2_to_factor_label(x2: str) -> str:
    return {"1": "2x", "2": "4x", "3": "8x", "4": "16x"}.get(x2, x2)


def _bigjpg_headers(profile: ImageProviderProfile) -> dict[str, str]:
    return {
        "X-API-KEY": profile.api_key,
        "Content-Type": "application/json",
    }


def _submit_bigjpg_task(
    *,
    profile: ImageProviderProfile,
    style: str,
    noise: str,
    x2: str,
    input_url: str,
) -> dict:
    body = {
        "style": style,
        "noise": noise,
        "x2": x2,
        "input": input_url,
    }
    request_url = f"{profile.base_url.rstrip('/')}{BIGJPG_TASK_ENDPOINT}"
    request = Request(
        request_url,
        data=json.dumps(body).encode("utf-8"),
        headers=_bigjpg_headers(profile),
        method="POST",
    )
    try:
        with urlopen(request, timeout=profile.timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise ValueError(f"Bigjpg task submit failed with HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise ValueError(f"Bigjpg task submit request failed: {exc.reason}") from exc

    status = str(payload.get("status") or "").strip().lower()
    if status == "requires_vip":
        raise ValueError(
            "当前 API 账户未开通接口权限或套餐不足（requires_vip）。"
            "请确认密钥对应账户已开通 API，并在设置中心重新保存后再试。"
        )
    if status in {"param_error", "valid_api_key_required", "error"}:
        if status == "valid_api_key_required":
            raise ValueError(
                "API 未接受当前 Key：请确认设置中心只填写密钥本身（不要包含 X-API-KEY: 前缀），并重新保存。"
            )
        raise ValueError(f"高清放大任务提交被拒绝: {payload}")
    if not _extract_task_id(payload):
        raise ValueError(f"Bigjpg task submit returned no task id: {payload}")
    return payload


def _poll_bigjpg_result(profile: ImageProviderProfile, task_id: str) -> dict:
    poll_url = f"{profile.base_url.rstrip('/')}{BIGJPG_TASK_ENDPOINT}{task_id}"
    request = Request(poll_url, method="GET")
    deadline = perf_counter() + float(profile.timeout_seconds)
    last_payload: dict = {}

    while perf_counter() < deadline:
        try:
            with urlopen(request, timeout=min(30.0, profile.timeout_seconds)) as response:
                last_payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise ValueError(f"Bigjpg task poll failed with HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise ValueError(f"Bigjpg task poll request failed: {exc.reason}") from exc

        status = _extract_task_status(last_payload, task_id)
        normalized = status.lower()
        if normalized in _SUCCEEDED_STATUSES:
            return last_payload
        if normalized in _FAILED_STATUSES:
            raise ValueError(f"Bigjpg task failed: {last_payload}")
        sleep(3)

    raise ValueError(f"Bigjpg task timed out before completion: {last_payload}")


def _extract_task_id(payload: dict) -> str:
    for key in ("tid", "task_id", "id"):
        value = str(payload.get(key) or "").strip()
        if value:
            return value
    return ""


def _extract_task_status(payload: dict, task_id: str) -> str:
    task_payload = payload.get(task_id)
    if isinstance(task_payload, dict):
        return str(task_payload.get("status") or "").strip()
    if isinstance(payload.get("status"), str):
        return str(payload.get("status") or "").strip()
    return ""


def _extract_output_url(payload: dict, task_id: str) -> str:
    task_payload = payload.get(task_id)
    if isinstance(task_payload, dict):
        for key in ("url", "output", "result"):
            value = str(task_payload.get(key) or "").strip()
            if value.startswith(("http://", "https://")):
                return value
    raise ValueError(f"Bigjpg task succeeded but returned no output url: {payload}")
