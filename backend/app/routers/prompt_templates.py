from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user
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
        label=template.label,
        title=template.title,
        prompt=template.prompt,
        style=template.style,
        aspect_ratio=template.aspect_ratio,
        resolution=template.resolution,
        deliverable=template.deliverable,
        notes=template.notes,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def _get_owned_template(db: Session, template_id: int, auth_user: AuthUserProfile) -> PromptTemplate:
    template = db.scalar(
        select(PromptTemplate)
        .join(PromptTemplate.user)
        .where(PromptTemplate.id == template_id, User.name == auth_user.name)
    )
    if not template:
        raise HTTPException(status_code=404, detail="Prompt template not found")
    return template


@router.get("", response_model=list[PromptTemplateOut])
def list_prompt_templates(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[PromptTemplateOut]:
    templates = db.scalars(
        select(PromptTemplate)
        .join(PromptTemplate.user)
        .where(User.name == auth_user.name)
        .order_by(PromptTemplate.updated_at.desc(), PromptTemplate.id.desc())
    ).all()
    return [_to_prompt_template_out(template) for template in templates]


@router.post("", response_model=PromptTemplateOut, status_code=status.HTTP_201_CREATED)
def create_prompt_template(
    payload: PromptTemplateCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> PromptTemplateOut:
    user = _get_or_create_user(db, auth_user)
    template = PromptTemplate(
        user_id=user.id,
        label=payload.label,
        title=payload.title,
        prompt=payload.prompt,
        style=payload.style,
        aspect_ratio=payload.aspect_ratio,
        resolution=payload.resolution,
        deliverable=payload.deliverable,
        notes=payload.notes,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return _to_prompt_template_out(template)


@router.patch("/{template_id}", response_model=PromptTemplateOut)
def update_prompt_template(
    template_id: int,
    payload: PromptTemplateUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> PromptTemplateOut:
    template = _get_owned_template(db, template_id, auth_user)

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(template, field, value)

    db.commit()
    db.refresh(template)
    return _to_prompt_template_out(template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_prompt_template(
    template_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Response:
    template = _get_owned_template(db, template_id, auth_user)

    db.delete(template)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
