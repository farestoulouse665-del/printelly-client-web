from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import current_guest
from app.api.v1.jobs import create_job
from app.db.session import get_db
from app.models.entities import GuestSession, MaskOperation, MaskVersion
from app.schemas.api import BackgroundJobCreate, JobOut, MaskOperationIn, MaskVersionOut
from app.services.assets import asset_service
from app.services.mask_editor import mask_editor
from app.storage.local import storage


router = APIRouter(prefix="/masks", tags=["masks"])


def serialize_version(version: MaskVersion) -> MaskVersionOut:
    return MaskVersionOut.model_validate(version).model_copy(
        update={"download_url": storage.signed_download_path(version.storage_key)}
    )


@router.post("/{asset_id}/operations", response_model=MaskVersionOut, status_code=201)
def apply_operation(
    asset_id: str,
    body: MaskOperationIn,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> MaskVersionOut:
    asset = asset_service.owned_asset(database, asset_id, guest.id)
    try:
        version = mask_editor.persist_operation(database, asset, body)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return serialize_version(version)


@router.post("/{asset_id}/undo", response_model=MaskVersionOut)
def undo(
    asset_id: str,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> MaskVersionOut:
    asset = asset_service.owned_asset(database, asset_id, guest.id)
    if not asset.current_mask_version_id:
        raise HTTPException(status_code=409, detail="Aucune version de masque.")
    current = database.get(MaskVersion, asset.current_mask_version_id)
    if current is None or current.parent_id is None:
        raise HTTPException(status_code=409, detail="Aucune correction à annuler.")
    parent = database.get(MaskVersion, current.parent_id)
    if parent is None:
        raise HTTPException(status_code=409, detail="Version parente introuvable.")
    operation = database.scalar(
        select(MaskOperation).where(MaskOperation.result_version_id == current.id)
    )
    current.is_current = False
    parent.is_current = True
    if operation:
        operation.undone = True
    asset.current_mask_version_id = parent.id
    asset.final_key = parent.storage_key
    asset.status = "edited" if parent.source == "manual" else "processed"
    database.commit()
    database.refresh(parent)
    return serialize_version(parent)


@router.post("/{asset_id}/redo", response_model=MaskVersionOut)
def redo(
    asset_id: str,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> MaskVersionOut:
    asset = asset_service.owned_asset(database, asset_id, guest.id)
    current = database.get(MaskVersion, asset.current_mask_version_id)
    if current is None:
        raise HTTPException(status_code=409, detail="Aucune version de masque.")
    operation = database.scalar(
        select(MaskOperation)
        .where(
            MaskOperation.asset_id == asset.id,
            MaskOperation.base_version_id == current.id,
            MaskOperation.undone.is_(True),
        )
        .order_by(MaskOperation.sequence.asc())
    )
    if operation is None or operation.result_version_id is None:
        raise HTTPException(status_code=409, detail="Aucune correction à rétablir.")
    result = database.get(MaskVersion, operation.result_version_id)
    if result is None:
        raise HTTPException(status_code=409, detail="Version de rétablissement introuvable.")
    current.is_current = False
    result.is_current = True
    operation.undone = False
    asset.current_mask_version_id = result.id
    asset.final_key = result.storage_key
    asset.status = "edited"
    database.commit()
    database.refresh(result)
    return serialize_version(result)


@router.post("/{asset_id}/recalculate", response_model=JobOut, status_code=202)
def recalculate(
    asset_id: str,
    body: BackgroundJobCreate,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> JobOut:
    """Re-run the real pipeline using editor constraints and selected mode."""
    asset_service.owned_asset(database, asset_id, guest.id)
    normalized = body.model_copy(update={"asset_id": asset_id})
    return create_job(normalized, guest, database)


@router.get("/{asset_id}/versions", response_model=list[MaskVersionOut])
def versions(
    asset_id: str,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> list[MaskVersionOut]:
    asset_service.owned_asset(database, asset_id, guest.id)
    items = list(
        database.scalars(
            select(MaskVersion)
            .where(MaskVersion.asset_id == asset_id)
            .order_by(MaskVersion.created_at.desc())
        )
    )
    return [serialize_version(item) for item in items]
