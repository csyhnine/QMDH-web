"""Record and sync generation intents from task submissions."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import GenerationIntent, Task, TaskStatus, Workflow
from app.services.generation_fingerprints import prompt_fingerprint, ref_fingerprint
from app.services.generation_outcome_service import record_generation_outcome_from_task_payload
from app.services.generation_session_service import assign_intent_to_session

SESSION_GAP_MINUTES = 30

_WORKFLOW_CREATION_MODE = {
    "image-generate": "generate",
    "image-edit": "edit",
    "video-generate": "video",
    "image-upscale": "upscale",
}


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def extract_prompt_text(payload: dict) -> str:
    for key in ("prompt", "edit_prompt", "motion_prompt", "video_prompt"):
        value = str(payload.get(key) or "").strip()
        if value:
            return value
    return ""


def extract_reference_paths(payload: dict) -> list[str]:
    for key in ("reference_images", "source_images"):
        raw = payload.get(key)
        if isinstance(raw, list):
            cleaned = [str(item or "").strip() for item in raw]
            values = [item for item in cleaned if item]
            if values:
                return values[:4]
    for key in ("reference_image", "source_image", "image"):
        value = str(payload.get(key) or "").strip()
        if value:
            return [value]
    return []


def infer_creation_mode(workflow_key: str, payload: dict) -> str:
    mapped = _WORKFLOW_CREATION_MODE.get(workflow_key.strip())
    if mapped:
        return mapped
    if extract_reference_paths(payload):
        return "edit"
    return "generate"


def task_has_asset_result(result: dict | None) -> bool:
    if not isinstance(result, dict):
        return False
    if result.get("asset_id") or result.get("asset_storage_path"):
        return True
    for key in ("asset_ids", "asset_storage_paths", "storage_paths"):
        raw = result.get(key)
        if isinstance(raw, list) and any(str(item or "").strip() for item in raw):
            return True
    return False


def record_generation_intent_for_task(
    db: Session,
    *,
    task: Task,
    workflow_key: str,
    template_id: int | None = None,
    source_surface: str = "studio",
    canvas_node_id: str | None = None,
    prompt_polished: bool = False,
) -> GenerationIntent | None:
    existing = db.scalar(select(GenerationIntent).where(GenerationIntent.task_id == task.id))
    if existing is not None:
        return existing

    payload = task.payload if isinstance(task.payload, dict) else {}
    prompt_raw = extract_prompt_text(payload)
    ref_paths = extract_reference_paths(payload)
    prompt_fp = prompt_fingerprint(prompt_raw)
    ref_fp = ref_fingerprint(ref_paths)
    submitted_at = _utc(task.created_at) or datetime.now(timezone.utc)

    intent = GenerationIntent(
        task_id=task.id,
        user_id=task.user_id,
        project_id=task.project_id,
        template_id=template_id,
        source_surface=(source_surface or "studio").strip() or "studio",
        canvas_node_id=(canvas_node_id or "").strip() or None,
        creation_mode=infer_creation_mode(workflow_key, payload),
        workflow_key=workflow_key,
        prompt_raw=prompt_raw,
        prompt_fingerprint=prompt_fp,
        ref_fingerprint=ref_fp,
        ref_paths=ref_paths,
        requested_provider=task.requested_provider,
        submitted_at=submitted_at,
        task_status=task.status.value if isinstance(task.status, TaskStatus) else str(task.status),
        has_asset=task_has_asset_result(task.result if isinstance(task.result, dict) else None),
    )
    if prompt_polished:
        intent.outcome_signals = {
            **(intent.outcome_signals or {}),
            "submission": {"prompt_polished": True},
        }
    db.add(intent)
    db.flush()
    assign_intent_to_session(db, intent)
    record_generation_outcome_from_task_payload(db, task=task)
    return intent


def sync_generation_intent_from_task(db: Session, task: Task) -> GenerationIntent | None:
    intent = db.scalar(select(GenerationIntent).where(GenerationIntent.task_id == task.id))
    if intent is None:
        workflow = db.get(Workflow, task.workflow_id)
        workflow_key = workflow.key if workflow else ""
        return record_generation_intent_for_task(db, task=task, workflow_key=workflow_key)

    status_value = task.status.value if isinstance(task.status, TaskStatus) else str(task.status)
    intent.task_status = status_value
    intent.has_asset = task_has_asset_result(task.result if isinstance(task.result, dict) else None)
    if status_value in {TaskStatus.completed.value, TaskStatus.failed.value}:
        intent.completed_at = _utc(task.updated_at) or datetime.now(timezone.utc)
    db.flush()
    if intent.session_id is not None:
        from app.services.generation_session_service import recompute_session_metrics

        recompute_session_metrics(db, intent.session_id)
    return intent


def backfill_generation_intents(db: Session, *, limit: int = 1000) -> dict[str, int]:
    """Create intents for historical tasks that predate analytics rollout."""
    existing_task_ids = set(db.scalars(select(GenerationIntent.task_id)).all())
    tasks = db.scalars(
        select(Task)
        .where(Task.deleted_at.is_(None))
        .order_by(Task.created_at.desc())
        .limit(max(limit, 1))
    ).all()

    created = 0
    skipped = 0
    for task in tasks:
        if task.id in existing_task_ids:
            skipped += 1
            continue
        workflow = db.get(Workflow, task.workflow_id)
        workflow_key = workflow.key if workflow else ""
        record_generation_intent_for_task(db, task=task, workflow_key=workflow_key)
        sync_generation_intent_from_task(db, task)
        created += 1

    return {"created": created, "skipped": skipped, "scanned": len(tasks)}
