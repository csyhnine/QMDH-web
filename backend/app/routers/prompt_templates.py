from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import and_, case, or_, select
from sqlalchemy.orm import Session

from app.core.audit import AuditEventType, write_audit_log
from app.core.auth import get_current_auth_user, has_admin_access, require_user_admin
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import PromptTemplate, User
from app.schemas import PromptTemplateCreate, PromptTemplateOut, PromptTemplateUpdate

router = APIRouter(prefix="/prompt-templates", tags=["prompt_templates"])


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


def _to_prompt_template_out(template: PromptTemplate) -> PromptTemplateOut:
    return PromptTemplateOut(
        id=template.id,
        user_name=template.user.name,
        scope=template.scope,
        can_manage=False,
        label=template.label,
        title=template.title,
        prompt=template.prompt,
        style=template.style,
        aspect_ratio=template.aspect_ratio,
        resolution=template.resolution,
        deliverable=template.deliverable,
        notes=template.notes,
        preview_image_path=template.preview_image_path or "",
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
    payload.can_manage = has_admin_access(auth_user.role) if template.scope == "shared" else _template_is_private_owner(template, auth_user)
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


@router.get("", response_model=list[PromptTemplateOut])
def list_prompt_templates(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[PromptTemplateOut]:
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
    return [_to_prompt_template_out_for_user(template, auth_user) for template in templates]


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
        label=payload.label,
        title=payload.title,
        prompt=payload.prompt,
        style=payload.style,
        aspect_ratio=payload.aspect_ratio,
        resolution=payload.resolution,
        deliverable=payload.deliverable,
        notes=payload.notes,
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
    require_user_admin(auth_user)
    templates = db.scalars(
        select(PromptTemplate)
        .join(PromptTemplate.user)
        .where(PromptTemplate.scope == "shared")
        .order_by(PromptTemplate.updated_at.desc(), PromptTemplate.id.desc())
    ).all()
    return [_to_prompt_template_out_for_user(template, auth_user) for template in templates]


@router.post("/admin/shared", response_model=PromptTemplateOut, status_code=status.HTTP_201_CREATED)
def create_shared_prompt_template(
    payload: PromptTemplateCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> PromptTemplateOut:
    require_user_admin(auth_user)
    user = _get_or_create_user(db, auth_user)
    template = PromptTemplate(
        user_id=user.id,
        scope="shared",
        label=payload.label,
        title=payload.title,
        prompt=payload.prompt,
        style=payload.style,
        aspect_ratio=payload.aspect_ratio,
        resolution=payload.resolution,
        deliverable=payload.deliverable,
        notes=payload.notes,
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
    return _to_prompt_template_out_for_user(template, auth_user)


@router.patch("/admin/shared/{template_id}", response_model=PromptTemplateOut)
def update_shared_prompt_template(
    template_id: int,
    payload: PromptTemplateUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> PromptTemplateOut:
    require_user_admin(auth_user)
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
    return _to_prompt_template_out_for_user(template, auth_user)


@router.delete("/admin/shared/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shared_prompt_template(
    template_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Response:
    require_user_admin(auth_user)
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
    return Response(status_code=status.HTTP_204_NO_CONTENT)
