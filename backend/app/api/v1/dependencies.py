from __future__ import annotations

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.auth import request_guest_token, resolve_guest_session
from app.db.session import get_db
from app.models.entities import GuestSession


def current_guest(
    request: Request,
    database: Session = Depends(get_db),
) -> GuestSession:
    return resolve_guest_session(database, request_guest_token(request), required=True)
