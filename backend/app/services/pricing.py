from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.schemas.api import QuoteCreateIn


@dataclass(frozen=True)
class CalculatedQuote:
    subtotal_dzd: float
    discount_dzd: float
    fees_dzd: float
    delivery_dzd: float
    total_dzd: float
    breakdown: dict
    expires_at: datetime


class PricingService:
    """Deterministic DZD pricing with explicit, auditable components."""

    quantity_tiers = (
        (100, 0.18),
        (50, 0.12),
        (20, 0.07),
        (10, 0.04),
    )

    def calculate(self, request: QuoteCreateIn) -> CalculatedQuote:
        lines: list[dict] = []
        subtotal = 0.0
        service_fees = 0.0
        total_quantity = 0

        for line in request.lines:
            surface = line.width_cm * line.height_cm
            base_unit = max(
                float(settings.minimum_line_item_dzd) / line.quantity,
                surface * settings.price_per_square_cm_dzd,
            )
            line_base = base_unit * line.quantity * line.variants
            line_fees = 0.0
            if line.individual_cut:
                line_fees += 25.0 * line.quantity
            if line.human_review:
                line_fees += 350.0
            if line.cleanup_required:
                line_fees += 180.0
            enhancement = {
                "none": 0.0,
                "2x": 150.0,
                "4x": 300.0,
                "300dpi": 220.0,
                "600dpi": 420.0,
            }[line.resolution_enhancement]
            line_fees += enhancement
            subtotal += line_base
            service_fees += line_fees
            total_quantity += line.quantity * line.variants
            lines.append(
                {
                    "asset_id": line.asset_id,
                    "surface_cm2": round(surface, 2),
                    "quantity": line.quantity,
                    "variants": line.variants,
                    "base_dzd": round(line_base, 2),
                    "fees_dzd": round(line_fees, 2),
                }
            )

        discount_rate = 0.0
        for minimum, rate in self.quantity_tiers:
            if total_quantity >= minimum:
                discount_rate = rate
                break
        if request.professional:
            discount_rate = max(discount_rate, 0.12)
        if request.promo_code and request.promo_code.strip().upper() == "PRINTELLY5":
            discount_rate = min(0.30, discount_rate + 0.05)

        discount = subtotal * discount_rate
        delivery = (
            float(request.delivery_dzd)
            if request.delivery_dzd is not None
            else float(settings.default_delivery_dzd)
        )
        total = max(0.0, subtotal - discount + service_fees + delivery)
        return CalculatedQuote(
            subtotal_dzd=round(subtotal, 2),
            discount_dzd=round(discount, 2),
            fees_dzd=round(service_fees, 2),
            delivery_dzd=round(delivery, 2),
            total_dzd=round(total, 2),
            breakdown={
                "currency": "DZD",
                "lines": lines,
                "quantity": total_quantity,
                "discount_rate": discount_rate,
                "price_per_square_cm_dzd": settings.price_per_square_cm_dzd,
                "minimum_line_item_dzd": settings.minimum_line_item_dzd,
            },
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        )


pricing_service = PricingService()
