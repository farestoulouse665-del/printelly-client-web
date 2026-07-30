from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from io import BytesIO

from PIL import Image, ImageOps
from redis import Redis
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.entities import Asset, MaskVersion, ProcessingJob
from app.models.schemas import BackgroundCleanup, BlackBackgroundMode, RemovalMode
from app.providers.local_onnx_provider import LocalOnnxProvider
from app.providers.photoroom_provider import PhotoroomProvider
from app.providers.removebg_provider import RemoveBgProvider
from app.providers.tiled_inference import TiledInferenceEngine
from app.services.background_removal import BackgroundRemovalPipeline
from app.services.job_queue import record_event
from app.services.mask_refinement import RefinementOptions
from app.storage.local import storage


logger = logging.getLogger("transferlab.worker")
RuntimeProvider = LocalOnnxProvider | RemoveBgProvider | PhotoroomProvider


_provider: RuntimeProvider | None = None
_pipeline: BackgroundRemovalPipeline | None = None


_MODE_MAP = {
    "automatic": RemovalMode.auto,
    "person_hair": RemovalMode.person,
    "logo_text": RemovalMode.design,
    "complex_illustration": RemovalMode.design,
    "product": RemovalMode.product,
    "white_background": RemovalMode.design,
    "black_background": RemovalMode.person,
    "gray_background": RemovalMode.design,
    "colored_background": RemovalMode.design,
    "clean_transparent": RemovalMode.design,
    "preserve_shadows": RemovalMode.product,
    "remove_shadows": RemovalMode.product,
    "dtf_high_precision": RemovalMode.design,
}


def _publish_runtime_heartbeat(provider: RuntimeProvider) -> None:
    try:
        redis = Redis.from_url(settings.redis_url, decode_responses=True)
        redis.setex(
            "transferlab:worker:model-runtime",
            120,
            json.dumps(
                {
                    "loaded": True,
                    "model": provider.name,
                    "provider": provider.execution_provider,
                    "device": provider.device,
                    "pipeline": settings.pipeline_version,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            ),
        )
    except Exception:
        logger.warning("Impossible de publier le heartbeat du modèle.", exc_info=True)


def get_runtime() -> tuple[RuntimeProvider, BackgroundRemovalPipeline]:
    """Load the configured provider once per worker process and reuse it."""
    global _provider, _pipeline
    if _provider is None or _pipeline is None:
        if settings.background_provider == "removebg":
            provider: RuntimeProvider = RemoveBgProvider(settings)
        elif settings.background_provider == "photoroom":
            provider = PhotoroomProvider(settings)
        elif settings.background_provider == "local":
            provider = LocalOnnxProvider(settings)
        else:
            raise RuntimeError(
                "BACKGROUND_PROVIDER doit valoir local, removebg ou photoroom."
            )
        provider.load()
        _provider = provider
        _pipeline = BackgroundRemovalPipeline(
            provider,
            background_pipeline_v2_enabled=settings.background_pipeline_v2_enabled,
        )
    _publish_runtime_heartbeat(_provider)
    return _provider, _pipeline


def _cancelled(database: Session, job: ProcessingJob) -> bool:
    database.refresh(job)
    if not job.cancel_requested:
        return False
    job.finished_at = datetime.now(timezone.utc)
    record_event(database, job, "cancelled", job.progress, "Traitement annulé.")
    return True


def _build_options(parameters: dict) -> RefinementOptions:
    return RefinementOptions(
        refine=True,
        feather=float(parameters.get("feather", 1.0)),
        edge_shift=int(parameters.get("edge_shift", 0)),
        background_cleanup=BackgroundCleanup(parameters.get("cleanup", "normal")),
        protect_details=bool(parameters.get("protect_details", True)),
        remove_haze=bool(parameters.get("remove_haze", True)),
        background_color=parameters.get("background_color"),
        black_background_mode=BlackBackgroundMode(
            parameters.get("black_background_mode", "off")
        ),
    )


def _make_preview(png: bytes, maximum: int = 1400) -> bytes:
    with Image.open(BytesIO(png)) as source:
        preview = source.convert("RGBA")
        preview.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
        output = BytesIO()
        preview.save(output, format="PNG", optimize=True)
        return output.getvalue()


def process_background_job(job_id: str) -> dict:
    """Run the local BiRefNet pipeline and persist every observable state."""
    image: Image.Image | None = None
    tiled_provider: TiledInferenceEngine | None = None
    with SessionLocal() as database:
        job = database.get(ProcessingJob, job_id)
        if job is None:
            raise RuntimeError(f"Job inconnu: {job_id}")
        asset = database.get(Asset, job.asset_id)
        if asset is None:
            raise RuntimeError(f"Asset inconnu: {job.asset_id}")
        try:
            job.started_at = datetime.now(timezone.utc)
            record_event(database, job, "decoding", 5, "Décodage sécurisé du fichier…")
            if _cancelled(database, job):
                return {"state": "cancelled"}

            source_path = storage.internal_path(asset.original_key)
            with Image.open(source_path) as opened:
                opened.load()
                image = ImageOps.exif_transpose(opened).copy()
                image.info.update(opened.info)
            record_event(
                database,
                job,
                "validating",
                12,
                "Validation des dimensions et du canal alpha…",
            )
            pixels = image.width * image.height
            if pixels > settings.max_image_pixels:
                raise RuntimeError("L’image dépasse la limite de pixels configurée.")
            if _cancelled(database, job):
                return {"state": "cancelled"}

            provider, pipeline = get_runtime()
            # A paid remote request is made once per design. Its returned alpha
            # is resized locally when the provider limits output resolution.
            use_tiles = (
                settings.background_provider == "local"
                and pixels >= settings.large_image_threshold_pixels
            )
            if use_tiles:
                tiled_provider = TiledInferenceEngine(
                    provider,
                    tile_size=settings.tile_size,
                    overlap=settings.tile_overlap,
                    temp_dir=settings.temp_dir,
                )
                pipeline = BackgroundRemovalPipeline(
                    tiled_provider,
                    background_pipeline_v2_enabled=settings.background_pipeline_v2_enabled,
                )
            record_event(
                database,
                job,
                "analyzing",
                22,
                "Analyse du fond, des bordures et des détails internes…",
                {
                    "model": provider.name,
                    "provider": provider.execution_provider,
                    "tiled_inference": use_tiles,
                    "tile_size": settings.tile_size if use_tiles else None,
                    "tile_overlap": settings.tile_overlap if use_tiles else None,
                },
            )
            effective_mode = _MODE_MAP.get(job.mode, RemovalMode.auto)
            options = _build_options(job.parameters)
            if (
                job.mode == "black_background"
                and options.black_background_mode is BlackBackgroundMode.off
            ):
                options = RefinementOptions(
                    refine=options.refine,
                    feather=options.feather,
                    edge_shift=options.edge_shift,
                    background_cleanup=options.background_cleanup,
                    protect_details=options.protect_details,
                    remove_haze=options.remove_haze,
                    background_color=options.background_color,
                    black_background_mode=BlackBackgroundMode.smart,
                )
            if _cancelled(database, job):
                return {"state": "cancelled"}

            record_event(
                database,
                job,
                "segmenting",
                35,
                "Segmentation BiRefNet ONNX réelle par tuiles…"
                if use_tiles
                else "Segmentation BiRefNet ONNX réelle…",
            )
            result = pipeline.process(
                image,
                effective_mode,
                options,
                decontaminate=bool(job.parameters.get("decontaminate", True)),
            )
            record_event(
                database,
                job,
                "refining",
                72,
                "Raffinement multi-échelle des contours…",
            )
            if _cancelled(database, job):
                return {"state": "cancelled"}

            result_key = f"assets/{asset.id}/results/{job.id}.png"
            preview_key = f"assets/{asset.id}/previews/{job.id}.png"
            storage.put_bytes(result_key, result.png)
            record_event(database, job, "cleaning", 82, "Contrôle des halos et résidus…")
            storage.put_bytes(preview_key, _make_preview(result.png))
            record_event(
                database,
                job,
                "generating_preview",
                90,
                "Génération de l’aperçu transparent…",
            )

            previous_versions = database.query(MaskVersion).filter(
                MaskVersion.asset_id == asset.id,
                MaskVersion.is_current.is_(True),
            )
            for version in previous_versions:
                version.is_current = False
            mask_version = MaskVersion(
                asset_id=asset.id,
                storage_key=result_key,
                source="ai",
                operation_count=0,
                is_current=True,
            )
            database.add(mask_version)
            database.flush()
            report = result.report.model_dump()
            report.update(
                {
                    "pipeline_version": settings.pipeline_version,
                    "model_version": provider.name,
                    "execution_provider": provider.execution_provider,
                    "tiled_inference": use_tiles,
                }
            )
            asset.final_key = result_key
            asset.preview_key = preview_key
            asset.current_mask_version_id = mask_version.id
            asset.status = "processed"
            asset.pipeline_version = settings.pipeline_version
            asset.model_version = provider.name
            asset.quality_score = max(0, 100 - len(result.report.warnings) * 8)
            asset.warnings = [
                {"code": "pipeline_warning", "message": warning}
                for warning in result.report.warnings
            ]
            job.result_key = result_key
            job.report = report
            record_event(
                database,
                job,
                "exporting",
                96,
                "Écriture du véritable PNG RGBA…",
            )
            job.finished_at = datetime.now(timezone.utc)
            record_event(
                database,
                job,
                "completed",
                100,
                "Votre fichier est prêt pour le DTF.",
            )
            _publish_runtime_heartbeat(provider)
            return {
                "state": "completed",
                "asset_id": asset.id,
                "result_key": result_key,
            }
        except Exception as exc:
            logger.exception("Background job failed id=%s", job_id)
            database.rollback()
            failed_job = database.get(ProcessingJob, job_id)
            if failed_job is not None:
                friendly_error = (
                    "Mémoire insuffisante pour ce fichier. Réduisez sa résolution, "
                    "la taille des tuiles ou le nombre de workers."
                    if isinstance(exc, MemoryError)
                    else str(exc)
                )
                failed_job.error_code = type(exc).__name__
                failed_job.error_message = friendly_error[:2000]
                failed_job.finished_at = datetime.now(timezone.utc)
                record_event(
                    database,
                    failed_job,
                    "failed",
                    failed_job.progress,
                    "Le traitement a échoué. Consultez le détail ou relancez le job.",
                    {"error_code": type(exc).__name__},
                )
            raise
        finally:
            if image is not None:
                image.close()
            if tiled_provider is not None:
                tiled_provider.cleanup()
