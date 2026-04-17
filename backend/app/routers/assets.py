from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Asset
from app.schemas import AssetOut

router = APIRouter(prefix="/assets", tags=["assets"])


@router.get("", response_model=list[AssetOut])
def list_assets(db: Session = Depends(get_db)) -> list[Asset]:
    return list(db.scalars(select(Asset).order_by(Asset.created_at.desc())).all())


@router.post("/{asset_id}/like", response_model=AssetOut, status_code=status.HTTP_200_OK)
def like_asset(asset_id: int, db: Session = Depends(get_db)) -> Asset:
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.like_count += 1
    db.commit()
    db.refresh(asset)
    return asset


@router.post("/{asset_id}/share", response_model=AssetOut, status_code=status.HTTP_200_OK)
def share_asset(asset_id: int, db: Session = Depends(get_db)) -> Asset:
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.share_count += 1
    db.commit()
    db.refresh(asset)
    return asset
