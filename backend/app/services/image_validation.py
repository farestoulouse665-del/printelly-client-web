from __future__ import annotations

import re
import secrets
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import Settings
from app.services.security_scan import scan_local_file

_MIME_TO_FORMAT = {
    "image/png": "PNG",
    "image/x-png": "PNG",
    "image/jpeg": "JPEG",
    "image/jpg": "JPEG",
    "image/webp": "WEBP",
    "image/tiff": "TIFF",
    "image/x-tiff": "TIFF",
    "image/bmp": "BMP",
    "image/x-ms-bmp": "BMP",
}
_GENERIC_MIME = {"", "application/octet-stream"}
_ALLOWED_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"}


@dataclass
class ValidatedImage:
    image: Image.Image
    original_filename: str
    output_filename: str
    temp_path: Path
    detected_format: str = ""
    declared_mime: str = ""
    source_temp_path: Path | None = None


def _detect_format(header: bytes) -> str | None:
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if header.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "WEBP"
    if header.startswith((b"II*\x00", b"MM\x00*")):
        return "TIFF"
    if header.startswith(b"BM"):
        return "BMP"
    return None


def _safe_unlink(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def safe_output_name(filename: str | None) -> str:
    stem = Path(filename or "image").stem
    stem = unicodedata.normalize("NFKD", stem).encode("ascii", "ignore").decode("ascii")
    stem = re.sub(r"[^a-zA-Z0-9._-]+", "-", stem).strip("._-")[:80] or "image"
    return f"{stem}-sans-fond.png"


async def validate_upload(upload: UploadFile, config: Settings) -> ValidatedImage:
    declared = (upload.content_type or "").split(";", 1)[0].strip().lower()
    suffix = Path(upload.filename or "").suffix.lower()
    declared_format = _MIME_TO_FORMAT.get(declared)
    generic_with_known_extension = declared in _GENERIC_MIME and suffix in _ALLOWED_SUFFIXES
    if declared_format is None and not generic_with_known_extension:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Format raster refusé. Utilisez PNG, JPEG, WebP, TIFF ou BMP. Les PDF, SVG, PSD et AI passent par le convertisseur isolé.",
        )

    try:
        config.temp_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Le stockage temporaire du serveur est inaccessible.",
        ) from exc

    temp_path = config.temp_dir / f"{secrets.token_hex(16)}.upload"
    total = 0
    header = b""
    try:
        try:
            with temp_path.open("wb") as target:
                while chunk := await upload.read(1024 * 1024):
                    total += len(chunk)
                    if total > config.max_upload_bytes:
                        raise HTTPException(
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            detail=f"Le fichier dépasse {config.max_upload_mb} Mo.",
                        )
                    if len(header) < 32:
                        header = (header + chunk)[:32]
                    target.write(chunk)
        except HTTPException:
            raise
        except OSError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Le serveur ne peut pas écrire le fichier temporaire.",
            ) from exc

        if total == 0:
            raise HTTPException(status_code=422, detail="Le fichier est vide.")
        scan_local_file(temp_path, config)
        detected = _detect_format(header)
        if detected is None:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="La signature du fichier ne correspond pas à une image autorisée.",
            )
        if declared_format is not None and declared_format != detected:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Le type MIME annoncé ne correspond pas au contenu réel du fichier.",
            )

        previous_pixel_limit = Image.MAX_IMAGE_PIXELS
        Image.MAX_IMAGE_PIXELS = config.max_image_pixels
        try:
            try:
                with Image.open(temp_path) as probe:
                    if probe.format != detected:
                        raise HTTPException(
                            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                            detail="Le contenu du fichier ne correspond pas à son format.",
                        )
                    probe.verify()
                with Image.open(temp_path) as source:
                    source.load()
                    image = ImageOps.exif_transpose(source).copy()
                    image.info.update(source.info)
            except HTTPException:
                raise
            except MemoryError as exc:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=(
                        "Mémoire insuffisante pour décoder ce fichier. "
                        "Réduisez sa résolution ou augmentez la mémoire du worker."
                    ),
                ) from exc
            except (
                UnidentifiedImageError,
                OSError,
                ValueError,
                Image.DecompressionBombError,
            ) as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Image corrompue, illisible ou dangereusement grande.",
                ) from exc
        finally:
            Image.MAX_IMAGE_PIXELS = previous_pixel_limit

        width, height = image.size
        if width < 2 or height < 2 or width * height > config.max_image_pixels:
            image.close()
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Résolution refusée. Maximum: {config.max_image_pixels:,} pixels.",
            )

        return ValidatedImage(
            image=image,
            original_filename=upload.filename or "image",
            output_filename=safe_output_name(upload.filename),
            temp_path=temp_path,
            detected_format=detected,
            declared_mime=declared,
        )
    except Exception:
        _safe_unlink(temp_path)
        raise
    finally:
        await upload.close()
