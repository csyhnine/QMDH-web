from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, require_ops_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import ProviderProfile
from app.schemas import ProviderCapability, ProviderProfileCreate, ProviderProfileOut, ProviderProfileUpdate
from app.services.model_registry import list_provider_capabilities

router = APIRouter(prefix="/providers", tags=["providers"])
PROVIDER_ADMIN_ROLES = {"admin", "owner", "ops"}


@router.get("", response_model=list[ProviderCapability])
def get_providers(db: Session = Depends(get_db)) -> list[ProviderCapability]:
    return [
        ProviderCapability(
            provider_name=item.provider_name,
            model_name=item.model_name,
            capabilities=item.capabilities,
            configurable=item.configurable,
            outbound=item.outbound,
            adapter_kind=item.adapter_kind,
        )
        for item in list_provider_capabilities(db, include_static=False)
    ]


def _mask_api_key(api_key: str) -> str:
    if not api_key:
        return ""
    if len(api_key) <= 8:
        return "*" * len(api_key)
    return f"{api_key[:4]}...{api_key[-4:]}"


def _to_profile_out(profile: ProviderProfile) -> ProviderProfileOut:
    return ProviderProfileOut(
        id=profile.id,
        provider_name=profile.provider_name,
        base_url=profile.base_url,
        model_name=profile.model_name,
        adapter_kind=profile.adapter_kind,
        capabilities=profile.capabilities or ["image.generate"],
        quality=profile.quality,
        output_format=profile.output_format,
        timeout_seconds=profile.timeout_seconds,
        enabled=profile.enabled,
        reference_mode=profile.reference_mode,
        reference_caption_model=profile.reference_caption_model,
        has_api_key=bool(profile.api_key),
        masked_api_key=_mask_api_key(profile.api_key),
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


def _require_provider_admin(auth_user: AuthUserProfile) -> None:
    if auth_user.role not in PROVIDER_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Provider profile admin access required")


@router.get("/profiles", response_model=list[ProviderProfileOut])
def list_provider_profiles(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[ProviderProfileOut]:
    require_ops_access(auth_user)
    profiles = db.scalars(select(ProviderProfile).order_by(ProviderProfile.provider_name)).all()
    return [_to_profile_out(profile) for profile in profiles]


@router.post("/profiles", response_model=ProviderProfileOut, status_code=status.HTTP_201_CREATED)
def create_provider_profile(
    payload: ProviderProfileCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ProviderProfileOut:
    _require_provider_admin(auth_user)
    existing = db.scalar(select(ProviderProfile).where(ProviderProfile.provider_name == payload.provider_name))
    if existing:
        raise HTTPException(status_code=409, detail="Provider profile already exists")

    profile = ProviderProfile(
        provider_name=payload.provider_name.strip(),
        api_key=payload.api_key.strip(),
        base_url=payload.base_url.strip().rstrip("/"),
        model_name=payload.model_name.strip(),
        adapter_kind=payload.adapter_kind.strip() or "openai_compatible",
        capabilities=[value.strip() for value in payload.capabilities if value.strip()] or ["image.generate"],
        quality=payload.quality.strip() or "medium",
        output_format=payload.output_format.strip() or "png",
        timeout_seconds=payload.timeout_seconds,
        enabled=payload.enabled,
        reference_mode=payload.reference_mode.strip() or "disabled",
        reference_caption_model=(payload.reference_caption_model or "").strip() or None,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return _to_profile_out(profile)


@router.patch("/profiles/{profile_id}", response_model=ProviderProfileOut)
def update_provider_profile(
    profile_id: int,
    payload: ProviderProfileUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ProviderProfileOut:
    _require_provider_admin(auth_user)
    profile = db.get(ProviderProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")

    updates = payload.model_dump(exclude_unset=True)
    if "api_key" in updates:
        api_key = (updates.pop("api_key") or "").strip()
        if api_key:
            profile.api_key = api_key

    for field, value in updates.items():
        if isinstance(value, str):
            value = value.strip()
        if field == "base_url" and isinstance(value, str):
            value = value.rstrip("/")
        if field == "capabilities" and isinstance(value, list):
            value = [item.strip() for item in value if item.strip()] or ["image.generate"]
        if field == "reference_caption_model" and value == "":
            value = None
        setattr(profile, field, value)

    db.commit()
    db.refresh(profile)
    return _to_profile_out(profile)


@router.delete("/profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Response:
    _require_provider_admin(auth_user)
    profile = db.get(ProviderProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")
    db.delete(profile)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
