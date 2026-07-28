from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, require_content_ops_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import SiteAnnouncement

router = APIRouter(prefix="/announcements", tags=["announcements"])


class SiteAnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    body: str = Field(min_length=1)
    is_active: bool = True
    starts_at: datetime
    ends_at: datetime
    priority: int = 0

    @model_validator(mode="after")
    def validate_window(self) -> "SiteAnnouncementCreate":
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class SiteAnnouncementUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=150)
    body: str | None = Field(default=None, min_length=1)
    is_active: bool | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    priority: int | None = None

    @model_validator(mode="after")
    def validate_partial_window(self) -> "SiteAnnouncementUpdate":
        if self.starts_at is not None and self.ends_at is not None and self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


class SiteAnnouncementOut(BaseModel):
    id: int
    title: str
    body: str
    is_active: bool
    starts_at: datetime
    ends_at: datetime
    priority: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


def _require_user_id(auth_user: AuthUserProfile) -> int:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return auth_user.user_id


def _ensure_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _to_out(row: SiteAnnouncement) -> SiteAnnouncementOut:
    return SiteAnnouncementOut.model_validate(row)


def _get_alive(db: Session, announcement_id: int) -> SiteAnnouncement:
    row = db.get(SiteAnnouncement, announcement_id)
    if row is None or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return row


@router.get("/active", response_model=SiteAnnouncementOut | None)
def get_active_announcement(
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
    db: Session = Depends(get_db),
) -> SiteAnnouncementOut | None:
    _require_user_id(auth_user)
    now = datetime.now(timezone.utc)
    row = db.scalars(
        select(SiteAnnouncement)
        .where(
            SiteAnnouncement.deleted_at.is_(None),
            SiteAnnouncement.is_active.is_(True),
            SiteAnnouncement.starts_at <= now,
            SiteAnnouncement.ends_at >= now,
        )
        .order_by(SiteAnnouncement.priority.desc(), SiteAnnouncement.updated_at.desc())
        .limit(1)
    ).first()
    return _to_out(row) if row else None


@router.get("/admin", response_model=list[SiteAnnouncementOut])
def list_admin_announcements(
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
    db: Session = Depends(get_db),
) -> list[SiteAnnouncementOut]:
    require_content_ops_access(auth_user)
    rows = db.scalars(
        select(SiteAnnouncement)
        .where(SiteAnnouncement.deleted_at.is_(None))
        .order_by(SiteAnnouncement.priority.desc(), SiteAnnouncement.updated_at.desc())
    ).all()
    return [_to_out(row) for row in rows]


@router.post("/admin", response_model=SiteAnnouncementOut, status_code=status.HTTP_201_CREATED)
def create_announcement(
    payload: SiteAnnouncementCreate,
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
    db: Session = Depends(get_db),
) -> SiteAnnouncementOut:
    require_content_ops_access(auth_user)
    user_id = _require_user_id(auth_user)
    row = SiteAnnouncement(
        title=payload.title.strip(),
        body=payload.body.strip(),
        is_active=payload.is_active,
        starts_at=_ensure_aware(payload.starts_at),
        ends_at=_ensure_aware(payload.ends_at),
        priority=payload.priority,
        created_by_user_id=user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.patch("/admin/{announcement_id}", response_model=SiteAnnouncementOut)
def update_announcement(
    announcement_id: int,
    payload: SiteAnnouncementUpdate,
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
    db: Session = Depends(get_db),
) -> SiteAnnouncementOut:
    require_content_ops_access(auth_user)
    row = _get_alive(db, announcement_id)
    data = payload.model_dump(exclude_unset=True)
    if "title" in data and data["title"] is not None:
        row.title = str(data["title"]).strip()
    if "body" in data and data["body"] is not None:
        row.body = str(data["body"]).strip()
    if "is_active" in data and data["is_active"] is not None:
        row.is_active = bool(data["is_active"])
    if "priority" in data and data["priority"] is not None:
        row.priority = int(data["priority"])
    if "starts_at" in data and data["starts_at"] is not None:
        row.starts_at = _ensure_aware(data["starts_at"])
    if "ends_at" in data and data["ends_at"] is not None:
        row.ends_at = _ensure_aware(data["ends_at"])
    if row.ends_at <= row.starts_at:
        raise HTTPException(status_code=400, detail="ends_at must be after starts_at")
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/admin/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_announcement(
    announcement_id: int,
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
    db: Session = Depends(get_db),
) -> Response:
    require_content_ops_access(auth_user)
    row = _get_alive(db, announcement_id)
    row.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
