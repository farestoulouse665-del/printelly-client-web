from __future__ import annotations

import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.background import router as legacy_background_router
from app.api.v1.router import router as v1_router
from app.core.config import settings
from app.core.security import LocalRateLimiter
from app.db.session import create_schema_for_development
from app.providers.local_onnx_provider import LocalOnnxProvider
from app.services.background_removal import BackgroundRemovalPipeline


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("printelly.api")


def cleanup_expired_temp_files() -> None:
    settings.temp_dir.mkdir(parents=True, exist_ok=True)
    cutoff = time.time() - settings.temp_ttl_seconds
    for pattern in ("*.upload", "*.partial"):
        for path in settings.temp_dir.glob(pattern):
            try:
                if path.is_file() and path.stat().st_mtime < cutoff:
                    path.unlink(missing_ok=True)
            except OSError:
                continue


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_runtime_secrets()
    cleanup_expired_temp_files()
    settings.storage_root.mkdir(parents=True, exist_ok=True)
    try:
        await asyncio.to_thread(create_schema_for_development)
    except Exception:
        logger.exception("Database schema is unavailable; health will report degraded.")

    # Kept for the legacy synchronous endpoint. RQ workers own their persistent
    # session for v1 jobs, so no model is ever reloaded per request.
    provider = LocalOnnxProvider(settings)
    app.state.provider = None
    app.state.pipeline = None
    app.state.model_error = None
    if settings.load_legacy_model:
        try:
            await asyncio.to_thread(provider.load)
            app.state.provider = provider
            app.state.pipeline = BackgroundRemovalPipeline(
                provider,
                background_pipeline_v2_enabled=settings.background_pipeline_v2_enabled,
            )
        except Exception as exc:
            app.state.model_error = str(exc)
            logger.warning("Legacy model endpoint unavailable: %s", exc)
    else:
        app.state.model_error = "disabled: inference is owned by the RQ worker"
    yield
    app.state.pipeline = None
    app.state.provider = None
    cleanup_expired_temp_files()


app = FastAPI(
    title=settings.app_name,
    description=(
        "Préparation locale et privée de fichiers DTF. "
        "Aucune image n’est envoyée à un service tiers."
    ),
    version="1.0.0",
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url="/redoc" if settings.enable_docs else None,
    openapi_url="/openapi.json" if settings.enable_docs else None,
    lifespan=lifespan,
)
app.state.processing_slots = asyncio.Semaphore(max(1, settings.max_concurrent_jobs))
app.state.rate_limiter = LocalRateLimiter(
    settings.rate_limit_per_minute,
    trust_proxy_headers=settings.trust_proxy_headers,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "Content-Length",
        "X-Guest-Token",
        "X-Admin-Token",
        "X-Request-ID",
    ],
    expose_headers=[
        "Content-Disposition",
        "X-Image-Width",
        "X-Image-Height",
        "X-Processing-Ms",
        "X-Foreground-Ratio",
        "X-Residual-Haze",
        "X-Source-Alpha-Preserved",
        "X-Effective-Mode",
        "X-Black-Background-Mode",
        "X-Black-Background-Confidence",
        "X-Model-Name",
        "X-Warnings",
        "X-Request-ID",
    ],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    request_id = request.headers.get("x-request-id", "")[:64] or uuid.uuid4().hex
    request.state.request_id = request_id
    try:
        response = await call_next(request)
    except Exception:
        logger.exception(
            "Unhandled request error id=%s method=%s path=%s",
            request_id,
            request.method,
            request.url.path,
        )
        response = JSONResponse(
            status_code=500,
            content={
                "detail": "Erreur interne du moteur d’image.",
                "request_id": request_id,
            },
        )
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cross-Origin-Resource-Policy"] = "same-site"
    response.headers["Content-Security-Policy"] = (
        "default-src 'none'; frame-ancestors 'none'; "
        "img-src 'self' data:; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "script-src https://cdn.jsdelivr.net; connect-src 'self'"
    )
    response.headers["Cache-Control"] = response.headers.get("Cache-Control", "no-store")
    return response


app.include_router(v1_router)
app.include_router(legacy_background_router)
