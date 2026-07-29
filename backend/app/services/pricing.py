from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import PriceRule
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
    """Deterministic DZD pricing with database-backed administrative overrides."""

    quantity_tiers = (
        (100, 0.18),
        (50, 0.12),
        (20, 0.07),
        (10, 0.04),
    )

    @staticmethod
    def _rules(database: Session | None) -> dict[str, PriceRule]:
        if database is None:
            return {}
        return {
            rule.code: rule
            for rule in database.scalars(
                select(PriceRule).where(PriceRule.active.is_(True))
            )
        }

    @staticmethod
    def _amount(
        rules: dict[str, PriceRule],
        code: str,
        fallback: float,
    ) -> float:
        rule = rules.get(code)
        return float(rule.amount_dzd) if rule is not None else float(fallback)

    def calculate(
        self,
        request: QuoteCreateIn,
        database: Session | None = None,
    ) -> CalculatedQuote:
        rules = self._rules(database)
        surface_rate = self._amount(
            rules,
            "surface_cm2",
            settings.price_per_square_cm_dzd,
        )
        minimum_line = self._amount(
            rules,
            "minimum_line",
            settings.minimum_line_item_dzd,
        )
        lines: list[dict] = []
        subtotal = 0.0
        service_fees = 0.0
        total_quantity = 0

        for line in request.lines:
            surface = line.width_cm * line.height_cm
            base_unit = max(
                minimum_line / line.quantity,
                surface * surface_rate,
            )
            line_base = base_unit * line.quantity * line.variants
            line_fees = 0.0
            if line.individual_cut:
                line_fees += (
                    self._amount(rules, "individual_cut_each", 25)
                    * line.quantity
                    * line.variants
                )
            if line.human_review:
                line_fees += self._amount(rules, "human_review", 350)
            if line.cleanup_required:
                line_fees += self._amount(rules, "cleanup", 180)
            enhancement = {
                "none": 0.0,
                "2x": self._amount(rules, "enhancement_2x", 150),
                "4x": self._amount(rules, "enhancement_4x", 300),
                "300dpi": self._amount(rules, "enhancement_300dpi", 220),
                "600dpi": self._amount(rules, "enhancement_600dpi", 420),
            }[line.resolution_enhancement]
            line_fees += enhancement
            subtotal += line_base
            service_fees += line_fees
            total_quantity += line.quantity * line.variants
            lines.append(
                {
                    "asset_id": line.asset_id,
                    "request": line.model_dump(mode="json"),
                    "surface_cm2": round(surface, 2),
                    "quantity": line.quantity,
                    "variants": line.variants,
                    "base_dzd": round(line_base, 2),
                    "fees_dzd": round(line_fees, 2),
                }
            )

        discount_rate = 0.0
        configured_tiers = [
            (
                int(rule.conditions.get("minimum_quantity", 0)),
                max(0.0, min(0.8, float(rule.amount_dzd) / 100.0)),
            )
            for rule in rules.values()
            if rule.kind == "quantity_discount"
        ]
        tiers = sorted(configured_tiers, reverse=True) or list(self.quantity_tiers)
        for minimum, rate in tiers:
            if total_quantity >= minimum:
                discount_rate = rate
                break
        if request.professional:
            professional = self._amount(rules, "professional_discount", 12) / 100.0
            discount_rate = max(discount_rate, professional)
        if request.promo_code:
            promo = rules.get("promo_" + request.promo_code.strip().lower())
            if promo and promo.kind == "promo_discount":
                discount_rate = min(
                    0.8,
                    discount_rate + max(0.0, float(promo.amount_dzd) / 100.0),
                )

        discount = subtotal * discount_rate
        delivery = (
            float(request.delivery_dzd)
            if request.delivery_dzd is not None
            else self._amount(
                rules,
                "delivery_default",
                settings.default_delivery_dzd,
            )
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
                "price_per_square_cm_dzd": surface_rate,
                "minimum_line_item_dzd": minimum_line,
                "active_rule_codes": sorted(rules),
            },
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        )


pricing_service = PricingService()
