from __future__ import annotations

import re
import secrets
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import Settings

_ALLOWED_MIME = {"image/png", "image/jpeg", "image/webp"}
_EXTENSIONS = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp"}


@dataclass
class ValidatedImage:
    image: Image.Image
    original_filename: str
    output_filename: str
    temp_path: Path


def _detect_format(header: bytes) -> str | None:
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if header.startswith(b"\xff\xd8\xff"):
        return "JPEG"
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "WEBP"
    return None


def _safe_unlink(path: Path) -> None:
    """Best-effort cleanup that never hides the original upload error."""
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def safe_output_name(filename: str | None) -> str:
    stem = Path(filename or "image").stem
    stem = re.sub(r"[^a-zA-Z0-9._-]+", "-", stem).strip("._-")[:80] or "image"
    return f"{stem}-sans-fond.png"


async def validate_upload(upload: UploadFile, config: Settings) -> ValidatedImage:
    declared = (upload.content_type or "").lower()
    if declared not in _ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Format refusé. Utilisez PNG, JPEG ou WEBP.",
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
                    if len(header) < 16:
                        header = (header + chunk)[:16]
                    target.write(chunk)
        except HTTPException:
            raise
        except OSError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Le serveur ne peut pas écrire le fichier temporaire.",
            ) from exc

        detected = _detect_format(header)
        if detected is None:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="La signature du fichier ne correspond pas à une image autorisée.",
            )

        Image.MAX_IMAGE_PIXELS = config.max_image_pixels
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
        except HTTPException:
            raise
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Image corrompue, illisible ou dangereusement grande.",
            ) from exc

        width, height = image.size
        if width < 2 or height < 2 or width * height > config.max_image_pixels:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Résolution refusée. Maximum: {config.max_image_pixels:,} pixels.",
            )

        return ValidatedImage(
            image=image,
            original_filename=upload.filename or "image",
            output_filename=safe_output_name(upload.filename),
            temp_path=temp_path,
        )
    except Exception:
        _safe_unlink(temp_path)
        raise
    finally:
        await upload.close()
