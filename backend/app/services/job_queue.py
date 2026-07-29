from __future__ import annotations

from datetime import datetime, timezone

from redis import Redis
from rq import Queue
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.entities import JobEvent, ProcessingJob


def redis_connection() -> Redis:
    return Redis.from_url(
        settings.redis_url,
        socket_connect_timeout=2,
        socket_timeout=5,
        health_check_interval=30,
    )


def processing_queue() -> Queue:
    return Queue(
        settings.queue_name,
        connection=redis_connection(),
        default_timeout=settings.job_timeout_seconds,
    )


def record_event(
    database: Session,
    job: ProcessingJob,
    state: str,
    progress: int,
    message: str,
    details: dict | None = None,
    *,
    commit: bool = True,
) -> None:
    job.state = state
    job.progress = max(job.progress, min(100, progress)) if state not in {"failed", "cancelled"} else progress
    job.stage_message = message
    database.add(
        JobEvent(
            job_id=job.id,
            state=state,
            progress=progress,
            message=message,
            details=details or {},
        )
    )
    if commit:
        database.commit()


def enqueue_background_job(job: ProcessingJob) -> str:
    if settings.job_eager:
        from app.workers.background import process_background_job

        process_background_job(job.id)
        return f"eager-{job.id}"

    rq_job = processing_queue().enqueue(
        "app.workers.background.process_background_job",
        job.id,
        job_id=f"background-{job.id}-a{job.attempt}",
        result_ttl=3600,
        failure_ttl=7 * 24 * 3600,
        job_timeout=settings.job_timeout_seconds,
        retry=None,
    )
    with SessionLocal() as database:
        persisted = database.get(ProcessingJob, job.id)
        if persisted:
            persisted.queue_job_id = rq_job.id
            database.commit()
    return rq_job.id


def request_cancellation(job_id: str) -> None:
    with SessionLocal() as database:
        job = database.get(ProcessingJob, job_id)
        if job is None:
            return
        job.cancel_requested = True
        record_event(
            database,
            job,
            job.state,
            job.progress,
            "Annulation demandée; le worker termine l’étape atomique en cours.",
        )
    if settings.job_eager:
        return
    try:
        queue = processing_queue()
        rq_job = queue.fetch_job(f"background-{job_id}-a{job.attempt if job else 1}")
        if rq_job and rq_job.get_status(refresh=True) in {"queued", "deferred", "scheduled"}:
            rq_job.cancel()
            with SessionLocal() as database:
                persisted = database.get(ProcessingJob, job_id)
                if persisted:
                    persisted.finished_at = datetime.now(timezone.utc)
                    record_event(database, persisted, "cancelled", persisted.progress, "Traitement annulé.")
    except Exception:
        # The database flag remains authoritative if Redis is temporarily unavailable.
        return
