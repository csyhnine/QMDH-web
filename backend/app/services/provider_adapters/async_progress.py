"""Durable context for one accepted upstream task; no transport or storage I/O."""
from __future__ import annotations

from dataclasses import asdict
from hashlib import sha256
import json

from app.services.provider_adapters.base import ExecutionOutcome


class UpstreamTaskFailed(ValueError):
    """The upstream explicitly reported a terminal unsuccessful status."""


class AsyncTaskProgress:
    def __init__(self, *, task_id, saved, save, definition, profile, diagnostics, billing, query_context=None, result_fields=None):
        self.task_id, self.save = task_id, save
        self.definition, self.profile, self.diagnostics = definition, profile, diagnostics
        self.progress = json.loads(json.dumps(saved))
        self.identity = {
            "provider_name": definition.provider_name, "request_model": profile.model_name,
            "adapter_mode": diagnostics.adapter_mode,
            "endpoint_identity": sha256(diagnostics.request_url.encode()).hexdigest(),
        }
        if query_context is not None:
            self.identity["query_context"] = json.loads(json.dumps(query_context))
        if not self.progress:
            self.progress = {"version": 1, "kind": "async_task", "task_id": task_id,
                             **self.identity, "billing_template": billing, "steps": []}
            if result_fields:
                self.progress["result_fields"] = json.loads(json.dumps(result_fields))
        self.needs_review = False

    @property
    def step(self):
        return self.progress["steps"][0] if self.progress.get("steps") else {}

    def prepare(self):
        expected = {"version": 1, "kind": "async_task", "task_id": self.task_id, **self.identity}
        if any(self.progress.get(key) != value for key, value in expected.items()):
            raise RuntimeError("上游任务的供方、模型或接口配置已变化，请先核对原受理记录。")
        if self.step:
            if self.step["state"] == "failed":
                raise UpstreamTaskFailed("上游任务已明确失败，未重新提交。")
            if not self.step.get("upstream_task_id") and not self.step.get("polling_url"):
                raise RuntimeError("上次提交是否受理尚不明确，未自动重新提交。")
            self.checkpoint()  # Verify persistence/lease before a resumed GET/download.
            return self.step.get("upstream_task_id", "")
        self.progress["steps"] = [{"number": 1, "state": "submitting", "storage_paths": []}]
        self.checkpoint()
        return None

    def accepted(self, task_id, request_id="", *, polling_url=None):
        if not task_id and not polling_url:
            raise RuntimeError("上游响应缺少受理任务ID，提交状态待核对。")
        self.step.update(state="accepted", upstream_task_id=task_id)
        if polling_url:
            self.step["polling_url"] = polling_url
        if request_id:
            self.step["upstream_request_id"] = request_id
        self.checkpoint()

    def outputs(self, urls, *, status, usage, request_id=""):
        self.step.update(state="retrieving", output_urls=list(urls), upstream_status=status, usage=usage)
        if request_id:
            self.step["upstream_request_id"] = request_id
        self.checkpoint()

    def saved_output(self, path):
        self.step["storage_paths"].append(path)
        self.checkpoint()

    def complete(self):
        self.step["state"] = "completed"
        self.checkpoint()

    def failed(self, exc):
        if self.step.get("state") == "failed":
            self.needs_review = False
            return
        self.needs_review = not isinstance(exc, UpstreamTaskFailed)
        if self.step and self.step["state"] != "completed":
            self.step["state"] = "uncertain" if self.needs_review else "failed"

    def checkpoint(self):
        if self.save is not None:
            self.save(self.outcome())

    def outcome(self, latency_ms=1):
        step = self.step
        paths = list(step.get("storage_paths", []))
        unknown = step.get("state") != "completed" or self.needs_review
        billing = dict(self.progress["billing_template"])
        units = len(paths) if billing["pricing_unit"] in {"per_image", "per_video"} else int(bool(paths))
        billing.update(cost=round(float(billing["unit_price"]) * units, 4), billable_units=units,
                       amount_kind="configured_estimate", scope="logical_task",
                       additional_cost_unknown=unknown, cost_known=bool(paths) or not unknown)
        diagnostics = asdict(self.diagnostics)
        result = {
            **self.progress.get("result_fields", {}),
            "summary": "上游任务已保存执行进度。", "adapter_mode": self.progress["adapter_mode"],
            "generation_progress": json.loads(json.dumps(self.progress)),
            "storage_paths": paths, "output_count": len(paths), "billing": billing,
            "response_model": self.progress["request_model"],
            "response_models": [self.progress["request_model"]],
            "upstream_task_id": step.get("upstream_task_id", ""),
            "upstream_request_id": step.get("upstream_request_id", ""),
            "upstream_status": step.get("upstream_status", ""),
            "upstream_video_url_count": len(step.get("output_urls", [])), "requested_video_count": 1,
            "usage": step.get("usage", {}),
            "usage_records": [step["usage"]] if step.get("usage") else [],
            "partial_outputs": bool(paths) and unknown,
            "recovery_required": self.needs_review or step.get("state") not in {"completed", "failed"},
            **{"request_" + key: value for key, value in diagnostics.items()
               if key not in {"request_url", "effective_capability"}},
            "request_url": self.diagnostics.request_url,
            "effective_capability": self.diagnostics.effective_capability,
        }
        # Keep the existing diagnostic keys used by the executor and UI.
        result["request_endpoint"] = diagnostics["endpoint_path"]
        if self.diagnostics.effective_capability == "image.upscale":
            result.pop("requested_video_count", None)
            result.pop("upstream_video_url_count", None)
            result["requested_image_count"] = 1
            if step.get("output_urls"):
                result["upstream_output_url"] = step["output_urls"][0]
        if paths:
            result["storage_path"] = paths[0]
        if unknown:
            result["billing_note"] = "仅记录已知费用，未确认的上游费用待核对；0不表示免费。"
        return ExecutionOutcome(model_name=self.progress["request_model"], latency_ms=latency_ms,
                                cost=billing["cost"], cost_currency=billing["currency"],
                                outbound=self.definition.outbound, result=result)
