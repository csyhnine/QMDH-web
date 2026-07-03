"""Chat agent write tools: task proposals and confirmed submission (Phase B2)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.config import AuthUserProfile, settings
from app.integrations.studio_agent.tools import StudioToolContext
from app.models import Project, Task, TaskStatus, User, Workflow
from app.schemas import DataClassification, TaskCreate, TaskOut
from app.services.agent_policy_service import EffectiveChatPolicy
from app.services.billing import enforce_user_quota
from app.services.model_registry import get_provider_definition, get_provider_map
from app.services.task_executor import enqueue_task, execute_task, mark_task_enqueue_failed


VALID_ASPECT_RATIOS = frozenset({"1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"})
VALID_RESOLUTIONS = frozenset({"1k", "2k"})
WRITE_TOOL_BY_WORKFLOW = {
    "image-generate": "propose_image_generate_task",
    "image-edit": "propose_image_edit_task",
}


@dataclass(frozen=True)
class ChatAgentTaskProposal:
    proposal_id: str
    workflow_key: str
    title: str
    project_code: str
    requested_provider: str
    provider_display_name: str
    classification: str
    payload: dict[str, Any]
    summary: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "proposal_id": self.proposal_id,
            "workflow_key": self.workflow_key,
            "title": self.title,
            "project_code": self.project_code,
            "requested_provider": self.requested_provider,
            "provider_display_name": self.provider_display_name,
            "classification": self.classification,
            "payload": dict(self.payload),
            "summary": self.summary,
            "status": "pending_confirmation",
        }


def _normalize_resolution(value: str) -> str:
    normalized = str(value or "1k").strip().lower()
    return normalized if normalized in VALID_RESOLUTIONS else "1k"


def _normalize_aspect_ratio(value: str) -> str:
    normalized = str(value or "16:9").strip()
    return normalized if normalized in VALID_ASPECT_RATIOS else "16:9"


def _normalize_image_count(value: int) -> int:
    try:
        count = int(value)
    except (TypeError, ValueError):
        count = 1
    return max(1, min(3, count))


def _explicit_project_codes(auth_user: AuthUserProfile) -> tuple[str, ...]:
    return tuple(code for code in auth_user.project_codes if code and code != "*")


def _can_use_task_project(auth_user: AuthUserProfile, project: Project) -> bool:
    if auth_user.user_id is not None and project.owner_user_id == auth_user.user_id:
        return True
    return project.owner_user_id is None and project.code in set(_explicit_project_codes(auth_user))


def resolve_default_project_code(db: Session, *, user_id: int | None, auth_user: AuthUserProfile | None = None) -> str:
    if user_id is not None:
        user = db.get(User, user_id)
        if user is not None:
            for code in user.project_codes or []:
                project = db.scalar(
                    select(Project).where(
                        Project.code == str(code).strip(),
                        Project.archived_at.is_(None),
                    )
                )
                if project is not None:
                    if auth_user is None or _can_use_task_project(auth_user, project):
                        return project.code

            owned = db.scalar(
                select(Project)
                .where(
                    Project.owner_user_id == user_id,
                    Project.archived_at.is_(None),
                )
                .order_by(Project.id.asc())
            )
            if owned is not None:
                return owned.code

    if auth_user is not None:
        explicit = _explicit_project_codes(auth_user)
        if explicit:
            project = db.scalar(
                select(Project).where(
                    Project.code.in_(explicit),
                    Project.archived_at.is_(None),
                )
            )
            if project is not None:
                return project.code

    project = db.scalar(
        select(Project).where(Project.archived_at.is_(None)).order_by(Project.id.asc())
    )
    if project is None:
        raise ValueError("No active project is available for task submission.")
    return project.code


def _reference_image_storage_paths(payload: dict[str, Any]) -> list[str]:
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


def _reference_image_count(payload: dict[str, Any]) -> int:
    paths = _reference_image_storage_paths(payload)
    return min(4, len(paths)) if paths else 0


def _task_payload_result_fields(payload: dict[str, Any]) -> dict[str, str]:
    return {
        "prompt": str(payload.get("prompt") or "").strip(),
        "edit_prompt": str(payload.get("edit_prompt") or "").strip(),
        "style": str(payload.get("style") or "").strip(),
        "aspect_ratio": str(payload.get("aspect_ratio") or "").strip(),
        "resolution": str(payload.get("resolution") or "").strip(),
        "deliverable": str(payload.get("deliverable") or "").strip(),
        "prompt_supplement": str(payload.get("prompt_supplement") or "").strip(),
    }


def _get_or_create_user(db: Session, auth_user: AuthUserProfile) -> User:
    user = db.scalar(select(User).where(User.name == auth_user.name))
    if user:
        if user.role != auth_user.role:
            user.role = auth_user.role
        return user

    user = User(name=auth_user.name, role=auth_user.role)
    db.add(user)
    db.flush()
    return user


def _to_task_out(task: Task) -> TaskOut:
    from app.services.media_storage import resolve_storage_payload

    return TaskOut(
        id=task.id,
        title=task.title,
        status=task.status,
        workflow_key=task.workflow.key,
        workflow_name=task.workflow.name,
        project_code=task.project.code,
        user_name=task.user.name,
        requested_provider=task.requested_provider,
        classification=task.classification,
        cost=task.cost,
        cost_currency=task.cost_currency or "CNY",
        latency_ms=task.latency_ms,
        result=resolve_storage_payload(task.result),
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def _validate_write_tool_allowed(policy: EffectiveChatPolicy, workflow_key: str) -> None:
    tool_key = WRITE_TOOL_BY_WORKFLOW.get(workflow_key)
    if not tool_key:
        raise ValueError(f"Unsupported workflow: {workflow_key}")
    if tool_key not in policy.chat_tool_allowlist:
        raise ValueError(f"Tool {tool_key} is not enabled for this user.")


def resolve_requested_provider_name(db: Session, requested: str) -> str:
    raw = str(requested or "").strip()
    if not raw:
        raise ValueError("requested_provider is required")

    provider_map = get_provider_map(db)
    if raw in provider_map:
        return raw

    lowered = raw.lower()
    matches: list[str] = []
    for name, definition in provider_map.items():
        candidates = {
            name.lower(),
            (definition.display_name or "").lower(),
            (definition.model_name or "").lower(),
        }
        if lowered in candidates or any(lowered in candidate for candidate in candidates if candidate):
            matches.append(name)

    unique = list(dict.fromkeys(matches))
    if len(unique) == 1:
        return unique[0]
    if len(unique) > 1:
        raise ValueError(
            f"Ambiguous provider {raw!r}; use provider_name exactly. Options: {', '.join(unique[:5])}"
        )

    enabled = [
        name
        for name, definition in provider_map.items()
        if any(capability.startswith("image.") for capability in definition.capabilities)
    ]
    hint = ", ".join(enabled[:6]) or "none enabled"
    raise ValueError(f"Provider not found: {raw}. Enabled image providers: {hint}")


def _validate_task_inputs(
    db: Session,
    *,
    workflow_key: str,
    project_code: str,
    requested_provider: str,
    payload: dict[str, Any],
    auth_user: AuthUserProfile | None = None,
) -> tuple[Workflow, Project, str]:
    workflow = db.scalar(select(Workflow).where(Workflow.key == workflow_key))
    if not workflow:
        raise ValueError(f"Workflow not found: {workflow_key}")

    provider_map = get_provider_map(db)
    resolved_provider = resolve_requested_provider_name(db, requested_provider)

    provider = get_provider_definition(resolved_provider, db)
    if workflow.provider_capability not in provider.capabilities:
        raise ValueError("Provider does not support workflow capability")

    project = db.scalar(
        select(Project).where(
            Project.code == project_code.strip(),
            Project.archived_at.is_(None),
        )
    )
    if not project:
        raise ValueError(f"Project not found: {project_code}")
    if auth_user is not None and not _can_use_task_project(auth_user, project):
        raise ValueError("Project access denied")

    prompt = str(payload.get("prompt") or payload.get("edit_prompt") or "").strip()
    if not prompt:
        raise ValueError("Prompt is required.")

    if workflow_key == "image-edit" and _reference_image_count(payload) < 1:
        raise ValueError("Image edit requires at least one reference image path.")

    display_name = provider_map[resolved_provider].display_name or resolved_provider
    return workflow, project, display_name


def build_image_generate_proposal(
    ctx: StudioToolContext,
    *,
    prompt: str,
    requested_provider: str,
    aspect_ratio: str = "16:9",
    resolution: str = "1k",
    image_count: int = 1,
    title: str = "",
    project_code: str = "",
) -> ChatAgentTaskProposal:
    cleaned_prompt = str(prompt or "").strip()
    if len(cleaned_prompt) < 3:
        raise ValueError("Prompt must be at least 3 characters.")

    resolved_project = (project_code or "").strip()
    if not resolved_project:
        resolved_project = resolve_default_project_code(ctx.db, user_id=ctx.user_id)

    resolved_provider = resolve_requested_provider_name(ctx.db, requested_provider)
    payload = {
        "prompt": cleaned_prompt,
        "aspect_ratio": _normalize_aspect_ratio(aspect_ratio),
        "resolution": _normalize_resolution(resolution),
        "image_count": _normalize_image_count(image_count),
    }
    _, _, display_name = _validate_task_inputs(
        ctx.db,
        workflow_key="image-generate",
        project_code=resolved_project,
        requested_provider=resolved_provider,
        payload=payload,
    )

    task_title = (title or "").strip() or cleaned_prompt[:48]
    if len(task_title) < 3:
        task_title = cleaned_prompt[:48] or "Chat 生图任务"

    summary = (
        f"{payload['aspect_ratio']} · {payload['resolution'].upper()} · "
        f"{display_name} · {resolved_project}"
    )
    return ChatAgentTaskProposal(
        proposal_id=str(uuid.uuid4()),
        workflow_key="image-generate",
        title=task_title[:150],
        project_code=resolved_project,
        requested_provider=resolved_provider,
        provider_display_name=display_name,
        classification=DataClassification.b.value,
        payload=payload,
        summary=summary,
    )


def build_image_edit_proposal(
    ctx: StudioToolContext,
    *,
    edit_prompt: str,
    requested_provider: str,
    reference_image: str,
    aspect_ratio: str = "16:9",
    resolution: str = "1k",
    title: str = "",
    project_code: str = "",
) -> ChatAgentTaskProposal:
    cleaned_prompt = str(edit_prompt or "").strip()
    reference_path = str(reference_image or "").strip()
    if len(cleaned_prompt) < 3:
        raise ValueError("Edit prompt must be at least 3 characters.")
    if not reference_path:
        raise ValueError("reference_image is required for image edit.")

    resolved_project = (project_code or "").strip()
    if not resolved_project:
        resolved_project = resolve_default_project_code(ctx.db, user_id=ctx.user_id)

    resolved_provider = resolve_requested_provider_name(ctx.db, requested_provider)
    payload = {
        "edit_prompt": cleaned_prompt,
        "prompt": cleaned_prompt,
        "reference_image": reference_path,
        "aspect_ratio": _normalize_aspect_ratio(aspect_ratio),
        "resolution": _normalize_resolution(resolution),
        "image_count": 1,
    }
    _, _, display_name = _validate_task_inputs(
        ctx.db,
        workflow_key="image-edit",
        project_code=resolved_project,
        requested_provider=resolved_provider,
        payload=payload,
    )

    task_title = (title or "").strip() or cleaned_prompt[:48]
    if len(task_title) < 3:
        task_title = cleaned_prompt[:48] or "Chat 改图任务"

    summary = (
        f"改图 · {payload['aspect_ratio']} · {payload['resolution'].upper()} · "
        f"{display_name} · {resolved_project}"
    )
    return ChatAgentTaskProposal(
        proposal_id=str(uuid.uuid4()),
        workflow_key="image-edit",
        title=task_title[:150],
        project_code=resolved_project,
        requested_provider=resolved_provider,
        provider_display_name=display_name,
        classification=DataClassification.b.value,
        payload=payload,
        summary=summary,
    )


def submit_confirmed_chat_agent_task(
    db: Session,
    *,
    auth_user: AuthUserProfile,
    policy: EffectiveChatPolicy,
    proposal: ChatAgentTaskProposal,
    background_tasks: BackgroundTasks | None = None,
) -> TaskOut:
    _validate_write_tool_allowed(policy, proposal.workflow_key)
    _validate_task_inputs(
        db,
        workflow_key=proposal.workflow_key,
        project_code=proposal.project_code,
        requested_provider=proposal.requested_provider,
        payload=proposal.payload,
        auth_user=auth_user,
    )

    user = _get_or_create_user(db, auth_user)
    enforce_user_quota(db, user=user)
    reference_image_storage_paths = _reference_image_storage_paths(proposal.payload)

    workflow = db.scalar(select(Workflow).where(Workflow.key == proposal.workflow_key))
    project = db.scalar(
        select(Project).where(
            Project.code == proposal.project_code,
            Project.archived_at.is_(None),
        )
    )
    assert workflow is not None and project is not None

    task = Task(
        title=proposal.title,
        status=TaskStatus.pending,
        workflow_id=workflow.id,
        project_id=project.id,
        user_id=user.id,
        requested_provider=proposal.requested_provider,
        classification=DataClassification(proposal.classification),
        payload=proposal.payload,
        result={
            "summary": "Task accepted from Chat agent confirmation.",
            "reference_image_supplied": _reference_image_count(proposal.payload) > 0,
            "reference_image_count": _reference_image_count(proposal.payload),
            "reference_image_storage_path": reference_image_storage_paths[0] if reference_image_storage_paths else "",
            "reference_image_storage_paths": reference_image_storage_paths,
            "requested_image_count": int(proposal.payload.get("image_count") or 1),
            "queued_stage": "accepted",
            "chat_agent_proposal_id": proposal.proposal_id,
            **_task_payload_result_fields(proposal.payload),
        },
    )
    db.add(task)
    db.flush()
    db.commit()
    db.refresh(task)

    if settings.task_execution_mode == "sync":
        execute_task(task.id)
    elif settings.task_execution_mode == "redis":
        try:
            enqueue_task(task.id)
        except Exception as exc:
            failure = mark_task_enqueue_failed(db, task, exc)
            db.commit()
            raise HTTPException(status_code=503, detail=str(failure["error_summary"])) from exc
    elif background_tasks is not None:
        background_tasks.add_task(execute_task, task.id)
    else:
        execute_task(task.id)

    db.refresh(task)
    return _to_task_out(task)


def proposal_from_confirm_payload(payload: TaskCreate | dict[str, Any]) -> ChatAgentTaskProposal:
    if isinstance(payload, TaskCreate):
        data = payload.model_dump()
    else:
        data = dict(payload)

    proposal_id = str(data.get("proposal_id") or uuid.uuid4())
    workflow_key = str(data.get("workflow_key") or "").strip()
    title = str(data.get("title") or "").strip()
    project_code = str(data.get("project_code") or "").strip()
    requested_provider = str(data.get("requested_provider") or "").strip()
    raw_classification = data.get("classification") or DataClassification.b
    if isinstance(raw_classification, DataClassification):
        classification = raw_classification.value
    else:
        classification = str(raw_classification).strip().upper() or DataClassification.b.value
    task_payload = data.get("payload") if isinstance(data.get("payload"), dict) else {}

    provider_display_name = str(data.get("provider_display_name") or requested_provider).strip()
    summary = str(data.get("summary") or "").strip()
    if not summary:
        aspect_ratio = str(task_payload.get("aspect_ratio") or "16:9")
        resolution = str(task_payload.get("resolution") or "1k").upper()
        summary = f"{aspect_ratio} · {resolution} · {provider_display_name} · {project_code}"

    return ChatAgentTaskProposal(
        proposal_id=proposal_id,
        workflow_key=workflow_key,
        title=title,
        project_code=project_code,
        requested_provider=requested_provider,
        provider_display_name=provider_display_name,
        classification=classification,
        payload=task_payload,
        summary=summary,
    )
