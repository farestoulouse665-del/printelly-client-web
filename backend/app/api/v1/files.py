from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.storage.local import sanitize_filename, storage


router = APIRouter(prefix="/files", tags=["files"])


@router.get("/{key:path}", include_in_schema=False)
def download_file(
    key: str,
    expires: int = Query(...),
    signature: str = Query(..., min_length=64, max_length=64),
    filename: str | None = Query(default=None, max_length=160),
) -> FileResponse:
    if not storage.verify_signature(key, expires, signature, filename):
        raise HTTPException(status_code=403, detail="Lien expiré ou signature invalide.")
    if not storage.exists(key):
        raise HTTPException(status_code=404, detail="Fichier introuvable.")
    suffix = storage.internal_path(key).suffix.lower()
    media = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".pdf": "application/pdf",
        ".zip": "application/zip",
        ".json": "application/json",
    }.get(suffix, "application/octet-stream")
    download_name = sanitize_filename(filename or storage.internal_path(key).name)
    headers = {"Cache-Control": "private, no-store"}
    if filename is None and media.startswith("image/"):
        headers["Content-Disposition"] = f'inline; filename="{download_name}"'
    return FileResponse(
        storage.internal_path(key),
        media_type=media,
        filename=download_name if filename is not None else None,
        headers=headers,
    )
