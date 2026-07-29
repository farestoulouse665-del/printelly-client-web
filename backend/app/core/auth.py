from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import GuestSession


def _hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def create_guest_session(database: Session) -> tuple[GuestSession, str]:
    secret = secrets.token_urlsafe(32)
    session = GuestSession(
        secret_hash=_hash_secret(secret),
        expires_at=datetime.now(timezone.utc)
        + timedelta(days=settings.retention_days_guest),
    )
    database.add(session)
    database.commit()
    database.refresh(session)
    return session, f"{session.id}.{secret}"


def resolve_guest_session(
    database: Session,
    token: str | None,
    *,
    required: bool = True,
) -> GuestSession | None:
    if not token:
        if required:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session invitée absente. Créez une session avant l’import.",
            )
        return None
    try:
        session_id, secret = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Session invitée invalide.") from exc
    session = database.get(GuestSession, session_id)
    now = datetime.now(timezone.utc)
    if (
        session is None
        or session.expires_at.replace(tzinfo=timezone.utc) <= now
        or not hmac.compare_digest(session.secret_hash, _hash_secret(secret))
    ):
        raise HTTPException(status_code=401, detail="Session invitée expirée ou invalide.")
    session.last_seen_at = now
    database.flush()
    return session


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    if not x_admin_token or not hmac.compare_digest(x_admin_token, settings.admin_token):
        raise HTTPException(status_code=403, detail="Accès administrateur refusé.")


def request_guest_token(request: Request) -> str | None:
    return request.headers.get("x-guest-token")
