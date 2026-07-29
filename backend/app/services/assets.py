from __future__ import annotations

import hashlib
import uuid
from io import BytesIO
from pathlib import Path

from PIL import Image
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models.entities import Asset
from app.schemas.api import AssetListOut, AssetOut
from app.services.image_validation import ValidatedImage
from app.storage.local import sanitize_filename, storage


_MIME_BY_SUFFIX = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".bmp": "image/bmp",
}


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _image_metadata(image: Image.Image) -> tuple[float | None, float | None, str, bool]:
    dpi = image.info.get("dpi")
    dpi_x = float(dpi[0]) if isinstance(dpi, tuple) and len(dpi) >= 2 else None
    dpi_y = float(dpi[1]) if isinstance(dpi, tuple) and len(dpi) >= 2 else None
    profile = "ICC intégré" if image.info.get("icc_profile") else image.mode
    has_transparency = "A" in image.getbands() and image.getchannel("A").getextrema()[0] < 255
    return dpi_x, dpi_y, profile[:80], has_transparency


def _preview_png(image: Image.Image, maximum: int = 1200) -> bytes:
    preview = image.convert("RGBA")
    preview.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
    output = BytesIO()
    preview.save(output, format="PNG", optimize=True)
    return output.getvalue()


class AssetService:
    def create_from_validated(
        self,
        database: Session,
        guest_session_id: str,
        validated: ValidatedImage,
        declared_mime: str | None,
    ) -> Asset:
        asset_id = str(uuid.uuid4())
        safe_name = sanitize_filename(validated.original_filename)
        suffix = Path(validated.original_filename).suffix.lower()
        mime_type = _MIME_BY_SUFFIX.get(suffix, declared_mime or "application/octet-stream")
        extension = suffix if suffix in _MIME_BY_SUFFIX else ".bin"
        original_key = f"assets/{asset_id}/original/{uuid.uuid4().hex}{extension}"
        preview_key = f"assets/{asset_id}/previews/import.png"
        storage.put_file(original_key, validated.temp_path)
        storage.put_bytes(preview_key, _preview_png(validated.image))
        dpi_x, dpi_y, profile, has_transparency = _image_metadata(validated.image)
        warnings: list[dict[str, str]] = []
        if not dpi_x:
            warnings.append(
                {
                    "code": "dpi_missing",
                    "message": "Le fichier ne contient pas de valeur DPI fiable.",
                }
            )
        if validated.image.width < 900 or validated.image.height < 900:
            warnings.append(
                {
                    "code": "low_pixel_dimensions",
                    "message": "La résolution peut être insuffisante pour une grande impression.",
                }
            )
        asset = Asset(
            id=asset_id,
            guest_session_id=guest_session_id,
            name=Path(safe_name).stem[:180],
            original_filename=validated.original_filename[:255],
            mime_type=mime_type,
            byte_size=validated.temp_path.stat().st_size,
            checksum_sha256=_sha256_file(validated.temp_path),
            width=validated.image.width,
            height=validated.image.height,
            dpi_x=dpi_x,
            dpi_y=dpi_y,
            color_profile=profile,
            has_transparency=has_transparency,
            original_key=original_key,
            preview_key=preview_key,
            status="uploaded",
            warnings=warnings,
        )
        database.add(asset)
        database.commit()
        database.refresh(asset)
        return asset

    @staticmethod
    def owned_asset(database: Session, asset_id: str, guest_session_id: str) -> Asset:
        asset = database.scalar(
            select(Asset).where(
                Asset.id == asset_id,
                Asset.guest_session_id == guest_session_id,
                Asset.deleted_at.is_(None),
            )
        )
        if asset is None:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Design introuvable.")
        return asset

    @staticmethod
    def query(
        guest_session_id: str,
        *,
        archived: bool | None,
        search_text: str | None,
    ) -> Select[tuple[Asset]]:
        statement = select(Asset).where(
            Asset.guest_session_id == guest_session_id,
            Asset.deleted_at.is_(None),
        )
        if archived is not None:
            statement = statement.where(Asset.archived.is_(archived))
        if search_text:
            statement = statement.where(Asset.name.ilike(f"%{search_text[:80]}%"))
        return statement.order_by(Asset.created_at.desc())

    @staticmethod
    def serialize(asset: Asset) -> AssetOut:
        return AssetOut.model_validate(asset).model_copy(
            update={
                "original_download_url": storage.signed_download_path(asset.original_key),
                "final_download_url": (
                    storage.signed_download_path(asset.final_key) if asset.final_key else None
                ),
            }
        )

    def list_assets(
        self,
        database: Session,
        guest_session_id: str,
        *,
        archived: bool | None,
        search_text: str | None,
        offset: int,
        limit: int,
    ) -> AssetListOut:
        base = self.query(
            guest_session_id,
            archived=archived,
            search_text=search_text,
        )
        total = database.scalar(select(func.count()).select_from(base.subquery())) or 0
        assets = list(database.scalars(base.offset(offset).limit(limit)))
        return AssetListOut(
            items=[self.serialize(asset) for asset in assets],
            total=int(total),
        )


asset_service = AssetService()
