"""Reference intent matching API (ref-intent-001)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile
from app.database import get_db
from app.schemas import RefIntentHitOut, RefIntentMatchIn, RefIntentMatchOut
from app.services.ref_intent_service import match_reference_intent

router = APIRouter(prefix="/ref-intent", tags=["ref-intent"])


@router.post("/match", response_model=RefIntentMatchOut)
def match_ref_intent(
    payload: RefIntentMatchIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> RefIntentMatchOut:
    del auth_user
    result = match_reference_intent(
        db,
        description=payload.description,
        reference_image=payload.reference_image,
        limit=payload.limit,
    )
    return RefIntentMatchOut(
        query_used=result.query_used,
        reference_image=result.reference_image,
        hits=[
            RefIntentHitOut(
                domain=hit.domain,
                id=hit.id,
                title=hit.title,
                snippet=hit.snippet,
                category=hit.category,
                tags=list(hit.tags),
                score=hit.score,
                match_reason=hit.match_reason,
            )
            for hit in result.hits
        ],
        empty_reason=result.empty_reason,
    )
