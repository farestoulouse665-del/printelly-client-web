from __future__ import annotations

import asyncio
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.background import router
from app.core.config import settings
from app.core.security import LocalRateLimiter
from app.providers.local_onnx_provider import LocalOnnxProvider
from app.services.background_removal import BackgroundRemovalPipeline


def cleanup_expired_temp_files() -> None:
    settings.temp_dir.mkdir(parents=True, exist_ok=True)
    cutoff = time.time() - settings.temp_ttl_seconds
    for path in settings.temp_dir.glob("*.upload"):
        try:
            if path.is_file() and path.stat().st_mtime < cutoff:
                path.unlink(missing_ok=True)
        except OSError:
            continue


@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_expired_temp_files()
    provider = LocalOnnxProvider(settings)
    app.state.provider = None
    app.state.pipeline = None
    app.state.model_error = None
    try:
        await asyncio.to_thread(provider.load)
        app.state.provider = provider
        app.state.pipeline = BackgroundRemovalPipeline(provider)
    except Exception as exc:
        # Health stays available and reports the actionable startup problem.
        app.state.model_error = str(exc)
    yield
    app.state.pipeline = None
    app.state.provider = None
    cleanup_expired_temp_files()


app = FastAPI(
    title="PRINTELLY — suppression d'arrière-plan locale",
    version="1.0.0",
    docs_url="/docs" if settings.enable_docs else None,
    redoc_url=None,
    lifespan=lifespan,
)
app.state.processing_slots = asyncio.Semaphore(max(1, settings.max_concurrent_jobs))
app.state.rate_limiter = LocalRateLimiter(settings.rate_limit_per_minute)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    expose_headers=[
        "Content-Disposition",
        "X-Image-Width",
        "X-Image-Height",
        "X-Processing-Ms",
        "X-Foreground-Ratio",
        "X-Model-Name",
        "X-Warnings",
    ],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cache-Control"] = response.headers.get("Cache-Control", "no-store")
    return response


app.include_router(router)
