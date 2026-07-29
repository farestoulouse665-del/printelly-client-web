from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import GuestSession, User


def _hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def hash_password(password: str) -> str:
    """Hash an account password with memory-hard scrypt and a unique salt."""
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=2**14,
        r=8,
        p=1,
        dklen=32,
    )
    return f"scrypt$16384$8$1$${salt.hex()}$${derived.hex()}"


def verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        algorithm, n, r, p, salt_hex, expected_hex = encoded.split("$", 5)
        if algorithm != "scrypt":
            return False
        derived = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(bytes.fromhex(expected_hex)),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(derived.hex(), expected_hex)


def _new_signed_session(
    database: Session,
    *,
    user: User | None = None,
    retention_days: int | None = None,
) -> tuple[GuestSession, str]:
    secret = secrets.token_urlsafe(32)
    session = GuestSession(
        user_id=user.id if user else None,
        secret_hash=_hash_secret(secret),
        expires_at=datetime.now(timezone.utc)
        + timedelta(
            days=retention_days
            if retention_days is not None
            else settings.retention_days_guest
        ),
    )
    database.add(session)
    database.commit()
    database.refresh(session)
    return session, f"{session.id}.{secret}"


def create_guest_session(database: Session) -> tuple[GuestSession, str]:
    return _new_signed_session(database)


def create_user_session(database: Session, user: User) -> tuple[GuestSession, str]:
    return _new_signed_session(
        database,
        user=user,
        retention_days=settings.retention_days_user,
    )


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
                detail="Session privée absente. Créez une session avant l’import.",
            )
        return None
    try:
        session_id, secret = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Session privée invalide.") from exc
    session = database.get(GuestSession, session_id)
    now = datetime.now(timezone.utc)
    if (
        session is None
        or session.expires_at.replace(tzinfo=timezone.utc) <= now
        or not hmac.compare_digest(session.secret_hash, _hash_secret(secret))
    ):
        raise HTTPException(status_code=401, detail="Session privée expirée ou invalide.")
    session.last_seen_at = now
    database.flush()
    return session


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    if not x_admin_token or not hmac.compare_digest(x_admin_token, settings.admin_token):
        raise HTTPException(status_code=403, detail="Accès administrateur refusé.")


def request_guest_token(request: Request) -> str | None:
    return request.headers.get("x-guest-token")
