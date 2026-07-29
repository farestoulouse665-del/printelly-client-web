from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class RemovalMode(str, Enum):
    auto = "auto"
    person = "person"
    design = "design"
    product = "product"


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_name: str
    device: str
    privacy: str = "Aucune image n'est envoyée à un service tiers."


class ProcessingReport(BaseModel):
    width: int
    height: int
    foreground_ratio: float = Field(ge=0, le=1)
    processing_ms: int
    warnings: list[str]
