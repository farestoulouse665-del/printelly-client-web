from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.dependencies import current_guest
from app.core.auth import (
    create_user_session,
    hash_password,
    resolve_guest_session,
    verify_password,
)
from app.core.config import settings
from app.db.session import get_db
from app.models.entities import Asset, GuestSession, User
from app.schemas.api import (
    AccountLoginIn,
    AccountOut,
    AccountRegisterIn,
    AccountSessionOut,
)


router = APIRouter(prefix="/accounts", tags=["accounts"])
_DUMMY_PASSWORD_HASH = "scrypt$16384$8$1$00000000000000000000000000000000$" + "00" * 32


def _serialize_user(user: User) -> AccountOut:
    return AccountOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        locale=user.locale,
        is_admin=user.is_admin,
    )


def _attach_user(
    database: Session,
    user: User,
    existing: GuestSession | None,
    existing_token: str | None,
) -> tuple[GuestSession, str]:
    if existing is None:
        return create_user_session(database, user)
    existing.user_id = user.id
    existing.expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.retention_days_user
    )
    database.execute(
        update(Asset)
        .where(Asset.guest_session_id == existing.id, Asset.user_id.is_(None))
        .values(user_id=user.id)
    )
    database.commit()
    database.refresh(existing)
    if not existing_token:
        raise RuntimeError("Le jeton de session existant est absent.")
    return existing, existing_token


def _response(user: User, session: GuestSession, token: str) -> AccountSessionOut:
    return AccountSessionOut(
        token=token,
        expires_at=session.expires_at,
        retention_days=settings.retention_days_user,
        user=_serialize_user(user),
    )


@router.post("/register", response_model=AccountSessionOut, status_code=201)
def register(
    body: AccountRegisterIn,
    x_guest_token: str | None = Header(default=None),
    database: Session = Depends(get_db),
) -> AccountSessionOut:
    email = body.email.strip().lower()
    if database.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Un compte utilise déjà cette adresse.")
    user = User(
        email=email,
        display_name=body.display_name.strip(),
        password_hash=hash_password(body.password),
        locale=body.locale,
        is_active=True,
        is_admin=False,
    )
    database.add(user)
    try:
        database.flush()
        existing = resolve_guest_session(
            database,
            x_guest_token,
            required=False,
        )
        session, token = _attach_user(database, user, existing, x_guest_token)
    except IntegrityError as exc:
        database.rollback()
        raise HTTPException(status_code=409, detail="Un compte utilise déjà cette adresse.") from exc
    return _response(user, session, token)


@router.post("/login", response_model=AccountSessionOut)
def login(
    body: AccountLoginIn,
    x_guest_token: str | None = Header(default=None),
    database: Session = Depends(get_db),
) -> AccountSessionOut:
    email = body.email.strip().lower()
    user = database.scalar(select(User).where(User.email == email))
    encoded = user.password_hash if user is not None else _DUMMY_PASSWORD_HASH
    valid = verify_password(body.password, encoded)
    if user is None or not user.is_active or not valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Adresse ou mot de passe incorrect.",
        )
    existing = resolve_guest_session(database, x_guest_token, required=False)
    session, token = _attach_user(database, user, existing, x_guest_token)
    return _response(user, session, token)


@router.get("/me", response_model=AccountOut)
def me(
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> AccountOut:
    if not guest.user_id:
        raise HTTPException(status_code=404, detail="La session est encore invitée.")
    user = database.get(User, guest.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Compte indisponible.")
    return _serialize_user(user)


@router.post("/logout", status_code=204)
def logout(
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> None:
    guest.expires_at = datetime.now(timezone.utc)
    database.commit()
