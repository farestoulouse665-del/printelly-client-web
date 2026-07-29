from __future__ import annotations

import asyncio
import json
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import Response
from starlette.datastructures import FormData, UploadFile
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.models.schemas import BackgroundCleanup, HealthResponse, RemovalMode
from app.services.image_validation import validate_upload
from app.services.mask_refinement import RefinementOptions

router = APIRouter(prefix="/api", tags=["background-removal"])


def _text_field(form: FormData, name: str, default: str | None = None) -> str | None:
    value = form.get(name)
    if value is None:
        return default
    if not isinstance(value, str):
        raise HTTPException(status_code=422, detail=f"Le champ {name} est invalide.")
    return value


def _bool_field(form: FormData, name: str, default: bool) -> bool:
    value = _text_field(form, name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise HTTPException(status_code=422, detail=f"Le champ {name} doit être un booléen.")


def _float_field(form: FormData, name: str, default: float) -> float:
    value = _text_field(form, name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Le champ {name} doit être un nombre.") from exc


def _int_field(form: FormData, name: str, default: int) -> int:
    value = _text_field(form, name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Le champ {name} doit être un entier.") from exc


@asynccontextmanager
async def open_upload_form(request: Request) -> AsyncIterator[FormData]:
    """Parse multipart with the same explicit file limit advertised by the UI."""
    try:
        async with request.form(
            max_files=1,
            max_fields=16,
            max_part_size=settings.max_upload_bytes,
        ) as form:
            yield form
    except StarletteHTTPException as exc:
        detail = str(exc.detail)
        if exc.status_code == 400 and (
            "maximum size" in detail.lower()
            or "exceeded" in detail.lower()
            or "too large" in detail.lower()
        ):
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Le fichier dépasse {settings.max_upload_mb} Mo.",
            ) from exc
        raise


@router.get("/health", response_model=HealthResponse)
async def health(request: Request) -> HealthResponse:
    provider = getattr(request.app.state, "provider", None)
    model_error = getattr(request.app.state, "model_error", None)
    return HealthResponse(
        status="ready" if provider is not None else f"unavailable: {model_error or 'model missing'}",
        model_loaded=provider is not None,
        model_name=settings.model_name,
        device=provider.device if provider is not None else settings.device,
    )


@router.post("/remove-background")
async def remove_background(request: Request) -> Response:
    request.app.state.rate_limiter.check(request)
    provider = getattr(request.app.state, "provider", None)
    pipeline = getattr(request.app.state, "pipeline", None)
    if provider is None or pipeline is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Le modèle local n'est pas prêt. Vérifiez BACKGROUND_MODEL_PATH "
                "et BACKGROUND_MODEL_SHA256."
            ),
        )

    async with open_upload_form(request) as form:
        image = form.get("image")
        if not isinstance(image, UploadFile):
            raise HTTPException(status_code=422, detail="Le fichier image est obligatoire.")

        mode_value = _text_field(form, "mode", RemovalMode.auto.value)
        cleanup_value = _text_field(form, "background_cleanup", BackgroundCleanup.normal.value)
        try:
            mode = RemovalMode(mode_value)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Le mode de traitement est invalide.") from exc
        try:
            background_cleanup = BackgroundCleanup(cleanup_value)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Le nettoyage du fond est invalide.") from exc

        refine = _bool_field(form, "refine", True)
        feather = _float_field(form, "feather", 1.0)
        edge_shift = _int_field(form, "edge_shift", 0)
        decontaminate = _bool_field(form, "decontaminate", False)
        protect_details = _bool_field(form, "protect_details", True)
        remove_haze = _bool_field(form, "remove_haze", True)
        background_color = _text_field(form, "background_color")

        if not 0 <= feather <= 3:
            raise HTTPException(status_code=422, detail="feather doit être compris entre 0 et 3.")
        if not -3 <= edge_shift <= 3:
            raise HTTPException(status_code=422, detail="edge_shift doit être compris entre -3 et 3.")
        if background_color and not re.fullmatch(r"#[0-9a-fA-F]{6}", background_color):
            raise HTTPException(status_code=422, detail="La couleur de fond doit être au format #RRGGBB.")

        validated = await validate_upload(image, settings)

    try:
        options = RefinementOptions(
            refine=refine,
            feather=feather,
            edge_shift=edge_shift,
            background_cleanup=background_cleanup,
            protect_details=protect_details,
            remove_haze=remove_haze,
            background_color=background_color,
        )
        try:
            async with request.app.state.processing_slots:
                result = await asyncio.wait_for(
                    asyncio.to_thread(
                        pipeline.process,
                        validated.image,
                        mode,
                        options,
                        decontaminate=decontaminate,
                    ),
                    timeout=settings.request_timeout_seconds,
                )
        except TimeoutError as exc:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Le traitement a dépassé le délai autorisé.",
            ) from exc
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc

        report = result.report
        headers = {
            "Content-Disposition": f'attachment; filename="{validated.output_filename}"',
            "Cache-Control": "no-store",
            "X-Image-Width": str(report.width),
            "X-Image-Height": str(report.height),
            "X-Processing-Ms": str(report.processing_ms),
            "X-Foreground-Ratio": f"{report.foreground_ratio:.6f}",
            "X-Residual-Haze": f"{report.residual_haze_ratio:.6f}",
            "X-Model-Name": provider.name,
            "X-Warnings": json.dumps(report.warnings, ensure_ascii=True, separators=(",", ":")),
            "Access-Control-Expose-Headers": (
                "Content-Disposition,X-Image-Width,X-Image-Height,"
                "X-Processing-Ms,X-Foreground-Ratio,X-Residual-Haze,"
                "X-Model-Name,X-Warnings"
            ),
        }
        return Response(content=result.png, media_type="image/png", headers=headers)
    finally:
        validated.image.close()
        Path(validated.temp_path).unlink(missing_ok=True)
