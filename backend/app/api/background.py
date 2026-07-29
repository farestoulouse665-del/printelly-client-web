from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import Response

from app.core.config import settings
from app.models.schemas import HealthResponse, RemovalMode
from app.services.image_validation import validate_upload
from app.services.mask_refinement import RefinementOptions

router = APIRouter(prefix="/api", tags=["background-removal"])


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
async def remove_background(
    request: Request,
    image: UploadFile = File(...),
    mode: RemovalMode = Form(RemovalMode.auto),
    refine: bool = Form(True),
    feather: float = Form(1.0),
    edge_shift: int = Form(0),
    decontaminate: bool = Form(False),
) -> Response:
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
    if not 0 <= feather <= 3:
        raise HTTPException(status_code=422, detail="feather doit être compris entre 0 et 3.")
    if not -3 <= edge_shift <= 3:
        raise HTTPException(status_code=422, detail="edge_shift doit être compris entre -3 et 3.")

    validated = await validate_upload(image, settings)
    try:
        options = RefinementOptions(
            refine=refine,
            feather=feather,
            edge_shift=edge_shift,
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
            "X-Model-Name": provider.name,
            "X-Warnings": json.dumps(report.warnings, ensure_ascii=True, separators=(",", ":")),
            "Access-Control-Expose-Headers": (
                "Content-Disposition,X-Image-Width,X-Image-Height,"
                "X-Processing-Ms,X-Foreground-Ratio,X-Model-Name,X-Warnings"
            ),
        }
        return Response(content=result.png, media_type="image/png", headers=headers)
    finally:
        validated.image.close()
        Path(validated.temp_path).unlink(missing_ok=True)
