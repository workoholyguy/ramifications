from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class TrackRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=1024)


class PricePointOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    price_cents: int | None
    in_stock: bool
    scraped_at: dt.datetime


class ListingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    retailer: str
    url: str
    affiliate_url: str | None
    last_price_cents: int | None = None
    last_seen_at: dt.datetime | None = None


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    canonical_sku: str
    brand: str
    model: str
    capacity_gb: int
    speed_mts: int
    cas: int | None
    image_url: str | None
    cheapest_price_cents: int | None = None
    cheapest_retailer: str | None = None
    listings: list[ListingOut] = []


class HistoryPoint(BaseModel):
    retailer: str
    price_cents: int | None
    in_stock: bool
    scraped_at: dt.datetime


class HistoryOut(BaseModel):
    item_id: int
    canonical_sku: str
    points: list[HistoryPoint]


class PurchaseRequest(BaseModel):
    listing_id: int
    purchase_date: dt.date
    purchase_price_cents: int = Field(..., ge=0)


class OverpayOut(BaseModel):
    purchase_price_cents: int
    purchase_date: dt.date
    purchase_retailer: str
    current_min_price_cents: int | None
    current_min_retailer: str | None
    delta_cents: int | None
    price_match_policy: str | None


class AlertRequest(BaseModel):
    target_price_cents: int = Field(..., ge=0)


class BuySignalOut(BaseModel):
    verdict: str  # BUY | WAIT | AVOID
    reason: str
    confidence: float
    cached: bool = False
    generated_at: dt.datetime
