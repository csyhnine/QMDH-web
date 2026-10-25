"""Finalize known Comfy batch outputs in the caller's transaction; no media I/O."""
from pathlib import PurePosixPath
from uuid import UUID

from app.models import Project, TaskStatus, Workflow
from app.services.generation_intent_service import sync_generation_intent_from_task
from app.services.usage_ledger import ensure_usage_ledger_for_task


class ComfyPartialOutputsInvalid(ValueError):
    """Saved output metadata requires reconciliation before closing."""


def finalize_closed_comfy_task(db, task, *, note):
    from app.services.task_executor import _materialize_assets

    result = dict(task.result or {})
    saved = result.get("comfyui")
    outputs = saved.get("batch_outputs", []) if isinstance(saved, dict) else None
    if not isinstance(outputs, list):
        raise ComfyPartialOutputsInvalid("保存的本机批次记录不完整，请先核对产物。")
    requested = int(task.payload.get("image_count", 1))
    if saved.get("stage") == "downloaded" or len(outputs) >= requested:
        raise ComfyPartialOutputsInvalid("服务器已有完整结果，请恢复入库，不能关闭。")
    paths = []
    prefix = f"generated/comfyui/task-{task.id}/"
    for output in outputs:
        path = output.get("storage_path") if isinstance(output, dict) else None
        if not isinstance(path, str) or not path.startswith(prefix):
            raise ComfyPartialOutputsInvalid("保存的批次缺少当前任务产物路径，请先核对。")
        filename = path[len(prefix):]
        try:
            parsed = PurePosixPath(filename)
            if parsed.name != filename or parsed.suffix not in {".png", ".jpg", ".webp"} or str(UUID(parsed.stem)) != parsed.stem:
                raise ValueError("Invalid saved output name")
        except ValueError as exc:
            raise ComfyPartialOutputsInvalid("保存的批次产物标识不完整，请先核对。") from exc
        if path not in paths:
            paths.append(path)
    previous_paths = result.get("storage_paths", [])
    if not isinstance(previous_paths, list) or any(path not in paths for path in previous_paths):
        raise ComfyPartialOutputsInvalid("已有结果与批次产物不一致，请先核对，不能覆盖。")
    if result.get("storage_path") and result["storage_path"] not in paths:
        raise ComfyPartialOutputsInvalid("已有单张结果与批次产物不一致，请先核对。")
    workflow, project = db.get(Workflow, task.workflow_id), db.get(Project, task.project_id)
    if workflow is None or project is None:
        raise ComfyPartialOutputsInvalid("任务依赖不完整，不能完成产物入库。")

    billing = dict(result.get("billing") or {})
    billing.update(cost=float(task.cost or 0), currency=task.cost_currency or "CNY")
    billing.setdefault("cost_known", bool(task.cost))
    billing.setdefault("additional_cost_unknown", not billing["cost_known"])
    if not billing["cost_known"]:
        billing.setdefault("note", "Local GPU price not configured; zero is not a free-cost assertion")
    error = "管理员核对后关闭了未完成的本机任务。"
    result.update(
        adapter_mode="comfyui", queued_stage="failed", error=error, error_summary=error,
        error_code="comfyui_recovery_closed", error_stage="manual_recovery", recovery_note=note,
        summary=f"本机任务已关闭，保留已完成的 {len(paths)}/{requested} 张图片。",
        storage_paths=paths, output_count=len(paths), requested_image_count=requested,
        partial_outputs=bool(paths), billing=billing,
    )
    for field in ("storage_path", "asset_id", "asset_storage_path"):
        result.pop(field, None)
    result.update(asset_ids=[], asset_storage_paths=[])
    if paths:
        result["storage_path"] = paths[0]
    if billing["additional_cost_unknown"]:
        result.setdefault("billing_note", "保留已知费用，未确认的本机费用待核对；0不表示免费。")
    task.status, task.result = TaskStatus.failed, result
    assets = _materialize_assets(db, task, workflow, project)
    if assets:
        task.result = {**task.result, "asset_id": assets[0].id, "asset_ids": [asset.id for asset in assets],
                       "asset_storage_path": assets[0].storage_path, "asset_storage_paths": [asset.storage_path for asset in assets]}
    ledger = ensure_usage_ledger_for_task(db, task, ledger_source="task.comfyui.recovery.close")
    ledger.usage_payload = {
        **(ledger.usage_payload or {}), "billing": dict(billing),
        "billing_note": task.result.get("billing_note", ""),
        "comfyui_partial_close": {"storage_paths": list(paths), "output_count": len(paths),
                                 "requested_image_count": requested, "partial_outputs": bool(paths)},
    }
    intent = sync_generation_intent_from_task(db, task)
    if intent is not None and intent.completed_at is None:
        # Creating a missing intent records its submission; sync the new row's
        # terminal timestamp through the existing service as well.
        sync_generation_intent_from_task(db, task)
