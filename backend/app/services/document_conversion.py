from __future__ import annotations

import re
import secrets
import subprocess
from pathlib import Path
from xml.etree import ElementTree

from defusedxml import ElementTree as SafeElementTree
from fastapi import HTTPException, UploadFile, status
from psd_tools import PSDImage
from starlette.datastructures import Headers

from app.core.config import Settings
from app.services.image_validation import ValidatedImage, validate_upload


_DOCUMENT_MIMES = {
    "application/pdf": "PDF",
    "application/postscript": "AI",
    "image/svg+xml": "SVG",
    "image/vnd.adobe.photoshop": "PSD",
    "application/x-photoshop": "PSD",
}
_DOCUMENT_SUFFIXES = {".pdf", ".svg", ".psd", ".ai"}
_FORBIDDEN_SVG_TAGS = {"script", "foreignObject", "iframe", "object", "embed", "audio", "video"}
_URL_ATTRS = {"href", "{http://www.w3.org/1999/xlink}href", "src"}


def _document_type(header: bytes, suffix: str) -> str | None:
    stripped = header.lstrip(b"\xef\xbb\xbf\x00\t\r\n ")
    if stripped.startswith(b"%PDF-"):
        return "AI" if suffix == ".ai" else "PDF"
    if header.startswith(b"8BPS"):
        return "PSD"
    lowered = stripped[:4096].lower()
    if b"<svg" in lowered and (lowered.startswith(b"<") or lowered.startswith(b"<?xml")):
        return "SVG"
    return None


async def _save_source(upload: UploadFile, config: Settings) -> Path:
    config.temp_dir.mkdir(parents=True, exist_ok=True)
    path = config.temp_dir / f"{secrets.token_hex(16)}.source"
    total = 0
    try:
        with path.open("wb") as output:
            while chunk := await upload.read(1024 * 1024):
                total += len(chunk)
                if total > config.max_upload_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Le fichier dépasse {config.max_upload_mb} Mo.",
                    )
                output.write(chunk)
        if total == 0:
            raise HTTPException(status_code=422, detail="Le fichier est vide.")
        return path
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()


def _sanitize_svg(source: Path, target: Path) -> None:
    raw = source.read_bytes()
    if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
        raise HTTPException(status_code=422, detail="SVG avec entités ou DOCTYPE refusé.")
    try:
        tree = SafeElementTree.parse(source)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="SVG corrompu ou non sécurisé.") from exc
    root = tree.getroot()
    if not root.tag.lower().endswith("svg"):
        raise HTTPException(status_code=422, detail="Le document ne contient pas de racine SVG.")
    for parent in list(root.iter()):
        for child in list(parent):
            local_name = child.tag.rsplit("}", 1)[-1]
            if local_name in _FORBIDDEN_SVG_TAGS:
                parent.remove(child)
        for attribute in list(parent.attrib):
            local_attr = attribute.rsplit("}", 1)[-1].lower()
            value = parent.attrib.get(attribute, "").strip().lower()
            if local_attr.startswith("on") or attribute in _URL_ATTRS and (
                value.startswith(("http:", "https:", "javascript:", "data:text/html"))
            ):
                del parent.attrib[attribute]
    ElementTree.ElementTree(root).write(target, encoding="utf-8", xml_declaration=True)


def _run(command: list[str], timeout: int) -> None:
    try:
        result = subprocess.run(
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=timeout,
            shell=False,
            env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/tmp"},
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise HTTPException(status_code=422, detail="La conversion locale a échoué ou dépassé le délai.") from exc
    if result.returncode != 0:
        error = result.stderr.decode("utf-8", "replace")[:300]
        raise HTTPException(status_code=422, detail=f"Conversion locale refusée: {error or 'erreur inconnue'}")


def _convert_document(source: Path, kind: str, config: Settings) -> Path:
    output = config.temp_dir / f"{secrets.token_hex(16)}.png"
    if kind == "PSD":
        try:
            psd = PSDImage.open(source)
            if psd.width * psd.height > config.max_image_pixels:
                raise HTTPException(status_code=413, detail="PSD trop grand pour la limite configurée.")
            psd.composite(force=True).save(output, format="PNG")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=422, detail="PSD illisible ou non compositable.") from exc
    elif kind in {"PDF", "AI"}:
        prefix = output.with_suffix("")
        _run(
            ["pdftoppm", "-f", "1", "-singlefile", "-r", "300", "-png", str(source), str(prefix)],
            min(config.request_timeout_seconds, 120),
        )
        generated = prefix.with_suffix(".png")
        if generated != output:
            generated.replace(output)
    elif kind == "SVG":
        sanitized = config.temp_dir / f"{secrets.token_hex(16)}.svg"
        try:
            _sanitize_svg(source, sanitized)
            _run(["rsvg-convert", "--keep-aspect-ratio", "--output", str(output), str(sanitized)], 60)
        finally:
            sanitized.unlink(missing_ok=True)
    else:
        raise HTTPException(status_code=415, detail="Format de conversion inconnu.")
    if not output.is_file() or output.stat().st_size == 0:
        raise HTTPException(status_code=422, detail="La conversion n’a produit aucune image.")
    return output


async def validate_or_convert_upload(upload: UploadFile, config: Settings) -> ValidatedImage:
    suffix = Path(upload.filename or "").suffix.lower()
    mime = (upload.content_type or "").split(";", 1)[0].strip().lower()
    if suffix not in _DOCUMENT_SUFFIXES and mime not in _DOCUMENT_MIMES:
        return await validate_upload(upload, config)
    if not config.allow_vector_conversion and suffix in {".pdf", ".svg", ".ai"}:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="La conversion PDF/SVG/AI est désactivée par ALLOW_VECTOR_CONVERSION.",
        )
    original_name = upload.filename or f"design{suffix}"
    source = await _save_source(upload, config)
    converted: Path | None = None
    try:
        with source.open("rb") as input_file:
            header = input_file.read(4096)
        detected = _document_type(header, suffix)
        declared = _DOCUMENT_MIMES.get(mime)
        if detected is None:
            raise HTTPException(status_code=415, detail="Signature PDF, SVG, PSD ou AI invalide.")
        if declared and declared != detected and not (declared == "PDF" and detected == "AI"):
            raise HTTPException(status_code=415, detail="Le MIME annoncé ne correspond pas au document.")
        if detected == "AI" and not header.lstrip().startswith(b"%PDF-"):
            raise HTTPException(status_code=415, detail="AI accepté uniquement avec données PDF compatibles.")
        converted = _convert_document(source, detected, config)
        file_handle = converted.open("rb")
        staged = UploadFile(
            file=file_handle,
            filename=Path(original_name).stem + ".png",
            headers=Headers({"content-type": "image/png"}),
        )
        validated = await validate_upload(staged, config)
        validated.original_filename = original_name
        validated.source_temp_path = source
        validated.detected_format = detected
        validated.declared_mime = mime
        return validated
    except Exception:
        source.unlink(missing_ok=True)
        raise
    finally:
        if converted:
            converted.unlink(missing_ok=True)
