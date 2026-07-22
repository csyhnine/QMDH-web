from __future__ import annotations

from base64 import b64decode
from datetime import datetime, timezone
import mimetypes
import re
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit_log
from app.core.auth import AgentAuthProfile, get_current_agent_auth, get_current_auth_user, require_ops_access
from app.core.config import settings
from app.database import get_db
from app.models import AgentClient, AgentJob, AgentPolicyOverride, AgentSkillRelease, Asset, Conversation, InspirationPost, Project, ProjectResearchNote, Task, TaskStatus, User, Workflow
from app.schemas import (
    AdminAgentTraceOut,
    AdminChatConversationOut,
    AgentChatToolOut,
    AgentClientOut,
    AgentImageTaskCreate,
    AgentInspirationImportIn,
    AgentJobCompleteIn,
    AgentJobOut,
    AgentOfficialSkillCreate,
    AgentOfficialSkillOut,
    AgentOfficialSkillUpdate,
    AgentPolicyOverrideCreate,
    AgentPolicyOverrideOut,
    AgentPolicyOverrideUpdate,
    AgentProjectArtifactCreate,
    AgentResearchNoteCreate,
    AgentSkillFileContentOut,
    AgentSkillInstallCandidate,
    AgentSkillInstallRequest,
    AgentSkillInstallResult,
    AgentSkillReleaseCreate,
    AgentSkillReleaseOut,
    AgentSkillReleaseUpdate,
    AgentWorkflowIntentCreate,
    AssetType,
    ChatAgentPolicyDefaultsOut,
    ChatMessageOut,
    InspirationPostCreate,
)
from app.services.agent_admin_service import (
    list_admin_agent_traces,
    list_admin_chat_conversations,
    list_admin_chat_messages,
)
from app.services.agent_policy_service import (
    CHAT_AGENT_BASELINE_PROMPT,
    CHAT_AGENT_DATA_SCOPE_NOTE,
    DEFAULT_CHAT_TOOL_ALLOWLIST,
    list_chat_tool_catalog,
    normalize_chat_tool_allowlist,
    normalize_disabled_tool_keys,
)
from app.services.agent_skill_registry import list_official_skills
from app.services.inspiration_media import prepare_inspiration_image
from app.services.media_storage import resolve_storage_payload, resolve_storage_path, write_binary_asset
from app.services.model_registry import get_provider_definition, get_provider_map
from app.services.task_executor import enqueue_task, execute_task, mark_task_enqueue_failed

router = APIRouter(prefix="/agent", tags=["agent"])

_DATA_URL_PATTERN = re.compile(r"^data:(?P<mime>[-\w.+/]+);base64,(?P<payload>.+)$")


def _request_id(request: Request) -> str:
    return request.headers.get("x-request-id") or str(uuid.uuid4())


def _project_codes(agent_auth: AgentAuthProfile) -> tuple[str, ...]:
    return tuple(code for code in agent_auth.project_codes if code)


def _ensure_agent_project_access(agent_auth: AgentAuthProfile, project: Project) -> None:
    codes = _project_codes(agent_auth)
    if "*" in codes:
        return
    if project.code not in codes:
        raise HTTPException(status_code=403, detail="Agent project access denied")


def _resolve_project(db: Session, agent_auth: AgentAuthProfile, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if not project or project.archived_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    _ensure_agent_project_access(agent_auth, project)
    return project


def _get_or_create_agent_user(db: Session, agent_auth: AgentAuthProfile) -> User:
    if agent_auth.user_id is not None:
        user = db.get(User, agent_auth.user_id)
        if user:
            return user

    user = db.scalar(select(User).where(User.name == agent_auth.user_name))
    if user:
        return user

    user = User(
        name=agent_auth.user_name,
        display_name=agent_auth.display_name or agent_auth.user_name,
        role=agent_auth.user_role,
        is_active=True,
        project_codes=list(_project_codes(agent_auth)),
    )
    db.add(user)
    db.flush()
    return user


def _reference_image_count(payload: dict) -> int:
    for key in ("reference_images", "source_images"):
        raw_value = payload.get(key)
        if isinstance(raw_value, list):
            cleaned = [str(item or "").strip() for item in raw_value if str(item or "").strip()]
            if cleaned:
                return min(4, len(cleaned))
    for key in ("reference_image", "source_image"):
        if str(payload.get(key) or "").strip():
            return 1
    return 0


def _reference_image_storage_paths(payload: dict) -> list[str]:
    for key in ("reference_images", "source_images"):
        raw_value = payload.get(key)
        if isinstance(raw_value, list):
            cleaned = [str(item or "").strip() for item in raw_value if str(item or "").strip()]
            if cleaned:
                return cleaned[:4]
    for key in ("reference_image", "source_image", "image"):
        value = str(payload.get(key) or "").strip()
        if value:
            return [value]
    return []


def _task_job_status(task_status: TaskStatus) -> str:
    if task_status == TaskStatus.running:
        return "running"
    if task_status == TaskStatus.completed:
        return "completed"
    if task_status == TaskStatus.failed:
        return "failed"
    return "accepted"


def _decode_data_url(data_url: str) -> tuple[str, bytes]:
    matched = _DATA_URL_PATTERN.match(data_url.strip())
    if not matched:
        raise HTTPException(status_code=400, detail="Artifact must be a base64 data URL")
    mime = matched.group("mime")
    try:
        content = b64decode(matched.group("payload"), validate=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Artifact payload is invalid") from exc
    return mime, content


def _write_agent_artifact(project: Project, payload: AgentProjectArtifactCreate) -> str:
    if payload.data_url:
        mime, content = _decode_data_url(payload.data_url)
        extension = mimetypes.guess_extension(mime) or ".bin"
        if extension == ".jpe":
            extension = ".jpeg"
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        safe_name = "".join(char if char.isalnum() else "-" for char in payload.name.lower()).strip("-") or "artifact"
        relative_path = f"agent-artifacts/{project.code}/{timestamp}-{safe_name[:60]}{extension}"
        return write_binary_asset(relative_path, content)
    if payload.storage_path:
        return payload.storage_path
    raise HTTPException(status_code=400, detail="Either data_url or storage_path is required")


def _sync_job_from_task(db: Session, job: AgentJob) -> AgentJob:
    if not job.task_id:
        return job
    task = db.get(Task, job.task_id)
    if not task:
        return job

    job.status = _task_job_status(task.status)
    job.result = {
        "task_status": task.status.value,
        "task_result": resolve_storage_payload(task.result),
    }
    if task.status in {TaskStatus.completed, TaskStatus.failed} and job.completed_at is None:
        job.completed_at = datetime.now(timezone.utc)
    db.flush()
    return job


def _to_job_out(db: Session, job: AgentJob) -> AgentJobOut:
    job = _sync_job_from_task(db, job)
    asset_ids: list[int] = []
    if job.asset_id:
        asset_ids.append(job.asset_id)
    if job.task_id:
        asset_ids.extend(
            db.scalars(select(Asset.id).where(Asset.source_task_id == job.task_id).order_by(Asset.id.asc())).all()
        )
    seen_asset_ids = list(dict.fromkeys(asset_ids))
    return AgentJobOut(
        id=job.id,
        job_type=job.job_type,
        status=job.status,
        client_key=job.client.key,
        environment=job.client.environment,
        user_name=job.user.name if job.user else (job.client.user.name if job.client.user else job.client.key),
        project_id=job.project_id,
        project_code=job.project.code if job.project else None,
        workflow_key=job.workflow_key or "",
        requested_provider=job.requested_provider or "",
        task_id=job.task_id,
        asset_id=job.asset_id,
        inspiration_post_id=job.inspiration_post_id,
        research_note_id=job.research_note_id,
        asset_ids=seen_asset_ids,
        request_id=job.request_id,
        external_execution_id=job.external_execution_id or "",
        result=resolve_storage_payload(job.result),
        error_detail=job.error_detail,
        created_at=job.created_at,
        updated_at=job.updated_at,
        completed_at=job.completed_at,
    )


def _to_agent_client_out(client: AgentClient) -> AgentClientOut:
    return AgentClientOut(
        id=client.id,
        key=client.key,
        display_name=client.display_name,
        device_id=client.device_id,
        environment=client.environment,
        user_name=client.user.name if client.user else None,
        role=client.role,
        project_codes=list(client.project_codes or []),
        capabilities=list(client.capabilities or []),
        is_active=client.is_active,
        last_seen_at=client.last_seen_at,
        last_request_id=client.last_request_id or "",
        created_at=client.created_at,
        updated_at=client.updated_at,
    )


def _to_skill_release_out(release: AgentSkillRelease) -> AgentSkillReleaseOut:
    return AgentSkillReleaseOut(
        id=release.id,
        key=release.key,
        display_name=release.display_name,
        environment=release.environment,
        openclaw_version=release.openclaw_version,
        skill_keys=list(release.skill_keys or []),
        system_prompt_template=release.system_prompt_template or "",
        chat_tool_allowlist=list(release.chat_tool_allowlist or []),
        notes=release.notes or "",
        is_active=release.is_active,
        created_by_user_name=release.created_by.name if release.created_by else None,
        created_at=release.created_at,
        updated_at=release.updated_at,
    )


def _create_agent_job(
    *,
    db: Session,
    agent_auth: AgentAuthProfile,
    job_type: str,
    request_id: str,
    payload: dict,
    project: Project | None = None,
    user: User | None = None,
    workflow_key: str = "",
    requested_provider: str = "",
    external_execution_id: str = "",
    task: Task | None = None,
    asset: Asset | None = None,
    inspiration_post: InspirationPost | None = None,
    research_note: ProjectResearchNote | None = None,
    status_value: str = "accepted",
    result: dict | None = None,
) -> AgentJob:
    job = AgentJob(
        job_type=job_type,
        status=status_value,
        client_id=agent_auth.client_id,
        user_id=user.id if user else agent_auth.user_id,
        project_id=project.id if project else None,
        task_id=task.id if task else None,
        asset_id=asset.id if asset else None,
        inspiration_post_id=inspiration_post.id if inspiration_post else None,
        research_note_id=research_note.id if research_note else None,
        workflow_key=workflow_key,
        requested_provider=requested_provider,
        request_id=request_id,
        external_execution_id=(external_execution_id or agent_auth.external_execution_id).strip(),
        payload=payload,
        result=result or {},
        completed_at=datetime.now(timezone.utc) if status_value in {"completed", "failed"} else None,
    )
    db.add(job)
    db.flush()
    return job


def _create_image_task(
    *,
    db: Session,
    agent_auth: AgentAuthProfile,
    project: Project,
    payload: AgentImageTaskCreate,
) -> Task:
    workflow = db.scalar(select(Workflow).where(Workflow.key == payload.workflow_key))
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    provider_map = get_provider_map(db)
    if payload.requested_provider not in provider_map:
        raise HTTPException(status_code=404, detail="Provider not found")

    provider = get_provider_definition(payload.requested_provider, db)
    if workflow.provider_capability not in provider.capabilities:
        raise HTTPException(status_code=400, detail="Provider does not support workflow capability")

    user = _get_or_create_agent_user(db, agent_auth)
    reference_image_storage_paths = _reference_image_storage_paths(payload.payload)
    task = Task(
        title=payload.title,
        status=TaskStatus.pending,
        workflow_id=workflow.id,
        project_id=project.id,
        user_id=user.id,
        requested_provider=payload.requested_provider,
        classification=payload.classification,
        payload=payload.payload,
        result={
            "summary": "Task accepted and waiting for execution.",
            "reference_image_supplied": _reference_image_count(payload.payload) > 0,
            "reference_image_count": _reference_image_count(payload.payload),
            "reference_image_storage_path": reference_image_storage_paths[0] if reference_image_storage_paths else "",
            "reference_image_storage_paths": reference_image_storage_paths,
            "requested_image_count": int(payload.payload.get("image_count") or 1),
            "queued_stage": "accepted",
        },
    )
    db.add(task)
    db.flush()
    return task


def _mark_agent_job_enqueue_failed(db: Session, job: AgentJob, task: Task, exc: Exception) -> dict[str, object]:
    failure = mark_task_enqueue_failed(db, task, exc, ledger_source="agent.task.enqueue")
    job.status = "failed"
    job.error_detail = str(failure["error_detail"])
    job.completed_at = datetime.now(timezone.utc)
    job.result = {
        **(job.result if isinstance(job.result, dict) else {}),
        "task_status": task.status.value,
        "task_result": resolve_storage_payload(task.result),
        "error": failure["error_summary"],
        "error_code": failure["error_code"],
        "error_stage": failure["error_stage"],
    }
    db.flush()
    return failure


@router.post("/image-generate", response_model=AgentJobOut, status_code=status.HTTP_202_ACCEPTED)
def create_agent_image_generate(
    payload: AgentImageTaskCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    agent_auth: AgentAuthProfile = Depends(get_current_agent_auth),
) -> AgentJobOut:
    project = _resolve_project(db, agent_auth, payload.project_id)
    task = _create_image_task(db=db, agent_auth=agent_auth, project=project, payload=payload)
    user = db.get(User, task.user_id)
    request_id = _request_id(request)
    job = _create_agent_job(
        db=db,
        agent_auth=agent_auth,
        job_type="image.generate",
        request_id=request_id,
        payload=payload.model_dump(),
        project=project,
        user=user,
        workflow_key=payload.workflow_key,
        requested_provider=payload.requested_provider,
        external_execution_id=payload.external_execution_id,
        task=task,
        status_value="accepted",
        result={"task_id": task.id, "task_status": task.status.value},
    )
    write_audit_log(
        db=db,
        event_type="agent.image_generate.requested",
        actor_name=agent_auth.user_name,
        actor_id=agent_auth.user_id,
        target_type="task",
        target_id=task.id,
        target_name=task.title,
        project_code=project.code,
        workflow_key=payload.workflow_key,
        provider_name=payload.requested_provider,
        classification=payload.classification,
        details={
            "agent_client_key": agent_auth.key,
            "device_id": agent_auth.device_id,
            "request_id": request_id,
            "external_execution_id": job.external_execution_id,
            "agent_job_id": job.id,
        },
    )
    db.commit()
    db.refresh(job)

    if settings.task_execution_mode == "sync":
        execute_task(task.id)
    elif settings.task_execution_mode == "redis":
        try:
            enqueue_task(task.id)
        except Exception as exc:
            failure = _mark_agent_job_enqueue_failed(db, job, task, exc)
            db.commit()
            raise HTTPException(status_code=503, detail=str(failure["error_summary"])) from exc
    else:
        background_tasks.add_task(execute_task, task.id)

    db.refresh(job)
    return _to_job_out(db, job)


@router.post("/image-edit", response_model=AgentJobOut, status_code=status.HTTP_202_ACCEPTED)
def create_agent_image_edit(
    payload: AgentImageTaskCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    agent_auth: AgentAuthProfile = Depends(get_current_agent_auth),
) -> AgentJobOut:
    payload.workflow_key = "image-edit"
    project = _resolve_project(db, agent_auth, payload.project_id)
    task = _create_image_task(db=db, agent_auth=agent_auth, project=project, payload=payload)
    user = db.get(User, task.user_id)
    request_id = _request_id(request)
    job = _create_agent_job(
        db=db,
        agent_auth=agent_auth,
        job_type="image.edit",
        request_id=request_id,
        payload=payload.model_dump(),
        project=project,
        user=user,
        workflow_key=payload.workflow_key,
        requested_provider=payload.requested_provider,
        external_execution_id=payload.external_execution_id,
        task=task,
        status_value="accepted",
        result={"task_id": task.id, "task_status": task.status.value},
    )
    write_audit_log(
        db=db,
        event_type="agent.image_edit.requested",
        actor_name=agent_auth.user_name,
        actor_id=agent_auth.user_id,
        target_type="task",
        target_id=task.id,
        target_name=task.title,
        project_code=project.code,
        workflow_key=payload.workflow_key,
        provider_name=payload.requested_provider,
        classification=payload.classification,
        details={
            "agent_client_key": agent_auth.key,
            "device_id": agent_auth.device_id,
            "request_id": request_id,
            "external_execution_id": job.external_execution_id,
            "agent_job_id": job.id,
        },
    )
    db.commit()
    db.refresh(job)

    if settings.task_execution_mode == "sync":
        execute_task(task.id)
    elif settings.task_execution_mode == "redis":
        try:
            enqueue_task(task.id)
        except Exception as exc:
            failure = _mark_agent_job_enqueue_failed(db, job, task, exc)
            db.commit()
            raise HTTPException(status_code=503, detail=str(failure["error_summary"])) from exc
    else:
        background_tasks.add_task(execute_task, task.id)

    db.refresh(job)
    return _to_job_out(db, job)


@router.post("/inspiration/import", response_model=AgentJobOut, status_code=status.HTTP_201_CREATED)
def import_agent_inspiration(
    payload: AgentInspirationImportIn,
    request: Request,
    db: Session = Depends(get_db),
    agent_auth: AgentAuthProfile = Depends(get_current_agent_auth),
) -> AgentJobOut:
    project = _resolve_project(db, agent_auth, payload.project_id) if payload.project_id else None
    user = _get_or_create_agent_user(db, agent_auth)
    managed_image_path = prepare_inspiration_image(
        payload.image_path,
        title=payload.title.strip(),
        source_url=payload.source_url.strip(),
        namespace="imports",
    )
    post_payload = InspirationPostCreate(
        title=payload.title,
        description=payload.description,
        image_path=managed_image_path,
        category=payload.category,
        tags=payload.tags,
        source_type=payload.source_type,
        source_name=payload.source_name,
        source_url=payload.source_url,
        prompt_text=payload.prompt_text,
        model_name=payload.model_name,
    )
    post = InspirationPost(
        title=post_payload.title.strip(),
        description=post_payload.description.strip(),
        image_path=managed_image_path,
        category=post_payload.category.strip() or "Architecture",
        tags=[tag.strip() for tag in post_payload.tags if tag.strip()],
        source_type=post_payload.source_type,
        source_name=post_payload.source_name.strip(),
        source_url=post_payload.source_url.strip(),
        prompt_text=post_payload.prompt_text,
        model_name=post_payload.model_name.strip(),
        user_id=user.id,
    )
    db.add(post)
    db.flush()
    request_id = _request_id(request)
    job = _create_agent_job(
        db=db,
        agent_auth=agent_auth,
        job_type="inspiration.import",
        request_id=request_id,
        payload=payload.model_dump(),
        project=project,
        user=user,
        external_execution_id=payload.external_execution_id,
        inspiration_post=post,
        status_value="completed",
        result={"inspiration_post_id": post.id, "image_path": resolve_storage_path(post.image_path)},
    )
    write_audit_log(
        db=db,
        event_type="agent.inspiration.imported",
        actor_name=agent_auth.user_name,
        actor_id=agent_auth.user_id,
        target_type="inspiration",
        target_id=post.id,
        target_name=post.title,
        project_code=project.code if project else None,
        details={
            "agent_client_key": agent_auth.key,
            "request_id": request_id,
            "external_execution_id": job.external_execution_id,
            "agent_job_id": job.id,
        },
    )
    db.commit()
    db.refresh(job)
    return _to_job_out(db, job)


@router.post("/projects/{project_id}/artifacts", response_model=AgentJobOut, status_code=status.HTTP_201_CREATED)
def save_project_artifact(
    project_id: int,
    payload: AgentProjectArtifactCreate,
    request: Request,
    db: Session = Depends(get_db),
    agent_auth: AgentAuthProfile = Depends(get_current_agent_auth),
) -> AgentJobOut:
    project = _resolve_project(db, agent_auth, project_id)
    user = _get_or_create_agent_user(db, agent_auth)
    storage_path = _write_agent_artifact(project, payload)
    asset = Asset(
        name=payload.name.strip(),
        asset_type=payload.asset_type,
        project_id=project.id,
        source_task_id=payload.source_task_id,
        storage_path=storage_path,
        prompt_text=payload.prompt_text,
        tags=[tag.strip() for tag in payload.tags if tag.strip()],
    )
    db.add(asset)
    db.flush()
    request_id = _request_id(request)
    job = _create_agent_job(
        db=db,
        agent_auth=agent_auth,
        job_type="project.asset.save",
        request_id=request_id,
        payload=payload.model_dump(),
        project=project,
        user=user,
        asset=asset,
        external_execution_id=payload.external_execution_id,
        status_value="completed",
        result={"asset_id": asset.id, "storage_path": resolve_storage_path(asset.storage_path)},
    )
    write_audit_log(
        db=db,
        event_type="agent.project_asset.saved",
        actor_name=agent_auth.user_name,
        actor_id=agent_auth.user_id,
        target_type="asset",
        target_id=asset.id,
        target_name=asset.name,
        project_code=project.code,
        details={
            "agent_client_key": agent_auth.key,
            "request_id": request_id,
            "external_execution_id": job.external_execution_id,
            "agent_job_id": job.id,
            "asset_type": asset.asset_type.value,
        },
    )
    db.commit()
    db.refresh(job)
    return _to_job_out(db, job)


@router.post("/projects/{project_id}/research-notes", response_model=AgentJobOut, status_code=status.HTTP_201_CREATED)
def save_project_research_note(
    project_id: int,
    payload: AgentResearchNoteCreate,
    request: Request,
    db: Session = Depends(get_db),
    agent_auth: AgentAuthProfile = Depends(get_current_agent_auth),
) -> AgentJobOut:
    project = _resolve_project(db, agent_auth, project_id)
    user = _get_or_create_agent_user(db, agent_auth)
    note = ProjectResearchNote(
        project_id=project.id,
        user_id=user.id,
        title=payload.title.strip(),
        summary=payload.summary.strip(),
        content=payload.content.strip(),
        source_url=payload.source_url.strip(),
        source_name=payload.source_name.strip(),
        source_execution_id=(payload.external_execution_id or agent_auth.external_execution_id).strip(),
        tags=[tag.strip() for tag in payload.tags if tag.strip()],
    )
    db.add(note)
    db.flush()
    request_id = _request_id(request)
    job = _create_agent_job(
        db=db,
        agent_auth=agent_auth,
        job_type="research.note.save",
        request_id=request_id,
        payload=payload.model_dump(),
        project=project,
        user=user,
        research_note=note,
        external_execution_id=payload.external_execution_id,
        status_value="completed",
        result={"research_note_id": note.id},
    )
    write_audit_log(
        db=db,
        event_type="agent.research_note.saved",
        actor_name=agent_auth.user_name,
        actor_id=agent_auth.user_id,
        target_type="project_research_note",
        target_id=note.id,
        target_name=note.title,
        project_code=project.code,
        details={
            "agent_client_key": agent_auth.key,
            "request_id": request_id,
            "external_execution_id": job.external_execution_id,
            "agent_job_id": job.id,
        },
    )
    db.commit()
    db.refresh(job)
    return _to_job_out(db, job)


@router.post("/workflow-intents/{intent_type}", response_model=AgentJobOut, status_code=status.HTTP_202_ACCEPTED)
def create_workflow_intent(
    intent_type: str,
    payload: AgentWorkflowIntentCreate,
    request: Request,
    db: Session = Depends(get_db),
    agent_auth: AgentAuthProfile = Depends(get_current_agent_auth),
) -> AgentJobOut:
    project = _resolve_project(db, agent_auth, payload.project_id)
    user = _get_or_create_agent_user(db, agent_auth)
    request_id = _request_id(request)
    job = _create_agent_job(
        db=db,
        agent_auth=agent_auth,
        job_type=f"workflow.intent.{intent_type}",
        request_id=request_id,
        payload=payload.model_dump(),
        project=project,
        user=user,
        workflow_key=payload.workflow_key,
        requested_provider=payload.requested_provider,
        external_execution_id=payload.external_execution_id,
        status_value="accepted",
        result={"intent_title": payload.title},
    )
    write_audit_log(
        db=db,
        event_type="agent.workflow_intent.created",
        actor_name=agent_auth.user_name,
        actor_id=agent_auth.user_id,
        target_type="agent_job",
        target_id=job.id,
        target_name=payload.title,
        project_code=project.code,
        workflow_key=payload.workflow_key or None,
        provider_name=payload.requested_provider or None,
        details={
            "agent_client_key": agent_auth.key,
            "request_id": request_id,
            "external_execution_id": job.external_execution_id,
            "intent_type": intent_type,
        },
    )
    db.commit()
    db.refresh(job)
    return _to_job_out(db, job)


@router.get("/jobs/{job_id}", response_model=AgentJobOut)
def get_agent_job(
    job_id: int,
    db: Session = Depends(get_db),
    agent_auth: AgentAuthProfile = Depends(get_current_agent_auth),
) -> AgentJobOut:
    job = db.get(AgentJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Agent job not found")
    if job.client_id != agent_auth.client_id:
        raise HTTPException(status_code=403, detail="Agent job access denied")
    db.commit()
    db.refresh(job)
    return _to_job_out(db, job)


@router.post("/jobs/{job_id}/complete", response_model=AgentJobOut)
def complete_agent_job(
    job_id: int,
    payload: AgentJobCompleteIn,
    db: Session = Depends(get_db),
    agent_auth: AgentAuthProfile = Depends(get_current_agent_auth),
) -> AgentJobOut:
    job = db.get(AgentJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Agent job not found")
    if job.client_id != agent_auth.client_id:
        raise HTTPException(status_code=403, detail="Agent job access denied")
    if job.task_id is not None:
        raise HTTPException(status_code=409, detail="Task-backed jobs are completed by QMDH execution")

    job.status = payload.status
    job.result = payload.result
    job.error_detail = payload.error_detail.strip()
    job.completed_at = datetime.now(timezone.utc)

    write_audit_log(
        db=db,
        event_type="agent.job.completed",
        actor_name=agent_auth.user_name,
        actor_id=agent_auth.user_id,
        target_type="agent_job",
        target_id=job.id,
        target_name=job.job_type,
        project_code=job.project.code if job.project else None,
        workflow_key=job.workflow_key or None,
        provider_name=job.requested_provider or None,
        details={
            "agent_client_key": agent_auth.key,
            "request_id": job.request_id,
            "external_execution_id": job.external_execution_id,
            "status": payload.status,
        },
    )
    db.commit()
    db.refresh(job)
    return _to_job_out(db, job)


@router.get("/admin/clients", response_model=list[AgentClientOut])
def list_agent_clients(
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> list[AgentClientOut]:
    require_ops_access(auth_user)
    clients = db.scalars(select(AgentClient).order_by(AgentClient.environment.asc(), AgentClient.key.asc())).all()
    return [_to_agent_client_out(client) for client in clients]


@router.get("/admin/skills", response_model=list[AgentOfficialSkillOut])
def list_agent_skills(
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> list[AgentOfficialSkillOut]:
    require_ops_access(auth_user)
    return [AgentOfficialSkillOut(**item) for item in list_official_skills(db, include_inactive=True)]


@router.post("/admin/skills/install", response_model=AgentSkillInstallResult)
def install_agent_skill(
    payload: AgentSkillInstallRequest,
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> AgentSkillInstallResult:
    require_ops_access(auth_user)
    from app.services.agent_skill_install_service import SkillInstallError, install_skill_from_source

    try:
        result = install_skill_from_source(
            db,
            source=payload.source,
            skill_key=payload.skill_key,
            overwrite=payload.overwrite,
            created_by_user_id=auth_user.user_id,
        )
    except SkillInstallError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if result["status"] == "needs_selection":
        return AgentSkillInstallResult(
            status="needs_selection",
            candidates=[AgentSkillInstallCandidate(**item) for item in result["candidates"]],
        )

    entry = result["entry"]
    item = result["item"]
    write_audit_log(
        db=db,
        event_type="agent.skill_catalog.installed",
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="agent_skill_catalog",
        target_id=entry.id,
        target_name=entry.key,
        details={
            "source": payload.source[:500],
            "source_repo": entry.source_repo,
            "content_hash": entry.content_hash,
            "overwrite": payload.overwrite,
        },
    )
    db.commit()
    return AgentSkillInstallResult(status="installed", skill=AgentOfficialSkillOut(**item))


@router.get("/admin/skills/{skill_key}/files/{file_path:path}", response_model=AgentSkillFileContentOut)
def get_agent_skill_file(
    skill_key: str,
    file_path: str,
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> AgentSkillFileContentOut:
    require_ops_access(auth_user)
    from app.services.agent_skill_install_service import get_skill_file_content

    try:
        payload = get_skill_file_content(db, skill_key=skill_key, relative_path=file_path)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return AgentSkillFileContentOut(**payload)


@router.post("/admin/skills", response_model=AgentOfficialSkillOut, status_code=status.HTTP_201_CREATED)
def create_agent_skill(
    payload: AgentOfficialSkillCreate,
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> AgentOfficialSkillOut:
    require_ops_access(auth_user)
    from app.services.agent_skill_registry import create_catalog_skill, list_official_skills as _list

    try:
        entry = create_catalog_skill(
            db,
            key=payload.key,
            name=payload.name,
            version=payload.version,
            description=payload.description,
            author=payload.author,
            inputs=payload.inputs,
            outputs=payload.outputs,
            notes=payload.notes,
            created_by_user_id=auth_user.user_id,
            is_active=payload.is_active,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    write_audit_log(
        db=db,
        event_type="agent.skill_catalog.created",
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="agent_skill_catalog",
        target_id=entry.id,
        target_name=entry.name,
        details={"key": entry.key, "version": entry.version, "is_active": entry.is_active},
    )
    db.commit()
    item = next(i for i in _list(db, include_inactive=True) if i["key"] == entry.key)
    return AgentOfficialSkillOut(**item)


@router.patch("/admin/skills/{skill_key}", response_model=AgentOfficialSkillOut)
def update_agent_skill(
    skill_key: str,
    payload: AgentOfficialSkillUpdate,
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> AgentOfficialSkillOut:
    require_ops_access(auth_user)
    from app.services.agent_skill_registry import set_skill_active
    from app.models import AgentSkillCatalogEntry

    update_data = payload.model_dump(exclude_unset=True)
    if "is_active" in update_data and len(update_data) == 1:
        try:
            item = set_skill_active(db, skill_key=skill_key, is_active=bool(update_data["is_active"]))
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        write_audit_log(
            db=db,
            event_type="agent.skill_catalog.toggled",
            actor_name=auth_user.name,
            actor_id=auth_user.user_id,
            target_type="agent_skill_catalog",
            target_name=skill_key,
            details={"is_active": bool(update_data["is_active"])},
        )
        db.commit()
        return AgentOfficialSkillOut(**item)

    entry = db.scalar(select(AgentSkillCatalogEntry).where(AgentSkillCatalogEntry.key == skill_key))
    if entry is None:
        raise HTTPException(status_code=404, detail="Custom skill not found (builtins: use is_active toggle only)")
    if skill_key in {item["key"] for item in list_official_skills(db) if item.get("source") == "builtin"} and "is_active" not in update_data:
        # Allow metadata edit only for pure custom rows; builtins can only toggle via set_skill_active path above.
        pass

    for field, value in update_data.items():
        if field == "inputs":
            entry.inputs_json = [item.strip() for item in (value or []) if str(item).strip()]
        elif field == "outputs":
            entry.outputs_json = [item.strip() for item in (value or []) if str(item).strip()]
        elif field == "is_active":
            entry.is_active = bool(value)
        elif isinstance(value, str):
            setattr(entry, field, value.strip())
        elif value is not None:
            setattr(entry, field, value)

    from app.services.agent_skill_registry import sync_enabled_skills_to_releases

    sync_enabled_skills_to_releases(db)
    write_audit_log(
        db=db,
        event_type="agent.skill_catalog.updated",
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="agent_skill_catalog",
        target_id=entry.id,
        target_name=entry.key,
        details={"updated_fields": list(update_data.keys())},
    )
    db.commit()
    db.refresh(entry)
    item = next(i for i in list_official_skills(db, include_inactive=True) if i["key"] == entry.key)
    return AgentOfficialSkillOut(**item)


@router.delete("/admin/skills/{skill_key}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent_skill(
    skill_key: str,
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> Response:
    require_ops_access(auth_user)
    from app.services.agent_skill_registry import delete_catalog_skill

    try:
        entry = delete_catalog_skill(db, skill_key=skill_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    write_audit_log(
        db=db,
        event_type="agent.skill_catalog.deleted",
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="agent_skill_catalog",
        target_name=entry.key,
        details={"key": entry.key},
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/releases", response_model=list[AgentSkillReleaseOut])
def list_skill_releases(
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> list[AgentSkillReleaseOut]:
    require_ops_access(auth_user)
    releases = db.scalars(
        select(AgentSkillRelease).order_by(AgentSkillRelease.environment.asc(), AgentSkillRelease.created_at.desc())
    ).all()
    return [_to_skill_release_out(release) for release in releases]


@router.post("/admin/releases", response_model=AgentSkillReleaseOut, status_code=status.HTTP_201_CREATED)
def create_skill_release(
    payload: AgentSkillReleaseCreate,
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> AgentSkillReleaseOut:
    require_ops_access(auth_user)
    existing = db.scalar(select(AgentSkillRelease).where(AgentSkillRelease.key == payload.key))
    if existing:
        raise HTTPException(status_code=409, detail="Skill release key already exists")
    release = AgentSkillRelease(
        key=payload.key,
        display_name=payload.display_name.strip(),
        environment=payload.environment,
        openclaw_version=payload.openclaw_version.strip(),
        skill_keys=[item.strip() for item in payload.skill_keys if item.strip()],
        system_prompt_template=payload.system_prompt_template.strip(),
        chat_tool_allowlist=list(normalize_chat_tool_allowlist(payload.chat_tool_allowlist)),
        notes=payload.notes.strip(),
        is_active=payload.is_active,
        created_by_user_id=auth_user.user_id,
    )
    db.add(release)
    write_audit_log(
        db=db,
        event_type="agent.skill_release.created",
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="agent_skill_release",
        target_id=None,
        target_name=release.display_name,
        details={
            "release_key": release.key,
            "environment": release.environment,
            "skill_keys": release.skill_keys,
            "chat_tool_allowlist": release.chat_tool_allowlist,
            "openclaw_version": release.openclaw_version,
        },
    )
    db.commit()
    db.refresh(release)
    return _to_skill_release_out(release)


@router.patch("/admin/releases/{release_id}", response_model=AgentSkillReleaseOut)
def update_skill_release(
    release_id: int,
    payload: AgentSkillReleaseUpdate,
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> AgentSkillReleaseOut:
    require_ops_access(auth_user)
    release = db.get(AgentSkillRelease, release_id)
    if not release:
        raise HTTPException(status_code=404, detail="Skill release not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "skill_keys" and value is not None:
            value = [item.strip() for item in value if item.strip()]
        elif field == "chat_tool_allowlist" and value is not None:
            value = list(normalize_chat_tool_allowlist(value))
        elif isinstance(value, str):
            value = value.strip()
        setattr(release, field, value)

    write_audit_log(
        db=db,
        event_type="agent.skill_release.updated",
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="agent_skill_release",
        target_id=release.id,
        details={"updated_fields": list(update_data.keys())},
    )
    db.commit()
    db.refresh(release)
    return _to_skill_release_out(release)


@router.get("/admin/chat-tools", response_model=list[AgentChatToolOut])
def list_admin_chat_tools(
    auth_user=Depends(get_current_auth_user),
) -> list[AgentChatToolOut]:
    require_ops_access(auth_user)
    return [AgentChatToolOut(**item) for item in list_chat_tool_catalog()]


@router.get("/admin/chat-policy-defaults", response_model=ChatAgentPolicyDefaultsOut)
def get_admin_chat_policy_defaults(
    auth_user=Depends(get_current_auth_user),
) -> ChatAgentPolicyDefaultsOut:
    require_ops_access(auth_user)
    return ChatAgentPolicyDefaultsOut(
        baseline_prompt=CHAT_AGENT_BASELINE_PROMPT.strip(),
        data_scope_note=CHAT_AGENT_DATA_SCOPE_NOTE,
        default_tool_allowlist=list(DEFAULT_CHAT_TOOL_ALLOWLIST),
        tools=[AgentChatToolOut(**item) for item in list_chat_tool_catalog()],
    )


def _to_policy_override_out(db: Session, override: AgentPolicyOverride) -> AgentPolicyOverrideOut:
    scope_display_name: str | None = None
    if override.scope == "user":
        try:
            user_id = int(override.scope_key)
        except ValueError:
            user_id = None
        if user_id is not None:
            user = db.get(User, user_id)
            if user is not None:
                scope_display_name = user.display_name or user.name
    elif override.scope == "group":
        scope_display_name = override.scope_key

    return AgentPolicyOverrideOut(
        id=override.id,
        scope=override.scope,
        scope_key=override.scope_key,
        scope_display_name=scope_display_name,
        disabled_tool_keys=list(override.disabled_tool_keys or []),
        system_prompt_overlay=override.system_prompt_overlay or "",
        notes=override.notes or "",
        is_active=override.is_active,
        updated_at=override.updated_at,
    )


def _validate_override_scope(db: Session, *, scope: str, scope_key: str) -> str:
    normalized_key = scope_key.strip()
    if not normalized_key:
        raise HTTPException(status_code=400, detail="scope_key is required")

    if scope == "group":
        return normalized_key

    if scope == "user":
        try:
            user_id = int(normalized_key)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="user scope_key must be a numeric user id") from exc
        user = db.get(User, user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="User not found for override")
        return str(user_id)

    raise HTTPException(status_code=400, detail="scope must be group or user")


@router.get("/admin/policy-overrides", response_model=list[AgentPolicyOverrideOut])
def list_policy_overrides(
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> list[AgentPolicyOverrideOut]:
    require_ops_access(auth_user)
    overrides = db.scalars(
        select(AgentPolicyOverride).order_by(AgentPolicyOverride.scope.asc(), AgentPolicyOverride.scope_key.asc())
    ).all()
    return [_to_policy_override_out(db, item) for item in overrides]


@router.post("/admin/policy-overrides", response_model=AgentPolicyOverrideOut, status_code=status.HTTP_201_CREATED)
def create_policy_override(
    payload: AgentPolicyOverrideCreate,
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> AgentPolicyOverrideOut:
    require_ops_access(auth_user)
    scope_key = _validate_override_scope(db, scope=payload.scope, scope_key=payload.scope_key)
    existing = db.scalar(
        select(AgentPolicyOverride).where(
            AgentPolicyOverride.scope == payload.scope,
            AgentPolicyOverride.scope_key == scope_key,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="Policy override already exists for this scope")

    override = AgentPolicyOverride(
        scope=payload.scope,
        scope_key=scope_key,
        disabled_tool_keys=list(normalize_disabled_tool_keys(payload.disabled_tool_keys)),
        system_prompt_overlay=payload.system_prompt_overlay.strip(),
        notes=payload.notes.strip(),
        is_active=payload.is_active,
        created_by_user_id=auth_user.user_id,
    )
    db.add(override)
    write_audit_log(
        db=db,
        event_type="agent.policy_override.created",
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="agent_policy_override",
        target_name=f"{payload.scope}:{scope_key}",
        details={
            "scope": payload.scope,
            "scope_key": scope_key,
            "disabled_tool_keys": override.disabled_tool_keys,
        },
    )
    db.commit()
    db.refresh(override)
    return _to_policy_override_out(db, override)


@router.patch("/admin/policy-overrides/{override_id}", response_model=AgentPolicyOverrideOut)
def update_policy_override(
    override_id: int,
    payload: AgentPolicyOverrideUpdate,
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> AgentPolicyOverrideOut:
    require_ops_access(auth_user)
    override = db.get(AgentPolicyOverride, override_id)
    if override is None:
        raise HTTPException(status_code=404, detail="Policy override not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "disabled_tool_keys" in update_data and update_data["disabled_tool_keys"] is not None:
        update_data["disabled_tool_keys"] = list(normalize_disabled_tool_keys(update_data["disabled_tool_keys"]))
    if "system_prompt_overlay" in update_data and update_data["system_prompt_overlay"] is not None:
        update_data["system_prompt_overlay"] = update_data["system_prompt_overlay"].strip()
    if "notes" in update_data and update_data["notes"] is not None:
        update_data["notes"] = update_data["notes"].strip()

    for field, value in update_data.items():
        setattr(override, field, value)

    write_audit_log(
        db=db,
        event_type="agent.policy_override.updated",
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="agent_policy_override",
        target_id=override.id,
        target_name=f"{override.scope}:{override.scope_key}",
        details={"updated_fields": list(update_data.keys())},
    )
    db.commit()
    db.refresh(override)
    return _to_policy_override_out(db, override)


@router.delete("/admin/policy-overrides/{override_id}", status_code=204)
def delete_policy_override(
    override_id: int,
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> Response:
    require_ops_access(auth_user)
    override = db.get(AgentPolicyOverride, override_id)
    if override is None:
        raise HTTPException(status_code=404, detail="Policy override not found")
    write_audit_log(
        db=db,
        event_type="agent.policy_override.deleted",
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="agent_policy_override",
        target_id=override.id,
        target_name=f"{override.scope}:{override.scope_key}",
        details={},
    )
    db.delete(override)
    db.commit()
    return Response(status_code=204)


@router.get("/admin/chat-conversations", response_model=list[AdminChatConversationOut])
def list_admin_chat_conversations_route(
    user_id: int | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> list[AdminChatConversationOut]:
    require_ops_access(auth_user)
    rows = list_admin_chat_conversations(db, user_id=user_id, limit=limit)
    return [AdminChatConversationOut(**row) for row in rows]


@router.get("/admin/chat-conversations/{conversation_id}/messages", response_model=list[ChatMessageOut])
def get_admin_chat_conversation_messages(
    conversation_id: int,
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> list[ChatMessageOut]:
    require_ops_access(auth_user)
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return list_admin_chat_messages(db, conversation_id=conversation_id)


@router.get("/admin/agent-traces", response_model=list[AdminAgentTraceOut])
def list_admin_agent_assist_traces(
    conversation_id: int | None = None,
    actor_id: int | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    auth_user=Depends(get_current_auth_user),
) -> list[AdminAgentTraceOut]:
    require_ops_access(auth_user)
    rows = list_admin_agent_traces(
        db,
        conversation_id=conversation_id,
        actor_id=actor_id,
        limit=limit,
    )
    return [AdminAgentTraceOut(**row) for row in rows]
