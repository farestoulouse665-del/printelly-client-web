from __future__ import annotations

from datetime import datetime, timezone

import psutil
from fastapi import APIRouter, Depends, HTTPException, Request
from redis import Redis
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.auth import require_admin
from app.core.config import settings
from app.db.session import get_db
from app.models.entities import (
    Asset,
    AuditLog,
    HumanReview,
    Order,
    PriceRule,
    ProcessingJob,
)
from app.schemas.api import HumanReviewDecisionIn
from app.services.job_queue import processing_queue


router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def audit(
    database: Session,
    request: Request,
    action: str,
    target_type: str,
    target_id: str | None,
    details: dict | None = None,
) -> None:
    database.add(
        AuditLog(
            actor_type="admin_token",
            action=action,
            target_type=target_type,
            target_id=target_id,
            request_id=getattr(request.state, "request_id", None),
            details=details or {},
        )
    )


@router.get("/dashboard")
def dashboard(database: Session = Depends(get_db)) -> dict:
    queue_count: int | None
    redis_state = "ready"
    try:
        queue_count = processing_queue().count
    except Exception:
        queue_count = None
        redis_state = "unavailable"
    memory = psutil.virtual_memory()
    return {
        "counts": {
            "assets": database.scalar(select(func.count(Asset.id))) or 0,
            "jobs_active": database.scalar(
                select(func.count(ProcessingJob.id)).where(
                    ProcessingJob.state.not_in(["completed", "failed", "cancelled"])
                )
            )
            or 0,
            "reviews_pending": database.scalar(
                select(func.count(HumanReview.id)).where(HumanReview.status == "requested")
            )
            or 0,
            "orders": database.scalar(select(func.count(Order.id))) or 0,
            "queue": queue_count,
        },
        "resources": {
            "cpu_percent": psutil.cpu_percent(interval=None),
            "memory_percent": memory.percent,
            "memory_available_bytes": memory.available,
        },
        "services": {"redis": redis_state},
    }


@router.get("/jobs")
def jobs(database: Session = Depends(get_db)) -> list[dict]:
    items = database.scalars(
        select(ProcessingJob).order_by(ProcessingJob.created_at.desc()).limit(100)
    )
    return [
        {
            "id": item.id,
            "asset_id": item.asset_id,
            "state": item.state,
            "progress": item.progress,
            "message": item.stage_message,
            "attempt": item.attempt,
            "error_code": item.error_code,
            "created_at": item.created_at,
        }
        for item in items
    ]


@router.get("/reviews")
def reviews(database: Session = Depends(get_db)) -> list[dict]:
    items = database.scalars(
        select(HumanReview).order_by(HumanReview.created_at.asc()).limit(100)
    )
    return [
        {
            "id": item.id,
            "asset_id": item.asset_id,
            "status": item.status,
            "ai_confidence": item.ai_confidence,
            "customer_notes": item.customer_notes,
            "operator_notes": item.operator_notes,
            "created_at": item.created_at,
        }
        for item in items
    ]


@router.post("/reviews/{review_id}/decision")
def decide_review(
    review_id: str,
    body: HumanReviewDecisionIn,
    request: Request,
    database: Session = Depends(get_db),
) -> dict:
    review = database.get(HumanReview, review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Vérification introuvable.")
    review.status = body.status
    review.operator_notes = body.operator_notes
    review.decision_at = datetime.now(timezone.utc)
    asset = database.get(Asset, review.asset_id)
    if asset:
        asset.status = "approved" if body.status == "approved" else "needs_changes"
    audit(database, request, "human_review.decision", "human_review", review.id, body.model_dump())
    database.commit()
    return {"id": review.id, "status": review.status, "decision_at": review.decision_at}


@router.get("/price-rules")
def price_rules(database: Session = Depends(get_db)) -> list[dict]:
    return [
        {
            "id": item.id,
            "code": item.code,
            "label_fr": item.label_fr,
            "label_ar": item.label_ar,
            "kind": item.kind,
            "amount_dzd": item.amount_dzd,
            "conditions": item.conditions,
            "active": item.active,
        }
        for item in database.scalars(select(PriceRule).order_by(PriceRule.code))
    ]


@router.post("/price-rules", status_code=201)
def create_price_rule(
    body: dict,
    request: Request,
    database: Session = Depends(get_db),
) -> dict:
    required = {"code", "label_fr", "kind", "amount_dzd"}
    if not required.issubset(body):
        raise HTTPException(status_code=422, detail="Règle tarifaire incomplète.")
    rule = PriceRule(
        code=str(body["code"])[:80],
        label_fr=str(body["label_fr"])[:160],
        label_ar=str(body.get("label_ar", ""))[:160],
        kind=str(body["kind"])[:32],
        amount_dzd=float(body["amount_dzd"]),
        conditions=body.get("conditions") or {},
        active=bool(body.get("active", True)),
    )
    database.add(rule)
    database.flush()
    audit(database, request, "price_rule.create", "price_rule", rule.id, {"code": rule.code})
    database.commit()
    return {"id": rule.id, "code": rule.code}
