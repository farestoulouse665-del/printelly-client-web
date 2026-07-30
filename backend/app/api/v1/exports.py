from __future__ import annotations

import uuid
import zipfile
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.v1.dependencies import current_guest
from app.db.session import get_db
from app.models.entities import ExportRecord, GuestSession
from app.schemas.api import BatchExportIn, ExportCreateIn, ExportOut
from app.services.assets import asset_service
from app.services.exports import export_service
from app.storage.local import storage


router = APIRouter(prefix="/exports", tags=["exports"])


def serialize(record: ExportRecord) -> ExportOut:
    return ExportOut(
        id=record.id,
        asset_id=record.asset_id,
        format=record.format,
        status=record.status,
        filename=record.filename,
        byte_size=record.byte_size,
        download_url=storage.signed_download_path(
            record.storage_key,
            filename=record.filename,
        ),
        created_at=record.created_at,
    )


@router.post("", response_model=ExportOut, status_code=201)
def create_export(
    body: ExportCreateIn,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> ExportOut:
    asset = asset_service.owned_asset(database, body.asset_id, guest.id)
    if not asset.final_key and body.format in {"png", "alpha_png", "underbase_jpg"}:
        raise HTTPException(
            status_code=409,
            detail="Supprimez le fond avant de créer cet export.",
        )
    source_key = asset.final_key or asset.original_key
    payload, _media_type, extension = export_service.render(
        storage.get_bytes(source_key),
        body,
    )
    export_id = str(uuid.uuid4())
    filename = export_service.filename(asset.original_filename, body, extension)
    key = f"assets/{asset.id}/exports/{export_id}{extension}"
    storage.put_bytes(key, payload)
    record = ExportRecord(
        id=export_id,
        asset_id=asset.id,
        guest_session_id=guest.id,
        format=body.format,
        status="completed",
        storage_key=key,
        filename=filename,
        options=body.model_dump(mode="json"),
        byte_size=len(payload),
    )
    database.add(record)
    database.commit()
    database.refresh(record)
    return serialize(record)


@router.post("/batch", response_model=ExportOut, status_code=201)
def create_batch_export(
    body: BatchExportIn,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> ExportOut:
    archive_buffer = BytesIO()
    first_asset = None
    filenames: list[str] = []
    with zipfile.ZipFile(
        archive_buffer,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=6,
    ) as archive:
        for index, requested in enumerate(body.items, start=1):
            asset = asset_service.owned_asset(database, requested.asset_id, guest.id)
            if not asset.final_key:
                raise HTTPException(
                    status_code=409,
                    detail=f"Le design {asset.name} n’a pas encore de PNG transparent.",
                )
            first_asset = first_asset or asset
            png_request = requested.model_copy(update={"format": "png"})
            payload, _media_type, extension = export_service.render(
                storage.get_bytes(asset.final_key),
                png_request,
            )
            filename = export_service.filename(
                asset.original_filename,
                png_request,
                extension,
            )
            unique_name = f"{index:02d}_{filename}"
            filenames.append(unique_name)
            archive.writestr(unique_name, payload)
    if first_asset is None:
        raise HTTPException(status_code=422, detail="Aucun design à exporter.")
    payload = archive_buffer.getvalue()
    export_id = str(uuid.uuid4())
    filename = "TRANSFERLAB_exports_DTF.zip"
    key = f"assets/{first_asset.id}/exports/{export_id}.zip"
    storage.put_bytes(key, payload)
    record = ExportRecord(
        id=export_id,
        asset_id=first_asset.id,
        guest_session_id=guest.id,
        format="zip",
        status="completed",
        storage_key=key,
        filename=filename,
        options={"items": filenames},
        byte_size=len(payload),
    )
    database.add(record)
    database.commit()
    database.refresh(record)
    return serialize(record)


@router.get("/{export_id}", response_model=ExportOut)
def get_export(
    export_id: str,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> ExportOut:
    record = database.get(ExportRecord, export_id)
    if record is None or record.guest_session_id != guest.id:
        raise HTTPException(status_code=404, detail="Export introuvable.")
    return serialize(record)


@router.get("/{export_id}/download", response_model=ExportOut)
def get_export_download(
    export_id: str,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> ExportOut:
    return get_export(export_id, guest, database)
