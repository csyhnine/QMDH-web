from __future__ import annotations

import json
from time import perf_counter, sleep
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import ImageProviderProfile
from app.services.model_registry import ProviderDefinition
from app.services.provider_adapters.base import ExecutionOutcome, ProviderExecutionError, RequestDiagnostics
from app.services.provider_adapters.video_common import (
    persist_generated_video_bytes,
    resolve_public_media_url,
    video_prompt,
)
from app.services.provider_adapters.video_common import calculate_tiered_media_billing
from app.services.provider_strategy import HAODEYA_GROK_VIDEO_STRATEGY, resolve_strategy_for_capability

HAODEYA_VIDEO_ENDPOINT_PATH = "/videos"
_POLL_INTERVAL_SECONDS = 8.0
_IN_PROGRESS_STATUSES = {"pending", "in_progress", "queued", "processing"}
_SUCCEEDED_STATUSES = {"completed", "succeeded", "success"}
_FAILED_STATUSES = {"failed", "failure", "cancelled", "canceled", "expired"}

GROK_VIDEO_SKUS: dict[str, dict[str, object]] = {
    "x-ai/grok-imagine-video-i2v": {"duration": 5, "mode": "i2v", "family": "grok"},
    "x-ai/grok-imagine-video-i2v-10s": {"duration": 10, "mode": "i2v", "family": "grok"},
    "x-ai/grok-imagine-video-ref": {"duration": 5, "mode": "ref", "family": "grok"},
    "x-ai/grok-imagine-video-ref-10s": {"duration": 10, "mode": "ref", "family": "grok"},
}

HAPPYHORSE_VIDEO_SKUS: dict[str, dict[str, object]] = {
    "happyhorse-1.1-t2v-5s": {"duration": 5, "mode": "t2v", "family": "happyhorse"},
    "happyhorse-1.1-t2v-10s": {"duration": 10, "mode": "t2v", "family": "happyhorse"},
    "happyhorse-1.1-i2v-5s": {"duration": 5, "mode": "i2v", "family": "happyhorse"},
    "happyhorse-1.1-i2v-10s": {"duration": 10, "mode": "i2v", "family": "happyhorse"},
    "happyhorse-1.1-r2v-5s": {"duration": 5, "mode": "r2v", "family": "happyhorse"},
    "happyhorse-1.1-r2v-10s": {"duration": 10, "mode": "r2v", "family": "happyhorse"},
}

SEEDANCE2_VIDEO_SKUS: dict[str, dict[str, object]] = {
    "seedance-2-fast-720p-5s": {
        "duration": 5,
        "mode": "t2v",
        "family": "seedance2",
        "quality": "fast720",
        "resolution": "720p",
    },
    "seedance-2-fast-720p-10s": {
        "duration": 10,
        "mode": "t2v",
        "family": "seedance2",
        "quality": "fast720",
        "resolution": "720p",
    },
    "seedance-2-720p-5s": {
        "duration": 5,
        "mode": "t2v",
        "family": "seedance2",
        "quality": "720",
        "resolution": "720p",
    },
    "seedance-2-720p-10s": {
        "duration": 10,
        "mode": "t2v",
        "family": "seedance2",
        "quality": "720",
        "resolution": "720p",
    },
    "seedance-2-1080p-5s": {
        "duration": 5,
        "mode": "t2v",
        "family": "seedance2",
        "quality": "1080",
        "resolution": "1080p",
    },
    "seedance-2-1080p-10s": {
        "duration": 10,
        "mode": "t2v",
        "family": "seedance2",
        "quality": "1080",
        "resolution": "1080p",
    },
}

HAODEYA_VIDEO_SKUS: dict[str, dict[str, object]] = {
    **GROK_VIDEO_SKUS,
    **HAPPYHORSE_VIDEO_SKUS,
    **SEEDANCE2_VIDEO_SKUS,
}

_DEPRECATED_GROK_MODEL = "x-ai/grok-imagine-video"
_PLACEHOLDER_PROFILE_MODELS = {
    "grok-imagine-video",
    "haodeya_grok",
    "grok_imagine_video",
    "grok-imagine",
    "haodeya_happyhorse",
    "happyhorse-1.1",
    "happyhorse-1.1-t2v",
    "happyhorse-1.1-i2v",
    "happyhorse-1.1-r2v",
    "seedance-2",
    "haodeya_seedance",
    "haodeya_seedance_2",
    "seedance-2-fast",
    "seedance-2-720p",
    "seedance-2-1080p",
    "seedance-2-mini",
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
            request_body = _build_haodeya_grok_request_body(sku, prompt, payload, profile=self.profile)
            submit_payload = _submit_haodeya_grok_video_task(self.profile, request_body)
            upstream_task_id = _extract_task_id(submit_payload)
            polling_url = _extract_polling_url(submit_payload)
            final_payload = _poll_haodeya_grok_video_result(
                self.profile,
                upstream_task_id,
                polling_url=polling_url,
            )
            content_task_id = upstream_task_id or _extract_task_id(final_payload)
            if not content_task_id:
                raise ValueError(
                    f"Haodeya Grok video task completed but returned no task id: {final_payload}"
                )

            video_bytes = _download_haodeya_grok_video_content(self.profile, content_task_id)
            storage_path = persist_generated_video_bytes(
                provider_name=self.definition.provider_name,
                video_bytes=video_bytes,
                prompt=prompt,
                output_format=self.profile.output_format,
            )
            latency_ms = max(1, round((perf_counter() - started_at) * 1000))
            billing = calculate_tiered_media_billing(
                profile=self.profile,
                output_count=1,
                tier=_grok_sku_billing_tier(sku),
                pricing_unit="per_video",
            )
            billing = {
                **billing,
                "video_sku": sku,
                "source": "provider_profile",
            }
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
                "upstream_download": "content",
                "video_sku": sku,
                "grok_video_mode": HAODEYA_VIDEO_SKUS[sku]["mode"],
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


def _grok_sku_billing_tier(sku: str) -> str:
    meta = HAODEYA_VIDEO_SKUS.get(str(sku or "").strip())
    if isinstance(meta, dict) and int(meta.get("duration") or 5) >= 10:
        return "2k"
    if str(sku or "").strip().endswith("-10s") or "10s" in str(sku or ""):
        return "2k"
    return "1k"


def _resolve_grok_sku(profile: ImageProviderProfile, payload: dict) -> str:
    explicit_sku = str(payload.get("video_sku") or "").strip()
    if explicit_sku:
        sku = explicit_sku
    elif profile.model_name.strip() in HAODEYA_VIDEO_SKUS:
        sku = profile.model_name.strip()
    elif profile.model_name.strip().lower() in _PLACEHOLDER_PROFILE_MODELS:
        raise ValueError(
            "Video task is missing video_sku. Select a concrete SKU with duration suffix "
            "(e.g. happyhorse-1.1-t2v-5s, seedance-2-720p-5s, or x-ai/grok-imagine-video-i2v) before submitting."
        )
    else:
        sku = profile.model_name.strip()

    if sku == _DEPRECATED_GROK_MODEL:
        raise ValueError(
            f"Model {_DEPRECATED_GROK_MODEL} is deprecated; use one of: {', '.join(GROK_VIDEO_SKUS)}"
        )
    if sku in _PLACEHOLDER_PROFILE_MODELS or sku.lower() == profile.provider_name.strip().lower():
        raise ValueError(
            f"Invalid upstream video model {sku!r}. Admin model_name/provider_name must not be sent bare; "
            f"use one of: {', '.join(HAODEYA_VIDEO_SKUS)}"
        )
    if sku not in HAODEYA_VIDEO_SKUS:
        raise ValueError(
            f"Unsupported Haodeya video SKU {sku!r}; expected one of: {', '.join(HAODEYA_VIDEO_SKUS)}"
        )

    # Optional Admin remap: Studio still picks a tier; adapter_config can redirect to another known SKU.
    sku = _apply_grok_sku_admin_override(profile, sku)
    return sku


def _apply_grok_sku_admin_override(profile: ImageProviderProfile, sku: str) -> str:
    meta = HAODEYA_VIDEO_SKUS.get(sku)
    if not isinstance(meta, dict):
        return sku
    mode = str(meta.get("mode") or "").strip()
    duration = int(meta.get("duration") or 5)
    override_key = f"upstream_sku_{mode}_{duration}s"
    adapter_config = profile.adapter_config if isinstance(profile.adapter_config, dict) else {}
    override = adapter_config.get(override_key)
    if not isinstance(override, str) or not override.strip():
        return sku
    remapped = override.strip()
    if remapped not in HAODEYA_VIDEO_SKUS:
        raise ValueError(
            f"Admin adapter_config.{override_key}={remapped!r} is not a supported video SKU; "
            f"expected one of: {', '.join(HAODEYA_VIDEO_SKUS)}"
        )
    return remapped


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


def _build_haodeya_grok_request_body(
    sku: str,
    prompt: str,
    payload: dict,
    *,
    profile: ImageProviderProfile | None = None,
) -> dict[str, object]:
    cfg = HAODEYA_VIDEO_SKUS[sku]
    family = str(cfg.get("family") or "grok")
    if family == "happyhorse":
        return _build_happyhorse_request_body(sku, prompt, payload)
    if family == "seedance2":
        return _build_seedance2_request_body(sku, prompt, payload, profile=profile)
    return _build_grok_request_body(sku, prompt, payload)


def _build_grok_request_body(sku: str, prompt: str, payload: dict) -> dict[str, object]:
    cfg = HAODEYA_VIDEO_SKUS[sku]
    mode = str(cfg["mode"])
    # Duration always follows the resolved SKU (Studio selection or Admin remap).
    duration = int(cfg["duration"])

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
            body["frame_images"] = [_grok_frame_image_item(resolve_public_media_url(start_url))]
    else:
        if payload.get("frame_images"):
            raise ValueError("ref mode cannot use frame_images")
        if str(payload.get("start_image_url") or "").strip():
            raise ValueError("ref mode cannot use start_image_url / frame_images")
        if len(public_urls) > 4:
            raise ValueError("ref mode accepts at most 4 reference images")
        if public_urls:
            body["input_references"] = [_grok_image_item(url) for url in public_urls]

    return body


def _build_happyhorse_request_body(sku: str, prompt: str, payload: dict) -> dict[str, object]:
    cfg = HAODEYA_VIDEO_SKUS[sku]
    mode = str(cfg["mode"])
    duration = int(cfg["duration"])
    # Gateway requires duration to match the -5s/-10s SKU suffix; do not trust mismatched payload.
    payload_duration = payload.get("duration")
    if payload_duration is not None and int(payload_duration) != duration:
        raise ValueError(
            f"HappyHorse duration must be {duration} for SKU {sku}; got {payload_duration}"
        )

    # Upstream Haodeya /v1/videos: top-level size is WxH; resolution tier is in
    # metadata.parameters.resolution. Reference images live under metadata.input.media.
    input_block: dict[str, object] = {"prompt": prompt}
    metadata: dict[str, object] = {
        "input": input_block,
        "parameters": {
            "resolution": "720P",
            "duration": duration,
        },
    }
    body: dict[str, object] = {
        "model": sku,
        "prompt": prompt,
        "duration": duration,
        "size": "1280*720",
        "metadata": metadata,
    }

    reference_paths = _collect_reference_paths(payload)
    public_urls = [resolve_public_media_url(path) for path in reference_paths]

    if mode == "t2v":
        if public_urls:
            raise ValueError("HappyHorse t2v must not include reference images")
        return body
    if mode == "i2v":
        if len(public_urls) > 1:
            raise ValueError("HappyHorse i2v accepts exactly one first_frame image")
        start_url = str(payload.get("start_image_url") or "").strip() or (public_urls[0] if public_urls else "")
        if not start_url:
            raise ValueError("HappyHorse i2v requires media type=first_frame")
        input_block["media"] = [
            {"type": "first_frame", "url": resolve_public_media_url(start_url)}
        ]
        return body
    # r2v
    if not public_urls:
        raise ValueError("HappyHorse r2v requires 1–9 reference_image media items")
    if len(public_urls) > 9:
        raise ValueError("HappyHorse r2v accepts at most 9 reference images")
    input_block["media"] = [{"type": "reference_image", "url": url} for url in public_urls]
    return body


def _build_seedance2_request_body(
    sku: str,
    prompt: str,
    payload: dict,
    *,
    profile: ImageProviderProfile | None = None,
) -> dict[str, object]:
    """Haodeya Seedance 2 ToAPI: short /v1/videos body; duration must match SKU suffix."""
    del profile  # kept for call-site compatibility; Studio registers avatars manually
    cfg = HAODEYA_VIDEO_SKUS[sku]
    duration = int(cfg["duration"])
    payload_duration = payload.get("duration")
    if payload_duration is not None and int(payload_duration) != duration:
        raise ValueError(
            f"Seedance 2 duration must be {duration} for SKU {sku}; got {payload_duration}"
        )

    aspect_ratio = str(payload.get("aspect_ratio") or payload.get("ratio") or "16:9").strip() or "16:9"
    body: dict[str, object] = {
        "model": sku,
        "prompt": prompt,
        "duration": duration,
        "aspect_ratio": aspect_ratio,
    }

    # Optional references (ToAPI image_with_roles).
    # Prefer asset:// from manual private-avatar; otherwise public HTTPS (no forced register).
    reference_paths = _collect_reference_paths(payload)
    if reference_paths:
        if len(reference_paths) > 4:
            raise ValueError("Seedance 2 accepts at most 4 reference images")
        image_with_roles: list[dict[str, object]] = []
        for raw_ref in reference_paths:
            if raw_ref.strip().lower().startswith("asset://"):
                image_with_roles.append({"url": raw_ref.strip(), "role": "reference_image"})
                continue
            ref_url = resolve_public_media_url(raw_ref)
            # Single HTTPS ref → first_frame I2V; multi-ref → reference_image.
            role = "first_frame" if len(reference_paths) == 1 else "reference_image"
            image_with_roles.append({"url": ref_url, "role": role})
        body["image_with_roles"] = image_with_roles
    return body


def _grok_image_item(url: str) -> dict[str, object]:
    return {"type": "image_url", "image_url": {"url": url}}


def _grok_frame_image_item(url: str) -> dict[str, object]:
    return {**_grok_image_item(url), "frame_type": "first_frame"}


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
        raise ValueError(f"Haodeya video submit failed with HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise ValueError(f"Haodeya video submit request failed: {exc.reason}") from exc


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
            raise ValueError(f"Haodeya video poll failed with HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise ValueError(f"Haodeya video poll request failed: {exc.reason}") from exc

        status = _extract_task_status(last_payload)
        if status in _SUCCEEDED_STATUSES:
            return last_payload
        if status in _FAILED_STATUSES:
            error_detail = last_payload.get("error") or last_payload.get("message") or last_payload
            raise ValueError(f"Haodeya video task failed with status={status}: {error_detail}")

        sleep(_POLL_INTERVAL_SECONDS)

    raise ValueError(
        f"Haodeya video task timed out after {profile.timeout_seconds}s; last status={_extract_task_status(last_payload)}"
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


def _download_haodeya_grok_video_content(profile: ImageProviderProfile, task_id: str) -> bytes:
    url = f"{profile.base_url.rstrip('/')}{HAODEYA_VIDEO_ENDPOINT_PATH}/{task_id}/content"
    request = Request(
        url=url,
        headers={"Authorization": f"Bearer {profile.api_key}"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=profile.timeout_seconds) as response:
            return response.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise ValueError(f"Haodeya video content download failed with HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise ValueError(f"Haodeya video content download request failed: {exc.reason}") from exc
