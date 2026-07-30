from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import current_guest
from app.core.config import settings
from app.db.session import SessionLocal, get_db
from app.models.entities import GuestSession, JobEvent, ProcessingJob
from app.schemas.api import BackgroundJobCreate, JobOut
from app.services.assets import asset_service
from app.services.job_queue import enqueue_background_job, record_event, request_cancellation
from app.services.photoroom_upscale import PhotoRoomUpscaleService
from app.storage.local import storage


router = APIRouter(prefix="/background-removal/jobs", tags=["background-removal"])


def serialize_job(job: ProcessingJob) -> JobOut:
    return JobOut.model_validate(job).model_copy(
        update={
            "download_url": storage.signed_download_path(job.result_key)
            if job.result_key
            else None
        }
    )


@router.post("", response_model=JobOut, status_code=202)
def create_job(
    body: BackgroundJobCreate,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> JobOut:
    asset = asset_service.owned_asset(database, body.asset_id, guest.id)
    if body.upscale_mode != "off":
        if settings.background_provider != "photoroom":
            raise HTTPException(
                status_code=422,
                detail="L’upscale IA est disponible uniquement avec le fournisseur PhotoRoom.",
            )
        if not settings.photoroom_upscale_enabled:
            raise HTTPException(
                status_code=409,
                detail="L’upscale PhotoRoom est désactivé sur ce serveur.",
            )
        if not settings.photoroom_api_key:
            raise HTTPException(
                status_code=503,
                detail="PHOTOROOM_API_KEY est absente du serveur.",
            )
        limit = PhotoRoomUpscaleService.maximum_dimension(body.upscale_mode)
        if asset.width > limit or asset.height > limit:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Le mode {body.upscale_mode} accepte au maximum "
                    f"{limit} × {limit} pixels. Votre fichier mesure "
                    f"{asset.width} × {asset.height} pixels."
                ),
            )
    active = database.scalar(
        select(ProcessingJob).where(
            ProcessingJob.asset_id == asset.id,
            ProcessingJob.state.not_in(["completed", "failed", "cancelled"]),
        )
    )
    if active is not None:
        raise HTTPException(
            status_code=409,
            detail={"message": "Un traitement est déjà actif.", "job_id": active.id},
        )
    parameters = body.model_dump(mode="json", exclude={"asset_id", "mode"})
    job = ProcessingJob(
        asset_id=asset.id,
        mode=body.mode.value,
        parameters=parameters,
        state="queued",
        progress=0,
        stage_message="Traitement placé dans la file locale.",
    )
    asset.status = "queued"
    database.add(job)
    database.flush()
    record_event(database, job, "queued", 0, "Traitement placé dans la file locale.")
    database.refresh(job)
    try:
        queue_job_id = enqueue_background_job(job)
        database.refresh(job)
        if not job.queue_job_id:
            job.queue_job_id = queue_job_id
            database.commit()
            database.refresh(job)
    except Exception as exc:
        job.error_code = "queue_unavailable"
        job.error_message = str(exc)[:1000]
        record_event(
            database,
            job,
            "failed",
            0,
            "La file Redis est indisponible; aucun traitement n’a été simulé.",
        )
        raise HTTPException(status_code=503, detail="La file de traitements est indisponible.") from exc
    return serialize_job(job)


def _owned_job(database: Session, job_id: str, guest_id: str) -> ProcessingJob:
    job = database.get(ProcessingJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Traitement introuvable.")
    asset_service.owned_asset(database, job.asset_id, guest_id)
    return job


@router.get("/{job_id}", response_model=JobOut)
def get_job(
    job_id: str,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> JobOut:
    return serialize_job(_owned_job(database, job_id, guest.id))


@router.post("/{job_id}/cancel", response_model=JobOut)
def cancel_job(
    job_id: str,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> JobOut:
    job = _owned_job(database, job_id, guest.id)
    if job.state in {"completed", "failed", "cancelled"}:
        raise HTTPException(status_code=409, detail="Ce traitement est déjà terminé.")
    request_cancellation(job.id)
    database.refresh(job)
    return serialize_job(job)


@router.post("/{job_id}/retry", response_model=JobOut, status_code=202)
def retry_job(
    job_id: str,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> JobOut:
    job = _owned_job(database, job_id, guest.id)
    if job.state not in {"failed", "cancelled"}:
        raise HTTPException(status_code=409, detail="Seul un traitement échoué ou annulé peut être relancé.")
    job.attempt += 1
    job.cancel_requested = False
    job.error_code = None
    job.error_message = None
    job.started_at = None
    job.finished_at = None
    job.progress = 0
    record_event(database, job, "queued", 0, "Nouveau traitement placé dans la file locale.")
    try:
        job.queue_job_id = enqueue_background_job(job)
        database.commit()
        database.refresh(job)
    except Exception as exc:
        record_event(database, job, "failed", 0, "La file Redis est indisponible.")
        raise HTTPException(status_code=503, detail="La file de traitements est indisponible.") from exc
    return serialize_job(job)


@router.get("/{job_id}/events")
async def job_events(
    job_id: str,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> StreamingResponse:
    _owned_job(database, job_id, guest.id)

    async def stream():
        last_event_id = 0
        keepalive = 0
        while True:
            with SessionLocal() as event_database:
                job = event_database.get(ProcessingJob, job_id)
                events = list(
                    event_database.scalars(
                        select(JobEvent)
                        .where(JobEvent.job_id == job_id, JobEvent.id > last_event_id)
                        .order_by(JobEvent.id)
                    )
                )
                for event in events:
                    last_event_id = event.id
                    payload = {
                        "id": event.id,
                        "state": event.state,
                        "progress": event.progress,
                        "message": event.message,
                        "details": event.details,
                        "created_at": event.created_at.isoformat(),
                    }
                    yield f"id: {event.id}\nevent: progress\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                if job is None or job.state in {"completed", "failed", "cancelled"}:
                    yield "event: close\ndata: {}\n\n"
                    break
            keepalive += 1
            if keepalive % 20 == 0:
                yield ": keepalive\n\n"
            await asyncio.sleep(0.5)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
