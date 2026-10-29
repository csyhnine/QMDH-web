from __future__ import annotations

import json
from dataclasses import replace
from time import perf_counter, sleep
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import ImageProviderProfile
from app.services.model_registry import ProviderDefinition
from app.services.provider_adapters.base import ExecutionOutcome, ProviderExecutionError, RequestDiagnostics
from app.services.provider_adapters.async_progress import AsyncTaskProgress, UpstreamTaskFailed
from app.services.provider_adapters.video_common import (
    calculate_video_billing,
    extract_video_urls,
    persist_generated_video,
    video_prompt,
)
from app.services.provider_strategy import VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY, resolve_strategy_for_capability

ARK_VIDEO_TASKS_ENDPOINT_PATH = "/contents/generations/tasks"
_SUCCEEDED_STATUSES = {"SUCCEEDED", "SUCCESS", "COMPLETED", "DONE"}
_FAILED_STATUSES = {"FAILED", "FAILURE", "CANCELED", "CANCELLED"}


class VolcengineArkVideoProviderAdapter:
    def __init__(self, definition: ProviderDefinition, profile: ImageProviderProfile):
        self.definition = definition
        self.profile = profile
        self.task_id, self.saved_progress, self.save_progress = None, {}, None

    def bind_async_progress(self, task_id, progress, save):
        self.task_id, self.saved_progress, self.save_progress = task_id, progress, save

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
        if strategy != VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY:
            raise ValueError(f"{self.definition.provider_name} does not define an Ark video task strategy")

        prompt = video_prompt(payload)
        if not prompt:
            raise ValueError("Video task payload is missing prompt")

        diagnostics = RequestDiagnostics(
            strategy=VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY,
            endpoint_path=ARK_VIDEO_TASKS_ENDPOINT_PATH,
            request_url=f"{self.profile.base_url.rstrip('/')}{ARK_VIDEO_TASKS_ENDPOINT_PATH}",
            timeout_seconds=float(self.profile.timeout_seconds),
            adapter_mode="volcengine_ark_video_tasks",
            effective_capability="video.generate",
        )

        request_model = str(_ark_video_request_body(self.profile, prompt, payload).get("model") or self.profile.model_name)
        execution_profile = replace(self.profile, model_name=request_model)
        started_at = perf_counter()
        progress = AsyncTaskProgress(task_id=self.task_id, saved=self.saved_progress, save=self.save_progress,
                                     definition=self.definition, profile=execution_profile, diagnostics=diagnostics,
                                     billing=calculate_video_billing(profile=self.profile, output_count=1))
        try:
            upstream_task_id = progress.prepare()
            if upstream_task_id is None:
                submit_payload = _submit_ark_video_task(self.profile, prompt, payload)
                upstream_task_id = _extract_task_id(submit_payload)
                progress.accepted(upstream_task_id, _extract_request_id(submit_payload))
            if progress.step["state"] != "completed":
                if not progress.step.get("output_urls"):
                    final_payload = _poll_ark_video_result(self.profile, upstream_task_id)
                    video_urls = extract_video_urls(final_payload)
                    if not video_urls:
                        raise ValueError("Volcengine async task succeeded but returned no video outputs")
                    progress.outputs(video_urls, status=_extract_task_status(final_payload),
                                     usage=_extract_usage(final_payload), request_id=_extract_request_id(final_payload))
                for video_url in progress.step["output_urls"][len(progress.step["storage_paths"]):]:
                    progress.checkpoint()
                    storage_path = persist_generated_video(
                        provider_name=self.definition.provider_name, video_url=video_url, prompt=prompt,
                        timeout_seconds=float(self.profile.timeout_seconds), output_format=self.profile.output_format,
                    )
                    progress.saved_output(storage_path)
                progress.complete()
            outcome = progress.outcome(max(1, round((perf_counter() - started_at) * 1000)))
            outcome.result.update(summary=f"{self.definition.provider_name} completed a live video.generate run.",
                                  payload_keys=list(payload.keys()))
            return outcome
        except Exception as exc:
            progress.failed(exc)
            raise ProviderExecutionError(str(exc), diagnostics=diagnostics,
                                         partial_outcome=progress.outcome()) from exc


def _ark_headers(profile: ImageProviderProfile) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {profile.api_key}",
        "Content-Type": "application/json",
    }


def _ark_video_request_body(profile: ImageProviderProfile, prompt: str, payload: dict) -> dict[str, object]:
    if isinstance(payload.get("request_body"), dict):
        body = dict(payload["request_body"])
        body.setdefault("model", profile.model_name)
        return body

    body: dict[str, object] = {
        "model": profile.model_name,
        "content": [{"type": "text", "text": prompt}],
    }
    if isinstance(payload.get("content"), list):
        body["content"] = payload["content"]
    if isinstance(payload.get("input"), dict):
        body["input"] = payload["input"]

    for key in ("duration", "seed", "fps", "watermark", "generate_audio"):
        if payload.get(key) not in {None, ""}:
            body[key] = payload[key]
    ratio = str(payload.get("ratio") or payload.get("aspect_ratio") or "").strip()
    if ratio:
        body["ratio"] = ratio
    resolution = str(payload.get("resolution") or payload.get("size") or "").strip()
    if resolution:
        body["resolution"] = resolution
    for key in ("resolution", "size"):
        if str(payload.get(key) or "").strip():
            body[key if key != "size" else "resolution"] = str(payload[key]).strip()
    if isinstance(payload.get("parameters"), dict):
        body.update(payload["parameters"])
    return body


def _submit_ark_video_task(profile: ImageProviderProfile, prompt: str, payload: dict) -> dict:
    request = Request(
        url=f"{profile.base_url.rstrip('/')}{ARK_VIDEO_TASKS_ENDPOINT_PATH}",
        data=json.dumps(_ark_video_request_body(profile, prompt, payload)).encode("utf-8"),
        headers=_ark_headers(profile),
        method="POST",
    )
    try:
        with urlopen(request, timeout=profile.timeout_seconds) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise ValueError(f"Ark video task submit failed with HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise ValueError(f"Ark video task submit request failed: {exc.reason}") from exc


def _poll_ark_video_result(profile: ImageProviderProfile, task_id: str) -> dict:
    if not task_id:
        raise ValueError(f"{profile.provider_name} did not return a task_id for async video generation")

    deadline = perf_counter() + max(float(profile.timeout_seconds), 180.0)
    last_payload: dict[str, object] = {}
    while perf_counter() < deadline:
        request = Request(
            url=f"{profile.base_url.rstrip('/')}{ARK_VIDEO_TASKS_ENDPOINT_PATH}/{task_id}",
            headers=_ark_headers(profile),
            method="GET",
        )
        try:
            with urlopen(request, timeout=profile.timeout_seconds) as response:
                last_payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise ValueError(f"Ark video task poll failed with HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise ValueError(f"Ark video task poll request failed: {exc.reason}") from exc

        status = _extract_task_status(last_payload)
        if status in _SUCCEEDED_STATUSES:
            return last_payload
        if status in _FAILED_STATUSES:
            raise UpstreamTaskFailed(f"Ark async video task failed: {last_payload}")
        sleep(5)

    raise ValueError(f"Ark async video task timed out before completion: {last_payload}")


def _extract_task_id(payload: dict) -> str:
    for source in _candidate_sources(payload):
        for key in ("id", "task_id"):
            value = str(source.get(key) or "").strip()
            if value:
                return value
    return ""


def _extract_task_status(payload: dict) -> str:
    for source in _candidate_sources(payload):
        for key in ("status", "task_status"):
            value = str(source.get(key) or "").strip()
            if value:
                return value.upper()
    return ""


def _extract_request_id(payload: dict) -> str:
    for source in _candidate_sources(payload):
        for key in ("request_id", "id"):
            value = str(source.get(key) or "").strip()
            if value:
                return value
    return ""


def _extract_usage(payload: dict) -> dict:
    for source in _candidate_sources(payload):
        usage = source.get("usage")
        if isinstance(usage, dict):
            return usage
    return {}


def _candidate_sources(payload: dict) -> list[dict]:
    sources = [payload]
    for key in ("data", "result", "output"):
        value = payload.get(key)
        if isinstance(value, dict):
            sources.append(value)
    return sources
