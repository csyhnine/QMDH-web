from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from time import perf_counter, sleep
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
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
from app.services.provider_strategy import VOLCENGINE_CV_JIMENG_VIDEO_STRATEGY, resolve_strategy_for_capability

_SUCCEEDED_STATUSES = {"DONE", "SUCCEEDED", "SUCCESS", "COMPLETED"}
_FAILED_STATUSES = {"FAILED", "FAILURE", "CANCELED", "CANCELLED"}


class VolcengineJimengVideoProviderAdapter:
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
        if strategy != VOLCENGINE_CV_JIMENG_VIDEO_STRATEGY:
            raise ValueError(f"{self.definition.provider_name} does not define a Jimeng video strategy")
        if not self.profile.api_secret:
            raise ValueError(f"{self.profile.provider_name} requires api_secret for Volcengine CV signing")

        prompt = video_prompt(payload)
        if not prompt:
            raise ValueError("Video task payload is missing prompt")

        adapter_config = self.profile.adapter_config or {}
        submit_action = str(adapter_config.get("submit_action") or "CVSync2AsyncSubmitTask")
        result_action = str(adapter_config.get("result_action") or "CVSync2AsyncGetResult")
        version = str(adapter_config.get("version") or "2022-08-31")
        diagnostics = RequestDiagnostics(
            strategy=VOLCENGINE_CV_JIMENG_VIDEO_STRATEGY,
            endpoint_path=f"/?Action={submit_action}&Version={version}",
            request_url=f"{self.profile.base_url.rstrip('/')}?Action={submit_action}&Version={version}",
            timeout_seconds=float(self.profile.timeout_seconds),
            adapter_mode="volcengine_cv_jimeng_video",
            effective_capability="video.generate",
        )

        try:
            started_at = perf_counter()
            submit_payload = _submit_jimeng_video_task(self.profile, prompt, payload)
            upstream_task_id = _extract_task_id(submit_payload)
            final_payload = _poll_jimeng_video_result(self.profile, upstream_task_id, result_action=result_action, version=version)
            video_urls = extract_video_urls(final_payload)
            if not video_urls:
                raise ValueError(f"Jimeng async video task succeeded but returned no video outputs: {final_payload}")

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
                "adapter_mode": "volcengine_cv_jimeng_video",
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


def _jimeng_config(profile: ImageProviderProfile) -> dict:
    config = profile.adapter_config or {}
    return {
        "service": str(config.get("service") or "cv"),
        "region": str(config.get("region") or "cn-north-1"),
        "version": str(config.get("version") or "2022-08-31"),
        "submit_action": str(config.get("submit_action") or "CVSync2AsyncSubmitTask"),
        "result_action": str(config.get("result_action") or "CVSync2AsyncGetResult"),
        "req_key": str(config.get("req_key") or profile.model_name).strip(),
    }


def _jimeng_video_submit_body(profile: ImageProviderProfile, prompt: str, payload: dict) -> dict[str, object]:
    if isinstance(payload.get("request_body"), dict):
        body = dict(payload["request_body"])
    else:
        config = _jimeng_config(profile)
        body = {
            "req_key": config["req_key"],
            "prompt": prompt,
        }
        if str(payload.get("aspect_ratio") or "").strip():
            body["aspect_ratio"] = str(payload["aspect_ratio"]).strip()
        if str(payload.get("resolution") or "").strip():
            body["resolution"] = str(payload["resolution"]).strip()
        for key in ("seed", "frames", "duration", "fps"):
            if payload.get(key) not in {None, ""}:
                body[key] = payload[key]
        if isinstance(payload.get("parameters"), dict):
            body.update(payload["parameters"])
    return body


def _submit_jimeng_video_task(profile: ImageProviderProfile, prompt: str, payload: dict) -> dict:
    config = _jimeng_config(profile)
    return _signed_cv_request(
        profile,
        action=config["submit_action"],
        version=config["version"],
        body=_jimeng_video_submit_body(profile, prompt, payload),
    )


def _poll_jimeng_video_result(profile: ImageProviderProfile, task_id: str, *, result_action: str, version: str) -> dict:
    if not task_id:
        raise ValueError(f"{profile.provider_name} did not return a task_id for async video generation")

    config = _jimeng_config(profile)
    deadline = perf_counter() + max(float(profile.timeout_seconds), 180.0)
    last_payload: dict[str, object] = {}
    while perf_counter() < deadline:
        last_payload = _signed_cv_request(
            profile,
            action=result_action,
            version=version,
            body={"req_key": config["req_key"], "task_id": task_id},
        )
        status = _extract_task_status(last_payload)
        if status in _SUCCEEDED_STATUSES:
            return last_payload
        if status in _FAILED_STATUSES:
            raise ValueError(f"Jimeng async video task failed: {last_payload}")
        sleep(5)

    raise ValueError(f"Jimeng async video task timed out before completion: {last_payload}")


def _signed_cv_request(profile: ImageProviderProfile, *, action: str, version: str, body: dict[str, object]) -> dict:
    body_bytes = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    query = {"Action": action, "Version": version}
    query_string = urlencode(query)
    url = f"{profile.base_url.rstrip('/')}?{query_string}"
    headers = _volcengine_signed_headers(
        profile=profile,
        method="POST",
        query_string=query_string,
        body_bytes=body_bytes,
    )
    request = Request(url=url, data=body_bytes, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=profile.timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise ValueError(f"Jimeng video task {action} failed with HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise ValueError(f"Jimeng video task {action} request failed: {exc.reason}") from exc
    code = payload.get("code") if isinstance(payload, dict) else None
    if code not in {None, 10000, "10000"}:
        message = str(payload.get("message") or payload.get("Message") or "").strip()
        request_id = str(payload.get("request_id") or payload.get("RequestId") or "").strip()
        detail = f"code={code}"
        if message:
            detail += f", message={message}"
        if request_id:
            detail += f", request_id={request_id}"
        raise ValueError(f"Jimeng video task {action} returned an upstream error: {detail}")
    return payload


def _volcengine_signed_headers(
    *,
    profile: ImageProviderProfile,
    method: str,
    query_string: str,
    body_bytes: bytes,
) -> dict[str, str]:
    config = _jimeng_config(profile)
    now = datetime.now(timezone.utc)
    date_stamp = now.strftime("%Y%m%d")
    x_date = now.strftime("%Y%m%dT%H%M%SZ")
    body_hash = hashlib.sha256(body_bytes).hexdigest()
    host = profile.base_url.replace("https://", "").replace("http://", "").split("/", 1)[0]
    canonical_headers = f"host:{host}\nx-content-sha256:{body_hash}\nx-date:{x_date}\n"
    signed_headers = "host;x-content-sha256;x-date"
    canonical_request = "\n".join(
        [
            method,
            "/",
            query_string,
            canonical_headers,
            signed_headers,
            body_hash,
        ]
    )
    credential_scope = f"{date_stamp}/{config['region']}/{config['service']}/request"
    string_to_sign = "\n".join(
        [
            "HMAC-SHA256",
            x_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    signing_key = _volcengine_signing_key(profile.api_secret, date_stamp, config["region"], config["service"])
    signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    authorization = (
        f"HMAC-SHA256 Credential={profile.api_key}/{credential_scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    return {
        "Content-Type": "application/json",
        "Host": host,
        "X-Date": x_date,
        "X-Content-Sha256": body_hash,
        "Authorization": authorization,
    }


def _volcengine_signing_key(secret_key: str, date_stamp: str, region: str, service: str) -> bytes:
    k_date = hmac.new(secret_key.encode("utf-8"), date_stamp.encode("utf-8"), hashlib.sha256).digest()
    k_region = hmac.new(k_date, region.encode("utf-8"), hashlib.sha256).digest()
    k_service = hmac.new(k_region, service.encode("utf-8"), hashlib.sha256).digest()
    return hmac.new(k_service, b"request", hashlib.sha256).digest()


def _extract_task_id(payload: dict) -> str:
    for source in _candidate_sources(payload):
        for key in ("task_id", "id"):
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
