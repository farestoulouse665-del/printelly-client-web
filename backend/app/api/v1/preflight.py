from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.dependencies import current_guest
from app.db.session import get_db
from app.models.entities import GuestSession, PreflightReport
from app.schemas.api import PreflightAnalyzeIn, PreflightOut
from app.services.assets import asset_service
from app.services.dtf_preflight import preflight_analyzer
from app.storage.local import storage


router = APIRouter(prefix="/preflight", tags=["dtf-preflight"])


def serialize(report: PreflightReport) -> PreflightOut:
    return PreflightOut(
        id=report.id,
        asset_id=report.asset_id,
        status=report.status,
        score=report.score,
        width_cm=report.width_cm,
        height_cm=report.height_cm,
        dpi=report.dpi,
        issues=report.issues,
        metrics=report.metrics,
        created_at=report.created_at,
    )


@router.post("/analyze", response_model=PreflightOut, status_code=201)
def analyze(
    body: PreflightAnalyzeIn,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> PreflightOut:
    asset = asset_service.owned_asset(database, body.asset_id, guest.id)
    key = asset.final_key or asset.original_key
    result = preflight_analyzer.analyze(
        storage.get_bytes(key),
        width=body.width,
        height=body.height,
        unit=body.unit,
        target_dpi=body.target_dpi,
    )
    report = PreflightReport(
        asset_id=asset.id,
        mask_version_id=asset.current_mask_version_id,
        status=result.status,
        score=result.score,
        width_cm=result.width_cm,
        height_cm=result.height_cm,
        dpi=result.dpi,
        issues=[item.as_dict() for item in result.issues],
        metrics=result.metrics,
    )
    asset.quality_score = result.score
    database.add(report)
    database.commit()
    database.refresh(report)
    return serialize(report)


@router.get("/{asset_id}", response_model=PreflightOut)
def latest(
    asset_id: str,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> PreflightOut:
    asset_service.owned_asset(database, asset_id, guest.id)
    report = database.scalar(
        select(PreflightReport)
        .where(PreflightReport.asset_id == asset_id)
        .order_by(PreflightReport.created_at.desc())
    )
    if report is None:
        raise HTTPException(status_code=404, detail="Aucun contrôle DTF disponible.")
    return serialize(report)
