from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.v1.dependencies import current_guest
from app.db.session import get_db
from app.models.entities import GuestSession, HumanReview
from app.schemas.api import HumanReviewCreateIn
from app.services.assets import asset_service


router = APIRouter(prefix="/human-reviews", tags=["human-review"])


@router.post("", status_code=201)
def request_review(
    body: HumanReviewCreateIn,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> dict:
    asset = asset_service.owned_asset(database, body.asset_id, guest.id)
    review = HumanReview(
        asset_id=asset.id,
        status="requested",
        ai_confidence=body.ai_confidence,
        customer_notes=body.customer_notes,
    )
    asset.status = "awaiting_review"
    database.add(review)
    database.commit()
    database.refresh(review)
    return {
        "id": review.id,
        "asset_id": review.asset_id,
        "status": review.status,
        "ai_confidence": review.ai_confidence,
        "customer_notes": review.customer_notes,
        "created_at": review.created_at,
    }
