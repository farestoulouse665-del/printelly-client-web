from __future__ import annotations

import json

from fastapi import APIRouter, Request
from redis import Redis
from sqlalchemy import text

from app.api.v1 import (
    admin,
    assets,
    commerce,
    exports,
    files,
    jobs,
    masks,
    preflight,
    reviews,
    sessions,
)
from app.core.config import settings
from app.db.session import SessionLocal
from app.schemas.api import HealthOut
from app.storage.local import storage


router = APIRouter(prefix="/api/v1")


@router.get("/health", response_model=HealthOut, tags=["health"])
def health(request: Request) -> HealthOut:
    database_state = "ready"
    redis_state = "ready"
    storage_state = "ready"
    runtime: dict = {}
    try:
        with SessionLocal() as database:
            database.execute(text("SELECT 1"))
    except Exception:
        database_state = "unavailable"
    try:
        redis = Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=1,
        )
        redis.ping()
        encoded_runtime = redis.get("printelly:worker:model-runtime")
        if encoded_runtime:
            runtime = json.loads(encoded_runtime)
    except Exception:
        redis_state = "unavailable"
    try:
        storage.root.mkdir(parents=True, exist_ok=True)
        probe = ".health/probe"
        storage.put_bytes(probe, b"ready")
        storage.delete(probe)
    except Exception:
        storage_state = "unavailable"

    api_provider = getattr(request.app.state, "provider", None)
    model_loaded = bool(runtime.get("loaded")) or api_provider is not None
    execution_provider = runtime.get("provider") or getattr(
        api_provider,
        "execution_provider",
        None,
    )
    model_name = runtime.get("model") or settings.model_name
    required_ready = (
        database_state == "ready"
        and redis_state == "ready"
        and storage_state == "ready"
    )
    return HealthOut(
        status="ready" if required_ready else "degraded",
        version="1.0.0",
        database=database_state,
        redis=redis_state,
        storage=storage_state,
        model_loaded=model_loaded,
        model_name=model_name,
        execution_provider=execution_provider,
    )


router.include_router(sessions.router)
router.include_router(assets.router)
router.include_router(jobs.router)
router.include_router(masks.router)
router.include_router(preflight.router)
router.include_router(exports.router)
router.include_router(commerce.router)
router.include_router(reviews.router)
router.include_router(admin.router)
router.include_router(files.router)
