from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class JobState(str, Enum):
    queued = "queued"
    decoding = "decoding"
    validating = "validating"
    analyzing = "analyzing"
    segmenting = "segmenting"
    refining = "refining"
    cleaning = "cleaning"
    generating_preview = "generating_preview"
    awaiting_review = "awaiting_review"
    exporting = "exporting"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


TERMINAL_JOB_STATES = {JobState.completed, JobState.failed, JobState.cancelled}


class RemovalProfile(str, Enum):
    automatic = "automatic"
    person_hair = "person_hair"
    logo_text = "logo_text"
    complex_illustration = "complex_illustration"
    product = "product"
    white_background = "white_background"
    black_background = "black_background"
    gray_background = "gray_background"
    colored_background = "colored_background"
    clean_transparent = "clean_transparent"
    preserve_shadows = "preserve_shadows"
    remove_shadows = "remove_shadows"
    dtf_high_precision = "dtf_high_precision"


class GuestSessionOut(BaseModel):
    id: str
    token: str
    expires_at: datetime
    retention_days: int


class UploadInitIn(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=3, max_length=100)
    byte_size: int = Field(gt=0)
    checksum_sha256: str | None = Field(default=None, pattern=r"^[a-fA-F0-9]{64}$")


class UploadInitOut(BaseModel):
    upload_id: str
    chunk_size: int
    expires_at: datetime


class UploadChunkOut(BaseModel):
    upload_id: str
    received_size: int
    expected_size: int
    complete: bool


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    original_filename: str
    mime_type: str
    byte_size: int
    width: int
    height: int
    dpi_x: float | None
    dpi_y: float | None
    color_profile: str
    has_transparency: bool
    status: str
    quality_score: int | None
    warnings: list[Any]
    archived: bool
    created_at: datetime
    updated_at: datetime
    original_download_url: str | None = None
    final_download_url: str | None = None


class AssetListOut(BaseModel):
    items: list[AssetOut]
    total: int


class BackgroundJobCreate(BaseModel):
    asset_id: str
    mode: RemovalProfile = RemovalProfile.automatic
    cleanup: Literal["light", "normal", "strong"] = "normal"
    black_background_mode: Literal["off", "exterior", "smart"] = "off"
    preserve_shadows: bool = False
    protect_details: bool = True
    remove_haze: bool = True
    decontaminate: bool = True
    feather: float = Field(default=1.0, ge=0, le=3)
    edge_shift: int = Field(default=0, ge=-3, le=3)
    background_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    output_original_size: bool = True


class JobEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    state: str
    progress: int
    message: str
    details: dict[str, Any]
    created_at: datetime


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    asset_id: str
    state: str
    progress: int
    stage_message: str
    mode: str
    parameters: dict[str, Any]
    report: dict[str, Any]
    error_code: str | None
    error_message: str | None
    cancel_requested: bool
    attempt: int
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    download_url: str | None = None


class NormalizedPoint(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    pressure: float = Field(default=1, ge=0, le=1)


class MaskOperationIn(BaseModel):
    kind: Literal[
        "restore_brush",
        "erase_brush",
        "protect_brush",
        "magic_exterior",
        "forgotten_background",
        "background_point",
        "subject_point",
        "lasso_restore",
        "lasso_erase",
        "lasso_protect",
        "edge_refine",
        "residue_cleanup",
    ]
    points: list[NormalizedPoint] = Field(default_factory=list, max_length=5000)
    radius: float = Field(default=0.025, gt=0, le=0.25)
    hardness: float = Field(default=0.8, ge=0, le=1)
    opacity: float = Field(default=1, ge=0, le=1)
    tolerance: float = Field(default=0.12, ge=0, le=1)
    parameters: dict[str, Any] = Field(default_factory=dict)

    @field_validator("points")
    @classmethod
    def require_points_for_manual_tools(
        cls, value: list[NormalizedPoint], info: Any
    ) -> list[NormalizedPoint]:
        kind = info.data.get("kind")
        if kind not in {"edge_refine", "residue_cleanup"} and not value:
            raise ValueError("Au moins un point est requis pour cet outil.")
        return value


class MaskVersionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    asset_id: str
    parent_id: str | None
    source: str
    operation_count: int
    is_current: bool
    created_at: datetime
    download_url: str | None = None


class PreflightAnalyzeIn(BaseModel):
    asset_id: str
    width: float = Field(gt=0, le=2000)
    height: float | None = Field(default=None, gt=0, le=2000)
    unit: Literal["cm", "mm", "in", "px"] = "cm"
    target_dpi: int = Field(default=300, ge=36, le=1200)


class PreflightIssueOut(BaseModel):
    code: str
    severity: Literal["info", "warning", "error"]
    title: str
    explanation: str
    location: dict[str, float] | None = None
    automatic_fix: str | None = None


class PreflightOut(BaseModel):
    id: str
    asset_id: str
    status: Literal["ready", "review", "correction_required"]
    score: int
    width_cm: float
    height_cm: float
    dpi: float
    issues: list[PreflightIssueOut]
    metrics: dict[str, Any]
    created_at: datetime


class QuoteLineIn(BaseModel):
    asset_id: str
    width_cm: float = Field(gt=0, le=200)
    height_cm: float = Field(gt=0, le=300)
    quantity: int = Field(gt=0, le=10_000)
    variants: int = Field(default=1, gt=0, le=100)
    individual_cut: bool = False
    resolution_enhancement: Literal["none", "2x", "4x", "300dpi", "600dpi"] = "none"
    human_review: bool = False
    cleanup_required: bool = False


class QuoteCreateIn(BaseModel):
    lines: list[QuoteLineIn] = Field(min_length=1, max_length=100)
    promo_code: str | None = Field(default=None, max_length=40)
    professional: bool = False
    delivery_dzd: float | None = Field(default=None, ge=0)


class QuoteOut(BaseModel):
    id: str
    currency: str
    subtotal_dzd: float
    discount_dzd: float
    fees_dzd: float
    delivery_dzd: float
    total_dzd: float
    breakdown: dict[str, Any]
    expires_at: datetime


class CustomerIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    phone: str = Field(pattern=r"^(?:\+213|0)(?:5|6|7)[0-9]{8}$")
    email: str | None = Field(default=None, max_length=320)


class DeliveryIn(BaseModel):
    wilaya_code: int = Field(ge=1, le=58)
    wilaya: str = Field(min_length=2, max_length=100)
    commune: str = Field(min_length=2, max_length=120)
    method: Literal["home", "relay"]
    address: str = Field(min_length=3, max_length=500)


class OrderCreateIn(BaseModel):
    quote_id: str
    lines: list[QuoteLineIn] = Field(min_length=1, max_length=100)
    customer: CustomerIn
    delivery: DeliveryIn
    payment_method: Literal["cash_on_delivery", "online", "manual", "deposit"]
    notes: str = Field(default="", max_length=2000)
    client_validated: bool


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    order_number: str
    status: str
    payment_status: str
    payment_method: str
    total_dzd: float
    customer: dict[str, Any]
    delivery: dict[str, Any]
    notes: str
    created_at: datetime


class HumanReviewCreateIn(BaseModel):
    asset_id: str
    ai_confidence: float = Field(ge=0, le=1)
    customer_notes: str = Field(default="", max_length=2000)


class HumanReviewDecisionIn(BaseModel):
    status: Literal["approved", "rejected", "needs_changes"]
    operator_notes: str = Field(default="", max_length=4000)


class AccountRegisterIn(BaseModel):
    email: str = Field(
        min_length=5,
        max_length=320,
        pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$",
    )
    display_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=12, max_length=128)
    locale: Literal["fr", "ar"] = "fr"


class AccountLoginIn(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class AccountOut(BaseModel):
    id: str
    email: str
    display_name: str
    locale: str
    is_admin: bool


class AccountSessionOut(BaseModel):
    token: str
    expires_at: datetime
    retention_days: int
    user: AccountOut


class HealthOut(BaseModel):
    status: str
    version: str
    database: str
    redis: str
    storage: str
    model_loaded: bool
    model_name: str
    execution_provider: str | None
    privacy: str = "Aucun fichier client n’est envoyé à un service tiers."


class ExportCreateIn(BaseModel):
    asset_id: str
    format: Literal["png", "alpha_png", "preview_jpg", "underbase_jpg"] = "png"
    preserve_canvas: bool = True
    crop_to_content: bool = False
    margin_mm: float = Field(default=0, ge=0, le=100)
    width_cm: float | None = Field(default=None, gt=0, le=2000)
    dpi: int = Field(default=300, ge=36, le=1200)
    remove_sensitive_metadata: bool = True
    quantity: int = Field(default=1, ge=1, le=10000)


class ExportOut(BaseModel):
    id: str
    asset_id: str
    format: str
    status: str
    filename: str
    byte_size: int
    download_url: str
    created_at: datetime
