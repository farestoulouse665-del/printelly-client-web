from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.v1.dependencies import current_guest
from app.db.session import get_db
from app.models.entities import GuestSession, Order, OrderItem, Quote
from app.schemas.api import OrderCreateIn, OrderOut, QuoteCreateIn, QuoteOut
from app.services.assets import asset_service
from app.services.pricing import pricing_service


router = APIRouter(tags=["commerce"])


def serialize_quote(quote: Quote) -> QuoteOut:
    return QuoteOut(
        id=quote.id,
        currency=quote.currency,
        subtotal_dzd=quote.subtotal_dzd,
        discount_dzd=quote.discount_dzd,
        fees_dzd=quote.fees_dzd,
        delivery_dzd=quote.delivery_dzd,
        total_dzd=quote.total_dzd,
        breakdown=quote.breakdown,
        expires_at=quote.expires_at,
    )


@router.post("/quotes/preview", response_model=QuoteOut)
def preview_quote(
    body: QuoteCreateIn,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> QuoteOut:
    for line in body.lines:
        asset_service.owned_asset(database, line.asset_id, guest.id)
    calculated = pricing_service.calculate(body, database)
    return QuoteOut(
        id="preview",
        currency="DZD",
        subtotal_dzd=calculated.subtotal_dzd,
        discount_dzd=calculated.discount_dzd,
        fees_dzd=calculated.fees_dzd,
        delivery_dzd=calculated.delivery_dzd,
        total_dzd=calculated.total_dzd,
        breakdown=calculated.breakdown,
        expires_at=calculated.expires_at,
    )


@router.post("/quotes", response_model=QuoteOut, status_code=201)
def create_quote(
    body: QuoteCreateIn,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> QuoteOut:
    for line in body.lines:
        asset_service.owned_asset(database, line.asset_id, guest.id)
    calculated = pricing_service.calculate(body, database)
    quote = Quote(
        guest_session_id=guest.id,
        currency="DZD",
        subtotal_dzd=calculated.subtotal_dzd,
        discount_dzd=calculated.discount_dzd,
        fees_dzd=calculated.fees_dzd,
        delivery_dzd=calculated.delivery_dzd,
        total_dzd=calculated.total_dzd,
        breakdown=calculated.breakdown,
        expires_at=calculated.expires_at,
    )
    database.add(quote)
    database.commit()
    database.refresh(quote)
    return serialize_quote(quote)


@router.post("/orders", response_model=OrderOut, status_code=201)
def create_order(
    body: OrderCreateIn,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> OrderOut:
    quote = database.get(Quote, body.quote_id)
    if quote is None or quote.guest_session_id != guest.id:
        raise HTTPException(status_code=404, detail="Devis introuvable.")
    expires_at = quote.expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail="Le devis a expiré; recalculez le prix.")
    if not body.client_validated:
        raise HTTPException(status_code=422, detail="La validation explicite du client est requise.")

    assets = {
        line.asset_id: asset_service.owned_asset(database, line.asset_id, guest.id)
        for line in body.lines
    }
    order = Order(
        order_number=f"PB-{datetime.now(timezone.utc):%Y%m%d}-{secrets.token_hex(3).upper()}",
        guest_session_id=guest.id,
        user_id=guest.user_id,
        status="submitted",
        payment_status="pending",
        payment_method=body.payment_method,
        total_dzd=quote.total_dzd,
        customer=body.customer.model_dump(mode="json"),
        delivery=body.delivery.model_dump(mode="json"),
        notes=body.notes,
        client_validated_at=datetime.now(timezone.utc),
    )
    database.add(order)
    database.flush()

    line_prices = {
        item["asset_id"]: item
        for item in quote.breakdown.get("lines", [])
        if isinstance(item, dict)
    }
    for line in body.lines:
        asset = assets[line.asset_id]
        if not asset.final_key:
            raise HTTPException(
                status_code=409,
                detail=f"Le design {asset.name} n’a pas encore de PNG transparent validé.",
            )
        dpi = asset.width / (line.width_cm / 2.54)
        pricing = line_prices.get(line.asset_id, {})
        base = float(pricing.get("base_dzd", 0))
        fees = float(pricing.get("fees_dzd", 0))
        total = base + fees
        database.add(
            OrderItem(
                order_id=order.id,
                asset_id=asset.id,
                mask_version_id=asset.current_mask_version_id,
                width_cm=line.width_cm,
                height_cm=line.height_cm,
                quantity=line.quantity,
                dpi=round(dpi, 2),
                options=line.model_dump(mode="json"),
                unit_price_dzd=round(total / max(1, line.quantity), 2),
                total_dzd=round(total, 2),
            )
        )
    database.commit()
    database.refresh(order)
    return OrderOut.model_validate(order)


@router.get("/orders/{order_id}", response_model=OrderOut)
def get_order(
    order_id: str,
    guest: GuestSession = Depends(current_guest),
    database: Session = Depends(get_db),
) -> OrderOut:
    order = database.get(Order, order_id)
    owns_order = order is not None and (
        order.guest_session_id == guest.id
        or (guest.user_id is not None and order.user_id == guest.user_id)
    )
    if not owns_order:
        raise HTTPException(status_code=404, detail="Commande introuvable.")
    return OrderOut.model_validate(order)
