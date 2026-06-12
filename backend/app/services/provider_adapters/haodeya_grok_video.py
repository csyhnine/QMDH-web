from __future__ import annotations

import json
from time import perf_counter, sleep
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import ImageProviderProfile
from app.services.model_registry import ProviderDefinition
from app.services.provider_adapters.base import ExecutionOutcome, ProviderExecutionError, RequestDiagnostics
from app.services.provider_adapters.video_common import (
    calculate_video_billing,
    persist_generated_video,
    resolve_public_media_url,
    video_prompt,
)
from app.services.provider_strategy import HAODEYA_GROK_VIDEO_STRATEGY, resolve_strategy_for_capability

HAODEYA_VIDEO_ENDPOINT_PATH = "/videos"
_POLL_INTERVAL_SECONDS = 8.0
_IN_PROGRESS_STATUSES = {"pending", "in_progress", "queued", "processing"}
_SUCCEEDED_STATUSES = {"completed", "succeeded", "success"}
_FAILED_STATUSES = {"failed", "failure", "cancelled", "canceled", "expired"}

GROK_VIDEO_SKUS: dict[str, dict[str, object]] = {
    "x-ai/grok-imagine-video-i2v": {"duration": 5, "mode": "i2v"},
    "x-ai/grok-imagine-video-i2v-10s": {"duration": 10, "mode": "i2v"},
    "x-ai/grok-imagine-video-ref": {"duration": 5, "mode": "ref"},
    "x-ai/grok-imagine-video-ref-10s": {"duration": 10, "mode": "ref"},
}

_DEPRECATED_GROK_MODEL = "x-ai/grok-imagine-video"
_PLACEHOLDER_PROFILE_MODELS = {
    "grok-imagine-video",
    "haodeya_grok",
    "grok_imagine_video",
    "grok-imagine",
}


class HaodeyaGrokVideoProviderAdapter:
    def __init__(self, definition: ProviderDefinition, profile: ImageProviderProfile):
        self.definition = definition
        self.profile = profile

    def execute(self, capability: str, payload: dict) -> ExecutionOutcome:
        if capability != "video.generate":
            raise ValueError(f"{self.definition.provider_name} does not support {capability}")

        strategy = resolve_strategy_for_capability(
            capability=capability,
            provider_name=self.profile.provider_name,
            model_name=self.profile.model_name,
            base_url=self.profile.base_url,
            strategies=self.profile.strategies,
        )
        if strategy != HAODEYA_GROK_VIDEO_STRATEGY:
            raise ValueError(f"{self.definition.provider_name} does not define a Haodeya Grok video strategy")

        prompt = video_prompt(payload)
        if not prompt:
            raise ValueError("Video task payload is missing prompt")

        sku = _resolve_grok_sku(self.profile, payload)
        diagnostics = RequestDiagnostics(
            strategy=HAODEYA_GROK_VIDEO_STRATEGY,
            endpoint_path=HAODEYA_VIDEO_ENDPOINT_PATH,
            request_url=f"{self.profile.base_url.rstrip('/')}{HAODEYA_VIDEO_ENDPOINT_PATH}",
            timeout_seconds=float(self.profile.timeout_seconds),
            adapter_mode="haodeya_grok_video",
            effective_capability="video.generate",
        )

        try:
            started_at = perf_counter()
            request_body = _build_haodeya_grok_request_body(sku, prompt, payload)
            submit_payload = _submit_haodeya_grok_video_task(self.profile, request_body)
            upstream_task_id = _extract_task_id(submit_payload)
            polling_url = _extract_polling_url(submit_payload)
            final_payload = _poll_haodeya_grok_video_result(
                self.profile,
                upstream_task_id,
                polling_url=polling_url,
            )
            video_url = _extract_completed_video_url(final_payload)
            if not video_url:
                raise ValueError(
                    f"Haodeya Grok video task completed but returned no unsigned_urls: {final_payload}"
                )

            storage_path = persist_generated_video(
                provider_name=self.definition.provider_name,
                video_url=video_url,
                prompt=prompt,
                timeout_seconds=float(self.profile.timeout_seconds),
                output_format=self.profile.output_format,
            )
            latency_ms = max(1, round((perf_counter() - started_at) * 1000))
            billing = calculate_video_billing(profile=self.profile, output_count=1)
            result = {
                "summary": f"{self.definition.provider_name} completed a live video.generate run.",
                "payload_keys": list(payload.keys()),
                "adapter_mode": "haodeya_grok_video",
                "storage_path": storage_path,
                "storage_paths": [storage_path],
                "response_model": sku,
                "response_models": [sku],
                "requested_video_count": 1,
                "output_count": 1,
                "billing": billing,
                "upstream_task_id": upstream_task_id,
                "upstream_status": _extract_task_status(final_payload),
                "upstream_video_url_count": 1,
                "video_sku": sku,
                "grok_video_mode": GROK_VIDEO_SKUS[sku]["mode"],
                "request_strategy": diagnostics.strategy,
                "request_endpoint": diagnostics.endpoint_path,
                "request_url": diagnostics.request_url,
                "request_timeout_seconds": diagnostics.timeout_seconds,
                "request_adapter_mode": diagnostics.adapter_mode,
                "effective_capability": diagnostics.effective_capability,
            }
            return ExecutionOutcome(
                model_name=sku,
                latency_ms=latency_ms,
                cost=billing["cost"],
                cost_currency=billing["currency"],
                outbound=self.definition.outbound,
                result=result,
            )
        except Exception as exc:
            raise ProviderExecutionError(str(exc), diagnostics=diagnostics) from exc


def _resolve_grok_sku(profile: ImageProviderProfile, payload: dict) -> str:
    explicit_sku = str(payload.get("video_sku") or "").strip()
    if explicit_sku:
        sku = explicit_sku
    elif profile.model_name.strip() in GROK_VIDEO_SKUS:
        sku = profile.model_name.strip()
    elif profile.model_name.strip().lower() in _PLACEHOLDER_PROFILE_MODELS:
        raise ValueError(
            "Grok video task is missing video_sku. In Studio, select one of the four Grok tiers "
            "(e.g. x-ai/grok-imagine-video-i2v) before submitting."
        )
    else:
        sku = profile.model_name.strip()

    if sku == _DEPRECATED_GROK_MODEL:
        raise ValueError(
            f"Model {_DEPRECATED_GROK_MODEL} is deprecated; use one of: {', '.join(GROK_VIDEO_SKUS)}"
        )
    if sku in _PLACEHOLDER_PROFILE_MODELS or sku.lower() == profile.provider_name.strip().lower():
        raise ValueError(
            f"Invalid upstream Grok model {sku!r}. Admin model_name/provider_name must not be sent to Haodeya; "
            f"use one of: {', '.join(GROK_VIDEO_SKUS)}"
        )
    if sku not in GROK_VIDEO_SKUS:
        raise ValueError(
            f"Unsupported Grok video SKU {sku!r}; expected one of: {', '.join(GROK_VIDEO_SKUS)}"
        )
    return sku


def _collect_reference_paths(payload: dict) -> list[str]:
    paths: list[str] = []
    for key in ("reference_images", "source_images"):
        value = payload.get(key)
        if isinstance(value, list):
            paths.extend(str(item).strip() for item in value if str(item).strip())
    for key in ("reference_image", "source_image", "start_image_url"):
        value = str(payload.get(key) or "").strip()
        if value:
            paths.append(value)
    explicit_refs = payload.get("reference_image_urls")
    if isinstance(explicit_refs, list):
        paths.extend(str(item).strip() for item in explicit_refs if str(item).strip())
    return list(dict.fromkeys(paths))


def _build_haodeya_grok_request_body(sku: str, prompt: str, payload: dict) -> dict[str, object]:
    cfg = GROK_VIDEO_SKUS[sku]
    mode = str(cfg["mode"])
    duration = int(cfg["duration"])

    payload_duration = payload.get("duration")
    if payload_duration not in {None, "", duration}:
        raise ValueError(f"SKU {sku} requires duration={duration}, got {payload_duration!r}")

    resolution = str(payload.get("resolution") or "720p").strip().lower()
    if resolution != "720p":
        raise ValueError("Grok Imagine Video only supports resolution=720p")

    aspect_ratio = str(payload.get("aspect_ratio") or "16:9").strip() or "16:9"
    body: dict[str, object] = {
        "model": sku,
        "prompt": prompt,
        "duration": duration,
        "resolution": "720p",
        "aspect_ratio": aspect_ratio,
    }

    reference_paths = _collect_reference_paths(payload)
    public_urls = [resolve_public_media_url(path) for path in reference_paths]

    if mode == "i2v":
        if isinstance(payload.get("input_references"), list) and payload["input_references"]:
            raise ValueError("i2v mode cannot use input_references")
        if len(public_urls) > 1:
            raise ValueError("i2v mode accepts at most one start frame image")
        start_url = str(payload.get("start_image_url") or "").strip() or (public_urls[0] if public_urls else "")
        if start_url:
            body["frame_images"] = [
                {
                    "type": "first_frame",
                    "url": resolve_public_media_url(start_url),
                }
            ]
    else:
        if payload.get("frame_images"):
            raise ValueError("ref mode cannot use frame_images")
        if str(payload.get("start_image_url") or "").strip():
            raise ValueError("ref mode cannot use start_image_url / frame_images")
        if len(public_urls) > 4:
            raise ValueError("ref mode accepts at most 4 reference images")
        if public_urls:
            body["input_references"] = [
                {"type": "image_url", "image_url": {"url": url}} for url in public_urls
            ]

    return body


def _haodeya_headers(profile: ImageProviderProfile) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {profile.api_key}",
        "Content-Type": "application/json",
    }


def _submit_haodeya_grok_video_task(profile: ImageProviderProfile, body: dict[str, object]) -> dict:
    request = Request(
        url=f"{profile.base_url.rstrip('/')}{HAODEYA_VIDEO_ENDPOINT_PATH}",
        data=json.dumps(body).encode("utf-8"),
        headers=_haodeya_headers(profile),
        method="POST",
    )
    try:
        with urlopen(request, timeout=profile.timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise ValueError(f"Haodeya Grok video submit failed with HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise ValueError(f"Haodeya Grok video submit request failed: {exc.reason}") from exc


def _poll_haodeya_grok_video_result(
    profile: ImageProviderProfile,
    task_id: str,
    *,
    polling_url: str | None = None,
) -> dict:
    if not task_id and not polling_url:
        raise ValueError(f"{profile.provider_name} did not return a task id for async video generation")

    deadline = perf_counter() + max(float(profile.timeout_seconds), 300.0)
    poll_url = (polling_url or f"{profile.base_url.rstrip('/')}{HAODEYA_VIDEO_ENDPOINT_PATH}/{task_id}").strip()
    last_payload: dict[str, object] = {}

    while perf_counter() < deadline:
        request = Request(url=poll_url, headers=_haodeya_headers(profile), method="GET")
        try:
            with urlopen(request, timeout=min(float(profile.timeout_seconds), 60.0)) as response:
                last_payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise ValueError(f"Haodeya Grok video poll failed with HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise ValueError(f"Haodeya Grok video poll request failed: {exc.reason}") from exc

        status = _extract_task_status(last_payload)
        if status in _SUCCEEDED_STATUSES:
            return last_payload
        if status in _FAILED_STATUSES:
            error_detail = last_payload.get("error") or last_payload.get("message") or last_payload
            raise ValueError(f"Haodeya Grok video task failed with status={status}: {error_detail}")

        sleep(_POLL_INTERVAL_SECONDS)

    raise ValueError(
        f"Haodeya Grok video task timed out after {profile.timeout_seconds}s; last status={_extract_task_status(last_payload)}"
    )


def _extract_task_id(payload: dict) -> str:
    for key in ("id", "task_id", "job_id"):
        value = str(payload.get(key) or "").strip()
        if value:
            return value
    return ""


def _extract_polling_url(payload: dict) -> str | None:
    value = str(payload.get("polling_url") or "").strip()
    return value or None


def _extract_task_status(payload: dict) -> str:
    return str(payload.get("status") or payload.get("state") or "").strip().lower()


def _extract_completed_video_url(payload: dict) -> str:
    unsigned_urls = payload.get("unsigned_urls")
    if isinstance(unsigned_urls, list) and unsigned_urls:
        first = unsigned_urls[0]
        if isinstance(first, str) and first.strip():
            return first.strip()
    for key in ("video_url", "url", "output_url"):
        value = str(payload.get(key) or "").strip()
        if value.startswith(("http://", "https://")):
            return value
    return ""
