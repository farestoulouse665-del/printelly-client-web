from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.datastructures import Headers

from app.api.v1.dependencies import current_guest
from app.core.config import settings
from app.db.session import get_db
from app.models.entities import Asset, GuestSession, UploadSession
from app.schemas.api import (
    AssetListOut,
    AssetOut,
    UploadChunkOut,
    UploadInitIn,
    UploadInitOut,
)
from app.services.assets import asset_service
from app.services.image_validation import validate_upload
from app.storage.local import sanitize_filename, storage


router = APIRouter(prefix="/assets", tags=["assets"])


@router.post("/upload", response_model=AssetOut, status_code=201)
async def upload_asset(
    image: UploadFile = File(...),
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> AssetOut:
    declared_mime = image.content_type
    validated = await validate_upload(image, settings)
    try:
        asset = asset_service.create_from_validated(
            database,
            guest.id,
            validated,
            declared_mime,
        )
        return asset_service.serialize(asset)
    finally:
        validated.image.close()
        validated.temp_path.unlink(missing_ok=True)


@router.post("/upload/init", response_model=UploadInitOut, status_code=201)
def initialize_chunked_upload(
    body: UploadInitIn,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> UploadInitOut:
    if body.byte_size > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Le fichier dépasse {settings.max_upload_mb} Mo.",
        )
    active = database.scalar(
        select(UploadSession).where(
            UploadSession.guest_session_id == guest.id,
            UploadSession.status.in_(["initialized", "uploading"]),
        )
    )
    active_count = database.query(UploadSession).filter(
        UploadSession.guest_session_id == guest.id,
        UploadSession.status.in_(["initialized", "uploading"]),
    ).count()
    if active_count >= settings.max_batch_files:
        raise HTTPException(
            status_code=429,
            detail=f"Maximum {settings.max_batch_files} imports actifs par session.",
        )
    upload = UploadSession(
        guest_session_id=guest.id,
        filename=sanitize_filename(body.filename),
        mime_type=body.mime_type,
        expected_size=body.byte_size,
        checksum_sha256=body.checksum_sha256.lower() if body.checksum_sha256 else None,
        storage_key="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
    )
    database.add(upload)
    database.flush()
    upload.storage_key = f"uploads/{guest.id}/{upload.id}.partial"
    database.commit()
    return UploadInitOut(
        upload_id=upload.id,
        chunk_size=settings.upload_chunk_bytes,
        expires_at=upload.expires_at,
    )


@router.post("/upload/chunk", response_model=UploadChunkOut)
async def append_upload_chunk(
    request: Request,
    upload_id: str = Query(...),
    offset: int = Query(..., ge=0),
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> UploadChunkOut:
    upload = database.get(UploadSession, upload_id)
    if upload is None or upload.guest_session_id != guest.id:
        raise HTTPException(status_code=404, detail="Import introuvable.")
    if upload.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="La session d’import a expiré.")
    if offset != upload.received_size:
        raise HTTPException(
            status_code=409,
            detail={"message": "Décalage de reprise incorrect.", "expected_offset": upload.received_size},
        )
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > settings.upload_chunk_bytes:
        raise HTTPException(status_code=413, detail="Morceau trop volumineux.")
    payload = await request.body()
    if not payload or len(payload) > settings.upload_chunk_bytes:
        raise HTTPException(status_code=413, detail="Taille de morceau invalide.")
    if upload.received_size + len(payload) > upload.expected_size:
        raise HTTPException(status_code=409, detail="Le morceau dépasse la taille annoncée.")
    received = storage.append_bytes(upload.storage_key, payload)
    upload.received_size = received
    upload.chunk_count += 1
    upload.status = "uploading"
    database.commit()
    return UploadChunkOut(
        upload_id=upload.id,
        received_size=received,
        expected_size=upload.expected_size,
        complete=received == upload.expected_size,
    )


@router.post("/upload/complete", response_model=AssetOut)
async def complete_chunked_upload(
    upload_id: str,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> AssetOut:
    upload = database.get(UploadSession, upload_id)
    if upload is None or upload.guest_session_id != guest.id:
        raise HTTPException(status_code=404, detail="Import introuvable.")
    if upload.received_size != upload.expected_size or not storage.exists(upload.storage_key):
        raise HTTPException(status_code=409, detail="Tous les morceaux n’ont pas été reçus.")
    actual_checksum = storage.sha256(upload.storage_key)
    if upload.checksum_sha256 and actual_checksum != upload.checksum_sha256:
        upload.status = "failed"
        database.commit()
        storage.delete(upload.storage_key)
        raise HTTPException(status_code=422, detail="Le SHA-256 final ne correspond pas.")
    source_path = storage.internal_path(upload.storage_key)
    file_handle = source_path.open("rb")
    staged = UploadFile(
        file=file_handle,
        filename=upload.filename,
        headers=Headers({"content-type": upload.mime_type}),
    )
    validated = await validate_upload(staged, settings)
    try:
        asset = asset_service.create_from_validated(
            database,
            guest.id,
            validated,
            upload.mime_type,
        )
        upload.status = "completed"
        database.commit()
        return asset_service.serialize(asset)
    finally:
        validated.image.close()
        validated.temp_path.unlink(missing_ok=True)
        storage.delete(upload.storage_key)


@router.get("", response_model=AssetListOut)
def list_assets(
    archived: bool | None = None,
    search: str | None = Query(default=None, max_length=80),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> AssetListOut:
    return asset_service.list_assets(
        database,
        guest.id,
        archived=archived,
        search_text=search,
        offset=offset,
        limit=limit,
    )


@router.get("/{asset_id}", response_model=AssetOut)
def get_asset(
    asset_id: str,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> AssetOut:
    return asset_service.serialize(asset_service.owned_asset(database, asset_id, guest.id))


@router.post("/{asset_id}/archive", response_model=AssetOut)
def archive_asset(
    asset_id: str,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> AssetOut:
    asset = asset_service.owned_asset(database, asset_id, guest.id)
    asset.archived = True
    database.commit()
    database.refresh(asset)
    return asset_service.serialize(asset)


@router.post("/{asset_id}/restore", response_model=AssetOut)
def restore_asset(
    asset_id: str,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> AssetOut:
    asset = asset_service.owned_asset(database, asset_id, guest.id)
    asset.archived = False
    database.commit()
    database.refresh(asset)
    return asset_service.serialize(asset)


@router.delete("/{asset_id}", status_code=204)
def delete_asset(
    asset_id: str,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> None:
    asset = asset_service.owned_asset(database, asset_id, guest.id)
    asset.deleted_at = datetime.now(timezone.utc)
    asset.status = "deleted"
    database.commit()
