from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def new_id() -> str:
    return str(uuid.uuid4())


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    locale: Mapped[str] = mapped_column(String(8), default="fr")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)


class GuestSession(Base):
    __tablename__ = "guest_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    secret_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Asset(Base, TimestampMixin):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    guest_session_id: Mapped[str | None] = mapped_column(
        ForeignKey("guest_sessions.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(180))
    original_filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    byte_size: Mapped[int] = mapped_column(Integer)
    checksum_sha256: Mapped[str] = mapped_column(String(64), index=True)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    dpi_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    dpi_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    color_profile: Mapped[str] = mapped_column(String(80), default="RGB")
    has_transparency: Mapped[bool] = mapped_column(Boolean, default=False)
    original_key: Mapped[str] = mapped_column(String(512))
    source_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    preview_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    final_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="uploaded", index=True)
    quality_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    warnings: Mapped[list] = mapped_column(JSON, default=list)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    current_mask_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    pipeline_version: Mapped[str | None] = mapped_column(String(80), nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(120), nullable=True)

    __table_args__ = (
        Index("ix_assets_owner_created", "guest_session_id", "created_at"),
        Index("ix_assets_active", "deleted_at", "archived"),
    )


class UploadSession(Base):
    __tablename__ = "upload_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    guest_session_id: Mapped[str | None] = mapped_column(
        ForeignKey("guest_sessions.id"), nullable=True, index=True
    )
    filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    expected_size: Mapped[int] = mapped_column(Integer)
    received_size: Mapped[int] = mapped_column(Integer, default=0)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    storage_key: Mapped[str] = mapped_column(String(512))
    status: Mapped[str] = mapped_column(String(24), default="initialized")
    checksum_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProcessingJob(Base, TimestampMixin):
    __tablename__ = "processing_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    queue_job_id: Mapped[str | None] = mapped_column(String(80), nullable=True, unique=True)
    state: Mapped[str] = mapped_column(String(40), default="queued", index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    stage_message: Mapped[str] = mapped_column(String(255), default="Traitement en attente")
    mode: Mapped[str] = mapped_column(String(40), default="auto")
    parameters: Mapped[dict] = mapped_column(JSON, default=dict)
    result_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    report: Mapped[dict] = mapped_column(JSON, default=dict)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class JobEvent(Base):
    __tablename__ = "job_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("processing_jobs.id"), index=True)
    state: Mapped[str] = mapped_column(String(40))
    progress: Mapped[int] = mapped_column(Integer)
    message: Mapped[str] = mapped_column(String(255))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MaskVersion(Base):
    __tablename__ = "mask_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("mask_versions.id"), nullable=True)
    storage_key: Mapped[str] = mapped_column(String(512))
    source: Mapped[str] = mapped_column(String(24), default="ai")
    operation_count: Mapped[int] = mapped_column(Integer, default=0)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class MaskOperation(Base):
    __tablename__ = "mask_operations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    base_version_id: Mapped[str] = mapped_column(ForeignKey("mask_versions.id"))
    result_version_id: Mapped[str | None] = mapped_column(
        ForeignKey("mask_versions.id"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict] = mapped_column(JSON)
    sequence: Mapped[int] = mapped_column(Integer)
    undone: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PreflightReport(Base):
    __tablename__ = "preflight_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    mask_version_id: Mapped[str | None] = mapped_column(
        ForeignKey("mask_versions.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(32))
    score: Mapped[int] = mapped_column(Integer)
    width_cm: Mapped[float] = mapped_column(Float)
    height_cm: Mapped[float] = mapped_column(Float)
    dpi: Mapped[float] = mapped_column(Float)
    issues: Mapped[list] = mapped_column(JSON, default=list)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PriceRule(Base, TimestampMixin):
    __tablename__ = "price_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    code: Mapped[str] = mapped_column(String(80), unique=True)
    label_fr: Mapped[str] = mapped_column(String(160))
    label_ar: Mapped[str] = mapped_column(String(160), default="")
    kind: Mapped[str] = mapped_column(String(32))
    amount_dzd: Mapped[float] = mapped_column(Float)
    conditions: Mapped[dict] = mapped_column(JSON, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Quote(Base):
    __tablename__ = "quotes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    guest_session_id: Mapped[str | None] = mapped_column(
        ForeignKey("guest_sessions.id"), nullable=True, index=True
    )
    currency: Mapped[str] = mapped_column(String(3), default="DZD")
    subtotal_dzd: Mapped[float] = mapped_column(Float)
    discount_dzd: Mapped[float] = mapped_column(Float, default=0)
    fees_dzd: Mapped[float] = mapped_column(Float, default=0)
    delivery_dzd: Mapped[float] = mapped_column(Float, default=0)
    total_dzd: Mapped[float] = mapped_column(Float)
    breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    order_number: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    guest_session_id: Mapped[str | None] = mapped_column(
        ForeignKey("guest_sessions.id"), nullable=True, index=True
    )
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    payment_status: Mapped[str] = mapped_column(String(32), default="unpaid")
    payment_method: Mapped[str] = mapped_column(String(32), default="cash_on_delivery")
    total_dzd: Mapped[float] = mapped_column(Float)
    customer: Mapped[dict] = mapped_column(JSON)
    delivery: Mapped[dict] = mapped_column(JSON)
    notes: Mapped[str] = mapped_column(Text, default="")
    client_validated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    mask_version_id: Mapped[str | None] = mapped_column(
        ForeignKey("mask_versions.id"), nullable=True
    )
    width_cm: Mapped[float] = mapped_column(Float)
    height_cm: Mapped[float] = mapped_column(Float)
    quantity: Mapped[int] = mapped_column(Integer)
    dpi: Mapped[float] = mapped_column(Float)
    options: Mapped[dict] = mapped_column(JSON, default=dict)
    unit_price_dzd: Mapped[float] = mapped_column(Float)
    total_dzd: Mapped[float] = mapped_column(Float)


class HumanReview(Base, TimestampMixin):
    __tablename__ = "human_reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="requested", index=True)
    ai_confidence: Mapped[float] = mapped_column(Float)
    customer_notes: Mapped[str] = mapped_column(Text, default="")
    operator_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    operator_notes: Mapped[str] = mapped_column(Text, default="")
    decision_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_type: Mapped[str] = mapped_column(String(24))
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    action: Mapped[str] = mapped_column(String(120), index=True)
    target_type: Mapped[str] = mapped_column(String(80))
    target_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ExportRecord(Base):
    __tablename__ = "exports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), index=True)
    guest_session_id: Mapped[str | None] = mapped_column(
        ForeignKey("guest_sessions.id"), nullable=True, index=True
    )
    format: Mapped[str] = mapped_column(String(24), default="png")
    status: Mapped[str] = mapped_column(String(24), default="completed", index=True)
    storage_key: Mapped[str] = mapped_column(String(512))
    filename: Mapped[str] = mapped_column(String(255))
    options: Mapped[dict] = mapped_column(JSON, default=dict)
    byte_size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
