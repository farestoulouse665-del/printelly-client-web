from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import create_guest_session
from app.core.config import settings
from app.db.session import get_db
from app.schemas.api import GuestSessionOut


router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("/guest", response_model=GuestSessionOut, status_code=201)
def new_guest_session(database: Session = Depends(get_db)) -> GuestSessionOut:
    session, token = create_guest_session(database)
    return GuestSessionOut(
        id=session.id,
        token=token,
        expires_at=session.expires_at,
        retention_days=settings.retention_days_guest,
    )
