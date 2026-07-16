from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import and_, case, or_, select
from sqlalchemy.orm import Session

from app.core.audit import AuditEventType, write_audit_log
from app.core.auth import get_current_auth_user, get_optional_auth_user, has_content_ops_access, require_content_ops_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import PromptTemplate, PromptTemplateEvent, User
from app.schemas import (
    PromptTemplateCreate,
    PromptTemplateEventCreate,
    PromptTemplateEventOut,
    PromptTemplateOut,
    PromptTemplateUpdate,
)
from app.integrations.search.index_hooks import delete_shared_template, upsert_shared_template
from app.services.media_storage import resolve_storage_path

router = APIRouter(prefix="/prompt-templates", tags=["prompt_templates"])
POPULARITY_LOOKBACK_DAYS = 30
POPULARITY_WEIGHTS = {
    "impression": 1.0,
    "hover_preview": 2.0,
    "apply": 5.0,
    "submit_success": 8.0,
}
EVENT_DEDUPE_WINDOWS = {
    "impression": timedelta(minutes=20),
    "hover_preview": timedelta(minutes=10),
    "apply": timedelta(minutes=2),
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


def _utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _template_stats_map(db: Session, template_ids: list[int]) -> dict[int, dict[str, float | int]]:
    if not template_ids:
        return {}

    since = datetime.now(timezone.utc) - timedelta(days=POPULARITY_LOOKBACK_DAYS)
    events = db.scalars(
        select(PromptTemplateEvent)
        .where(
            PromptTemplateEvent.template_id.in_(template_ids),
            PromptTemplateEvent.created_at >= since,
        )
        .order_by(PromptTemplateEvent.created_at.desc(), PromptTemplateEvent.id.desc())
    ).all()

    stats: dict[int, dict[str, float | int]] = defaultdict(
        lambda: {
            "popularity_score": 0.0,
            "recent_apply_count": 0,
            "recent_submit_success_count": 0,
        }
    )
    for event in events:
        slot = stats[event.template_id]
        slot["popularity_score"] = float(slot["popularity_score"]) + POPULARITY_WEIGHTS.get(event.event_type, 0.0)
        if event.event_type == "apply":
            slot["recent_apply_count"] = int(slot["recent_apply_count"]) + 1
        if event.event_type == "submit_success":
            slot["recent_submit_success_count"] = int(slot["recent_submit_success_count"]) + 1
    return stats


def _to_prompt_template_out(
    template: PromptTemplate,
    stats: dict[str, float | int] | None = None,
) -> PromptTemplateOut:
    template_stats = stats or {}
    return PromptTemplateOut(
        id=template.id,
        user_name=template.user.name,
        scope=template.scope,
        can_manage=False,
        category=template.category or "",
        subcategory=template.subcategory or "",
        is_featured=bool(template.is_featured),
        label=template.label,
        title=template.title,
        prompt=template.prompt,
        style=template.style,
        aspect_ratio=template.aspect_ratio,
        resolution=template.resolution,
        deliverable=template.deliverable,
        notes=template.notes,
        source_image_path=resolve_storage_path(template.source_image_path) if template.source_image_path else "",
        preview_image_path=resolve_storage_path(template.preview_image_path) if template.preview_image_path else "",
        popularity_score=round(float(template_stats.get("popularity_score", 0.0) or 0.0), 2),
        recent_apply_count=int(template_stats.get("recent_apply_count", 0) or 0),
        recent_submit_success_count=int(template_stats.get("recent_submit_success_count", 0) or 0),
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def _template_is_private_owner(template: PromptTemplate, auth_user: AuthUserProfile) -> bool:
    if template.scope != "private":
        return False
    if auth_user.user_id is not None:
        return template.user_id == auth_user.user_id
    return template.user.name == auth_user.name


def _to_prompt_template_out_for_user(template: PromptTemplate, auth_user: AuthUserProfile) -> PromptTemplateOut:
    payload = _to_prompt_template_out(template)
    payload.can_manage = has_content_ops_access(auth_user.role) if template.scope == "shared" else _template_is_private_owner(template, auth_user)
    return payload


def _get_owned_private_template(db: Session, template_id: int, auth_user: AuthUserProfile) -> PromptTemplate:
    template = db.scalar(
        select(PromptTemplate)
        .join(PromptTemplate.user)
        .where(
            PromptTemplate.id == template_id,
            PromptTemplate.scope == "private",
            User.name == auth_user.name,
        )
    )
    if not template:
        raise HTTPException(status_code=404, detail="Prompt template not found")
    return template


def _get_shared_template(db: Session, template_id: int) -> PromptTemplate:
    template = db.scalar(select(PromptTemplate).where(PromptTemplate.id == template_id, PromptTemplate.scope == "shared"))
    if not template:
        raise HTTPException(status_code=404, detail="Shared prompt template not found")
    return template


def _get_visible_template(db: Session, template_id: int, auth_user: AuthUserProfile) -> PromptTemplate:
    template = db.scalar(
        select(PromptTemplate)
        .join(PromptTemplate.user)
        .where(
            PromptTemplate.id == template_id,
            or_(
                PromptTemplate.scope == "shared",
                and_(PromptTemplate.scope == "private", User.name == auth_user.name),
            ),
        )
    )
    if not template:
        raise HTTPException(status_code=404, detail="Prompt template not found")
    return template


@router.get("", response_model=list[PromptTemplateOut])
def list_prompt_templates(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile | None = Depends(get_optional_auth_user),
) -> list[PromptTemplateOut]:
    if auth_user is None:
        templates = db.scalars(
            select(PromptTemplate)
            .join(PromptTemplate.user)
            .where(PromptTemplate.scope == "shared")
            .order_by(PromptTemplate.updated_at.desc(), PromptTemplate.id.desc())
        ).all()
        stats_map = _template_stats_map(db, [template.id for template in templates])
        return [
            _to_prompt_template_out(template, stats_map.get(template.id))
            for template in templates
        ]

    templates = db.scalars(
        select(PromptTemplate)
        .join(PromptTemplate.user)
        .where(
            or_(
                PromptTemplate.scope == "shared",
                and_(PromptTemplate.scope == "private", User.name == auth_user.name),
            )
        )
        .order_by(
            case((PromptTemplate.scope == "shared", 0), else_=1),
            PromptTemplate.updated_at.desc(),
            PromptTemplate.id.desc(),
        )
    ).all()
    stats_map = _template_stats_map(db, [template.id for template in templates if template.scope == "shared"])
    payloads: list[PromptTemplateOut] = []
    for template in templates:
        payload = _to_prompt_template_out(template, stats_map.get(template.id))
        payload.can_manage = (
            has_content_ops_access(auth_user.role) if template.scope == "shared" else _template_is_private_owner(template, auth_user)
        )
        payloads.append(payload)
    return payloads


@router.post("", response_model=PromptTemplateOut, status_code=status.HTTP_201_CREATED)
def create_prompt_template(
    payload: PromptTemplateCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> PromptTemplateOut:
    user = _get_or_create_user(db, auth_user)
    template = PromptTemplate(
        user_id=user.id,
        scope="private",
        category=payload.category,
        subcategory=payload.subcategory,
        is_featured=payload.is_featured,
        label=payload.label,
        title=payload.title,
        prompt=payload.prompt,
        style=payload.style,
        aspect_ratio=payload.aspect_ratio,
        resolution=payload.resolution,
        deliverable=payload.deliverable,
        notes=payload.notes,
        source_image_path=payload.source_image_path,
        preview_image_path=payload.preview_image_path,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return _to_prompt_template_out_for_user(template, auth_user)


@router.patch("/{template_id}", response_model=PromptTemplateOut)
def update_prompt_template(
    template_id: int,
    payload: PromptTemplateUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> PromptTemplateOut:
    template = _get_owned_private_template(db, template_id, auth_user)

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(template, field, value)

    db.commit()
    db.refresh(template)
    return _to_prompt_template_out_for_user(template, auth_user)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_prompt_template(
    template_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Response:
    template = _get_owned_private_template(db, template_id, auth_user)

    db.delete(template)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/shared", response_model=list[PromptTemplateOut])
def list_shared_prompt_templates(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[PromptTemplateOut]:
    require_content_ops_access(auth_user)
    templates = db.scalars(
        select(PromptTemplate)
        .join(PromptTemplate.user)
        .where(PromptTemplate.scope == "shared")
        .order_by(PromptTemplate.updated_at.desc(), PromptTemplate.id.desc())
    ).all()
    stats_map = _template_stats_map(db, [template.id for template in templates])
    payloads: list[PromptTemplateOut] = []
    for template in templates:
        payload = _to_prompt_template_out(template, stats_map.get(template.id))
        payload.can_manage = True
        payloads.append(payload)
    return payloads


@router.post("/{template_id}/events", response_model=PromptTemplateEventOut, status_code=status.HTTP_201_CREATED)
def create_prompt_template_event(
    template_id: int,
    payload: PromptTemplateEventCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> PromptTemplateEventOut:
    template = _get_visible_template(db, template_id, auth_user)
    user = _get_or_create_user(db, auth_user)
    event_type = payload.event_type.strip()
    context = payload.context.strip() or "studio"
    now = datetime.now(timezone.utc)
    dedupe_window = EVENT_DEDUPE_WINDOWS.get(event_type)
    if dedupe_window is not None:
        existing = db.scalar(
            select(PromptTemplateEvent)
            .where(
                PromptTemplateEvent.template_id == template.id,
                PromptTemplateEvent.user_id == user.id,
                PromptTemplateEvent.event_type == event_type,
                PromptTemplateEvent.context == context,
            )
            .order_by(PromptTemplateEvent.created_at.desc(), PromptTemplateEvent.id.desc())
        )
        existing_created_at = _utc_datetime(existing.created_at) if existing else None
        if existing and existing_created_at and now - existing_created_at <= dedupe_window:
            return PromptTemplateEventOut(
                template_id=template.id,
                event_type=event_type,
                context=context,
                recorded=False,
                created_at=existing_created_at,
            )

    event = PromptTemplateEvent(
        template_id=template.id,
        user_id=user.id,
        event_type=event_type,
        context=context,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return PromptTemplateEventOut(
        template_id=template.id,
        event_type=event.event_type,
        context=event.context,
        recorded=True,
        created_at=event.created_at,
    )


@router.post("/admin/shared", response_model=PromptTemplateOut, status_code=status.HTTP_201_CREATED)
def create_shared_prompt_template(
    payload: PromptTemplateCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> PromptTemplateOut:
    require_content_ops_access(auth_user)
    user = _get_or_create_user(db, auth_user)
    template = PromptTemplate(
        user_id=user.id,
        scope="shared",
        category=payload.category,
        subcategory=payload.subcategory,
        is_featured=payload.is_featured,
        label=payload.label,
        title=payload.title,
        prompt=payload.prompt,
        style=payload.style,
        aspect_ratio=payload.aspect_ratio,
        resolution=payload.resolution,
        deliverable=payload.deliverable,
        notes=payload.notes,
        source_image_path=payload.source_image_path,
        preview_image_path=payload.preview_image_path,
    )
    db.add(template)
    write_audit_log(
        db=db,
        event_type=AuditEventType.PROMPT_TEMPLATE_CREATED,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="prompt_template",
        target_name=payload.label,
        details={"scope": "shared"},
    )
    db.commit()
    db.refresh(template)
    upsert_shared_template(template)
    return _to_prompt_template_out_for_user(template, auth_user)


@router.patch("/admin/shared/{template_id}", response_model=PromptTemplateOut)
def update_shared_prompt_template(
    template_id: int,
    payload: PromptTemplateUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> PromptTemplateOut:
    require_content_ops_access(auth_user)
    template = _get_shared_template(db, template_id)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(template, field, value)
    write_audit_log(
        db=db,
        event_type=AuditEventType.PROMPT_TEMPLATE_UPDATED,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="prompt_template",
        target_id=template.id,
        target_name=template.label,
        details={"scope": "shared", "updated_fields": sorted(updates.keys())},
    )
    db.commit()
    db.refresh(template)
    upsert_shared_template(template)
    return _to_prompt_template_out_for_user(template, auth_user)


@router.delete("/admin/shared/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shared_prompt_template(
    template_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Response:
    require_content_ops_access(auth_user)
    template = _get_shared_template(db, template_id)
    write_audit_log(
        db=db,
        event_type=AuditEventType.PROMPT_TEMPLATE_DELETED,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="prompt_template",
        target_id=template.id,
        target_name=template.label,
        details={"scope": "shared"},
    )
    db.delete(template)
    db.commit()
    delete_shared_template(template_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
