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
    extract_video_urls,
    persist_generated_video,
    video_prompt,
)
from app.services.provider_strategy import DASHSCOPE_ASYNC_VIDEO_STRATEGY, resolve_strategy_for_capability

DASHSCOPE_VIDEO_ENDPOINT_PATH = "/services/aigc/video-generation/video-synthesis"
DASHSCOPE_TASK_POLL_PREFIX = "/tasks/"
_SUCCEEDED_STATUSES = {"SUCCEED", "SUCCEEDED", "SUCCESS", "COMPLETED"}
_FAILED_STATUSES = {"FAILED", "FAILURE", "CANCELED", "CANCELLED"}


class DashScopeVideoProviderAdapter:
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
        if strategy != DASHSCOPE_ASYNC_VIDEO_STRATEGY:
            raise ValueError(f"{self.definition.provider_name} does not define a DashScope video strategy")

        prompt = video_prompt(payload)
        if not prompt:
            raise ValueError("Video task payload is missing prompt")

        diagnostics = RequestDiagnostics(
            strategy=DASHSCOPE_ASYNC_VIDEO_STRATEGY,
            endpoint_path=DASHSCOPE_VIDEO_ENDPOINT_PATH,
            request_url=f"{self.profile.base_url.rstrip('/')}{DASHSCOPE_VIDEO_ENDPOINT_PATH}",
            timeout_seconds=float(self.profile.timeout_seconds),
            adapter_mode="dashscope_async_video",
            effective_capability="video.generate",
        )

        try:
            started_at = perf_counter()
            submit_payload = _submit_dashscope_video_task(self.profile, prompt, payload)
            upstream_task_id = _extract_task_id(submit_payload)
            final_payload = _poll_dashscope_video_result(self.profile, upstream_task_id)
            video_urls = extract_video_urls(final_payload)
            if not video_urls:
                raise ValueError(f"DashScope async task succeeded but returned no video outputs: {final_payload}")

            storage_paths = [
                persist_generated_video(
                    provider_name=self.definition.provider_name,
                    video_url=video_url,
                    prompt=prompt,
                    timeout_seconds=float(self.profile.timeout_seconds),
                    output_format=self.profile.output_format,
                )
                for video_url in video_urls
            ]
            latency_ms = max(1, round((perf_counter() - started_at) * 1000))
            billing = calculate_video_billing(profile=self.profile, output_count=len(storage_paths))
            result = {
                "summary": f"{self.definition.provider_name} completed a live video.generate run.",
                "payload_keys": list(payload.keys()),
                "adapter_mode": "dashscope_async_video",
                "storage_path": storage_paths[0],
                "storage_paths": storage_paths,
                "response_model": self.profile.model_name,
                "response_models": [self.profile.model_name],
                "requested_video_count": 1,
                "output_count": len(storage_paths),
                "billing": billing,
                "upstream_task_id": upstream_task_id,
                "upstream_status": _extract_task_status(final_payload),
                "upstream_request_id": _extract_request_id(final_payload) or _extract_request_id(submit_payload),
                "upstream_video_url_count": len(video_urls),
                "usage": _extract_usage(final_payload),
                "usage_records": [_extract_usage(final_payload)] if _extract_usage(final_payload) else [],
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


def _dashscope_headers(profile: ImageProviderProfile, *, async_submit: bool = False) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {profile.api_key}",
        "Content-Type": "application/json",
    }
    if async_submit:
        headers["X-DashScope-Async"] = "enable"
    return headers


def _dashscope_video_request_body(profile: ImageProviderProfile, prompt: str, payload: dict) -> dict[str, object]:
    input_payload: dict[str, object] = {"prompt": prompt}
    if isinstance(payload.get("input"), dict):
        input_payload.update(payload["input"])
        input_payload["prompt"] = str(input_payload.get("prompt") or prompt)
    if negative_prompt := str(payload.get("negative_prompt") or "").strip():
        input_payload["negative_prompt"] = negative_prompt

    parameters = _dashscope_video_parameters(profile, payload)
    if isinstance(payload.get("parameters"), dict):
        parameters.update(payload["parameters"])

    body: dict[str, object] = {
        "model": profile.model_name,
        "input": input_payload,
    }
    if parameters:
        body["parameters"] = parameters
    return body


def _dashscope_video_parameters(profile: ImageProviderProfile, payload: dict) -> dict[str, object]:
    parameters: dict[str, object] = {}
    model_identity = f"{profile.provider_name} {profile.model_name}".lower()

    aspect_ratio = str(payload.get("aspect_ratio") or "").strip()
    resolution = str(payload.get("resolution") or "").strip()
    size = str(payload.get("size") or "").strip()

    if "happyhorse" in model_identity:
        if resolution:
            parameters["resolution"] = resolution
        if aspect_ratio:
            parameters["ratio"] = aspect_ratio
    else:
        if size:
            parameters["size"] = size
        elif resolution and "x" in resolution.lower():
            parameters["size"] = resolution
        if aspect_ratio and "ratio" not in parameters:
            parameters["ratio"] = aspect_ratio

    for key in ("duration", "seed"):
        if payload.get(key) not in {None, ""}:
            parameters[key] = payload[key]
    for key in ("prompt_extend", "watermark"):
        if isinstance(payload.get(key), bool):
            parameters[key] = payload[key]
    return parameters


def _submit_dashscope_video_task(profile: ImageProviderProfile, prompt: str, payload: dict) -> dict:
    request = Request(
        url=f"{profile.base_url.rstrip('/')}{DASHSCOPE_VIDEO_ENDPOINT_PATH}",
        data=json.dumps(_dashscope_video_request_body(profile, prompt, payload)).encode("utf-8"),
        headers=_dashscope_headers(profile, async_submit=True),
        method="POST",
    )
    try:
        with urlopen(request, timeout=profile.timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise ValueError(f"DashScope video task submit failed with HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise ValueError(f"DashScope video task submit request failed: {exc.reason}") from exc


def _poll_dashscope_video_result(profile: ImageProviderProfile, task_id: str) -> dict:
    if not task_id:
        raise ValueError(f"{profile.provider_name} did not return a task_id for async video generation")

    deadline = perf_counter() + max(float(profile.timeout_seconds), 180.0)
    last_payload: dict[str, object] = {}
    while perf_counter() < deadline:
        request = Request(
            url=f"{profile.base_url.rstrip('/')}{DASHSCOPE_TASK_POLL_PREFIX}{task_id}",
            headers=_dashscope_headers(profile),
            method="GET",
        )
        try:
            with urlopen(request, timeout=profile.timeout_seconds) as response:
                last_payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise ValueError(f"DashScope video task poll failed with HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise ValueError(f"DashScope video task poll request failed: {exc.reason}") from exc

        status = _extract_task_status(last_payload)
        if status in _SUCCEEDED_STATUSES:
            return last_payload
        if status in _FAILED_STATUSES:
            raise ValueError(f"DashScope async video task failed: {last_payload}")
        sleep(5)

    raise ValueError(f"DashScope async video task timed out before completion: {last_payload}")


def _extract_output(payload: dict) -> dict:
    output = payload.get("output")
    return output if isinstance(output, dict) else payload


def _extract_task_id(payload: dict) -> str:
    output = _extract_output(payload)
    return str(output.get("task_id") or payload.get("task_id") or "").strip()


def _extract_task_status(payload: dict) -> str:
    output = _extract_output(payload)
    return str(output.get("task_status") or payload.get("task_status") or "").strip().upper()


def _extract_request_id(payload: dict) -> str:
    output = _extract_output(payload)
    return str(payload.get("request_id") or output.get("request_id") or "").strip()


def _extract_usage(payload: dict) -> dict:
    output = _extract_output(payload)
    usage = output.get("usage") or payload.get("usage")
    return usage if isinstance(usage, dict) else {}
