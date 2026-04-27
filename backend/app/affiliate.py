"""Affiliate URL rewriting + retroactive overpay router.

Two responsibilities packed into one swarm-friendly module:

1. `apply_affiliate_to_url(url, retailer)` — rewrites a product URL to include
   an affiliate tag/link based on the retailer. Tags are read from env vars
   with sensible demo defaults so the function works out of the box.

2. `router` (FastAPI APIRouter) exposing:
     - POST /items/{item_id}/purchase  → record a Purchase against a Listing
     - GET  /items/{item_id}/overpay   → compare most-recent purchase to current
                                         min price; surface price-match policies.
"""

from __future__ import annotations

import os
from urllib.parse import quote, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Item, Listing, PricePoint, Purchase
from app.schemas import OverpayOut, PurchaseRequest

# ─── 1. Affiliate URL rewriter ────────────────────────────────────────────


def _append_query_param(url: str, key: str, value: str) -> str:
    """Append (or overwrite) a single query-string parameter on `url`.

    Uses urlsplit/urlunsplit so we don't accidentally double-up `?` or `&`.
    """
    parts = urlsplit(url)
    # Parse manually to preserve key order and avoid pulling in parse_qsl quirks.
    existing_pairs: list[tuple[str, str]] = []
    if parts.query:
        for pair in parts.query.split("&"):
            if not pair:
                continue
            k, _, v = pair.partition("=")
            if k == key:
                continue  # drop pre-existing same key, we'll add ours fresh
            existing_pairs.append((k, v))
    existing_pairs.append((key, value))
    new_query = urlencode(existing_pairs, doseq=True, safe=":/")
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, new_query, parts.fragment)
    )


def apply_affiliate_to_url(url: str, retailer: str) -> str | None:
    """Return an affiliate-tagged URL for `url`, or None if no rewrite applies.

    Tags come from env vars (with demo defaults so the function is useful in
    local dev without real partner credentials configured).
    """
    if not url or not retailer:
        return None

    r = retailer.lower().strip()

    if r == "amazon":
        tag = os.environ.get("AMAZON_AFFILIATE_TAG", "ramifications-20")
        return _append_query_param(url, "tag", tag)

    if r == "bestbuy":
        impact_id = os.environ.get("BESTBUY_IMPACT_ID", "demo-bestbuy")
        return (
            f"https://bestbuy.7tiv.net/c/{impact_id}/615985/10014"
            f"?u={quote(url, safe='')}"
        )

    if r == "newegg":
        pid = os.environ.get("NEWEGG_CJ_PID", "demo-newegg")
        return f"https://shareasale.com/r.cfm?b={pid}&u={quote(url, safe='')}"

    if r == "bh":
        tag = os.environ.get("BH_AFFILIATE_TAG", "demo-bh")
        return _append_query_param(url, "BI", tag)

    # microcenter and any other retailers: no affiliate program wired up.
    return None


# ─── 2. Retroactive overpay router ────────────────────────────────────────

router = APIRouter()


_PRICE_MATCH_POLICY: dict[str, str | None] = {
    "bestbuy": (
        "Best Buy honors price-match within 14 days. File at "
        "https://www.bestbuy.com/site/help-topics/price-match-guarantee/pcmcat297300050000.c"
    ),
    "newegg": (
        "Newegg honors price-match within 30 days. Email customer service "
        "or use the Returns & Refunds page."
    ),
    "microcenter": "Micro Center honors price-match within 30 days at the store.",
    "bh": None,
    "amazon": None,  # Amazon retired their general price-match in 2018
}


def _policy_for(retailer: str) -> str | None:
    return _PRICE_MATCH_POLICY.get(retailer.lower().strip())


@router.post("/items/{item_id}/purchase", status_code=201)
async def record_purchase(
    item_id: int,
    req: PurchaseRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Record that the user bought `listing_id` at a given price/date."""
    listing = await db.get(Listing, req.listing_id)
    if listing is None or listing.item_id != item_id:
        raise HTTPException(404, "listing not found for this item")

    purchase = Purchase(
        listing_id=req.listing_id,
        purchase_date=req.purchase_date,
        purchase_price_cents=req.purchase_price_cents,
    )
    db.add(purchase)
    await db.commit()
    await db.refresh(purchase)

    return {
        "id": purchase.id,
        "listing_id": purchase.listing_id,
        "retailer": listing.retailer,
        "purchase_date": purchase.purchase_date,
        "purchase_price_cents": purchase.purchase_price_cents,
    }


@router.get("/items/{item_id}/overpay", response_model=OverpayOut)
async def overpay(item_id: int, db: AsyncSession = Depends(get_db)) -> OverpayOut:
    """Compare the user's most recent purchase against the current min price."""
    item = await db.get(Item, item_id)
    if item is None:
        raise HTTPException(404, "item not found")

    # Most recent purchase joined to its listing, restricted to this item.
    purchase_row = await db.execute(
        select(Purchase, Listing)
        .join(Listing, Purchase.listing_id == Listing.id)
        .where(Listing.item_id == item_id)
        .order_by(Purchase.created_at.desc(), Purchase.id.desc())
        .limit(1)
    )
    row = purchase_row.first()
    if row is None:
        raise HTTPException(404, "no purchase recorded for this item")
    purchase, purchase_listing = row

    # Current min price: latest PricePoint per listing under this item, then min.
    pp_rows = await db.execute(
        select(PricePoint, Listing)
        .join(Listing, PricePoint.listing_id == Listing.id)
        .where(Listing.item_id == item_id)
        .order_by(PricePoint.scraped_at.desc())
    )
    seen_listings: set[int] = set()
    current_min_price_cents: int | None = None
    current_min_retailer: str | None = None
    for pp, listing in pp_rows.all():
        if listing.id in seen_listings:
            continue
        seen_listings.add(listing.id)
        if pp.price_cents is None:
            continue
        if current_min_price_cents is None or pp.price_cents < current_min_price_cents:
            current_min_price_cents = pp.price_cents
            current_min_retailer = listing.retailer

    delta_cents: int | None = (
        current_min_price_cents - purchase.purchase_price_cents
        if current_min_price_cents is not None
        else None
    )

    return OverpayOut(
        purchase_price_cents=purchase.purchase_price_cents,
        purchase_date=purchase.purchase_date,
        purchase_retailer=purchase_listing.retailer,
        current_min_price_cents=current_min_price_cents,
        current_min_retailer=current_min_retailer,
        delta_cents=delta_cents,
        price_match_policy=_policy_for(purchase_listing.retailer),
    )
