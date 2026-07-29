from __future__ import annotations

import hashlib
import uuid
from io import BytesIO
from pathlib import Path

from PIL import Image
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.models.entities import Asset, GuestSession, MaskVersion
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
    ".pdf": "application/pdf",
    ".svg": "image/svg+xml",
    ".psd": "image/vnd.adobe.photoshop",
    ".ai": "application/postscript",
}
_RASTER_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"}


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
    has_transparency = (
        "A" in image.getbands() and image.getchannel("A").getextrema()[0] < 255
    )
    return dpi_x, dpi_y, profile[:80], has_transparency


def _preview_png(image: Image.Image, maximum: int = 1200) -> bytes:
    preview = image.convert("RGBA")
    preview.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
    output = BytesIO()
    preview.save(output, format="PNG", optimize=True)
    return output.getvalue()


class AssetService:
    @staticmethod
    def _session(database: Session, guest_session_id: str) -> GuestSession:
        session = database.get(GuestSession, guest_session_id)
        if session is None:
            raise RuntimeError("Session propriétaire introuvable.")
        return session

    @classmethod
    def _owner_filter(cls, database: Session, guest_session_id: str):
        session = cls._session(database, guest_session_id)
        if session.user_id:
            return or_(
                Asset.user_id == session.user_id,
                Asset.guest_session_id == guest_session_id,
            )
        return Asset.guest_session_id == guest_session_id

    def create_from_validated(
        self,
        database: Session,
        guest_session_id: str,
        validated: ValidatedImage,
        declared_mime: str | None,
    ) -> Asset:
        owner_session = self._session(database, guest_session_id)
        asset_id = str(uuid.uuid4())
        safe_name = sanitize_filename(validated.original_filename)
        suffix = Path(validated.original_filename).suffix.lower()
        mime_type = _MIME_BY_SUFFIX.get(
            suffix,
            declared_mime or "application/octet-stream",
        )
        converted = validated.source_temp_path is not None
        working_extension = (
            ".png" if converted else (suffix if suffix in _RASTER_SUFFIXES else ".png")
        )
        original_key = (
            f"assets/{asset_id}/original/{uuid.uuid4().hex}{working_extension}"
        )
        source_key: str | None = None
        source_path = validated.source_temp_path or validated.temp_path
        if converted and validated.source_temp_path:
            source_extension = suffix if suffix in _MIME_BY_SUFFIX else ".source"
            source_key = (
                f"assets/{asset_id}/source/{uuid.uuid4().hex}{source_extension}"
            )
            storage.put_file(source_key, validated.source_temp_path)
        preview_key = f"assets/{asset_id}/previews/import.png"
        storage.put_file(original_key, validated.temp_path)
        storage.put_bytes(preview_key, _preview_png(validated.image))
        dpi_x, dpi_y, profile, has_transparency = _image_metadata(validated.image)
        warnings: list[dict[str, str]] = []
        if converted:
            warnings.append(
                {
                    "code": "converted_to_working_png",
                    "message": (
                        f"L’original {validated.detected_format} est conservé; "
                        "une copie PNG locale est utilisée pour le traitement."
                    ),
                }
            )
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
                    "message": (
                        "La résolution peut être insuffisante pour une grande impression."
                    ),
                }
            )
        asset = Asset(
            id=asset_id,
            user_id=owner_session.user_id,
            guest_session_id=guest_session_id,
            name=Path(safe_name).stem[:180],
            original_filename=validated.original_filename[:255],
            mime_type=mime_type,
            byte_size=source_path.stat().st_size,
            checksum_sha256=_sha256_file(source_path),
            width=validated.image.width,
            height=validated.image.height,
            dpi_x=dpi_x,
            dpi_y=dpi_y,
            color_profile=profile,
            has_transparency=has_transparency,
            original_key=original_key,
            source_key=source_key,
            preview_key=preview_key,
            status="uploaded",
            warnings=warnings,
        )
        database.add(asset)
        database.commit()
        database.refresh(asset)
        return asset

    @classmethod
    def owned_asset(
        cls,
        database: Session,
        asset_id: str,
        guest_session_id: str,
    ) -> Asset:
        asset = database.scalar(
            select(Asset).where(
                Asset.id == asset_id,
                cls._owner_filter(database, guest_session_id),
                Asset.deleted_at.is_(None),
            )
        )
        if asset is None:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Design introuvable.")
        return asset

    @classmethod
    def query(
        cls,
        database: Session,
        guest_session_id: str,
        *,
        archived: bool | None,
        search_text: str | None,
    ) -> Select[tuple[Asset]]:
        statement = select(Asset).where(
            cls._owner_filter(database, guest_session_id),
            Asset.deleted_at.is_(None),
        )
        if archived is not None:
            statement = statement.where(Asset.archived.is_(archived))
        if search_text:
            statement = statement.where(Asset.name.ilike(f"%{search_text[:80]}%"))
        return statement.order_by(Asset.created_at.desc())

    def duplicate(
        self,
        database: Session,
        source: Asset,
        guest_session_id: str,
    ) -> Asset:
        owner_session = self._session(database, guest_session_id)
        duplicate_id = str(uuid.uuid4())

        def copy_object(key: str | None, category: str) -> str | None:
            if not key:
                return None
            suffix = storage.internal_path(key).suffix
            target = f"assets/{duplicate_id}/{category}/{uuid.uuid4().hex}{suffix}"
            storage.put_file(target, storage.internal_path(key))
            return target

        original_key = copy_object(source.original_key, "original")
        if original_key is None:
            raise RuntimeError("L’original du design est introuvable.")
        source_key = copy_object(source.source_key, "source")
        preview_key = copy_object(source.preview_key, "previews")
        final_key = copy_object(source.final_key, "results")
        warnings = list(source.warnings or [])
        warnings.append(
            {
                "code": "duplicated_design",
                "message": "Cette copie est indépendante du design source.",
            }
        )
        duplicated = Asset(
            id=duplicate_id,
            user_id=owner_session.user_id,
            guest_session_id=guest_session_id,
            name=f"{source.name}-copie"[:180],
            original_filename=source.original_filename,
            mime_type=source.mime_type,
            byte_size=source.byte_size,
            checksum_sha256=source.checksum_sha256,
            width=source.width,
            height=source.height,
            dpi_x=source.dpi_x,
            dpi_y=source.dpi_y,
            color_profile=source.color_profile,
            has_transparency=source.has_transparency,
            original_key=original_key,
            source_key=source_key,
            preview_key=preview_key,
            final_key=final_key,
            status=source.status,
            quality_score=source.quality_score,
            warnings=warnings,
            archived=False,
            pipeline_version=source.pipeline_version,
            model_version=source.model_version,
        )
        database.add(duplicated)
        database.flush()
        if final_key:
            version = MaskVersion(
                asset_id=duplicated.id,
                storage_key=final_key,
                source="duplicate",
                operation_count=0,
                is_current=True,
            )
            database.add(version)
            database.flush()
            duplicated.current_mask_version_id = version.id
        database.commit()
        database.refresh(duplicated)
        return duplicated

    @staticmethod
    def serialize(asset: Asset) -> AssetOut:
        # The browser always receives the validated working raster. Original
        # SVG/PSD/PDF/AI sources remain private and are never rendered inline.
        return AssetOut.model_validate(asset).model_copy(
            update={
                "original_download_url": storage.signed_download_path(asset.original_key),
                "final_download_url": (
                    storage.signed_download_path(asset.final_key)
                    if asset.final_key
                    else None
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
            database,
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
