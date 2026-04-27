"""Core RAMifications API: items, listings, price history, refresh, alerts.

Buy-signal routes live in `buy_signal.py` (swarm Agent A).
Affiliate-rewrite + retroactive overpay routes live in `affiliate.py` (swarm Agent C).
"""

from __future__ import annotations

import asyncio
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.models import Alert, Item, Listing, PricePoint
from app.schemas import (
    AlertRequest,
    HistoryOut,
    HistoryPoint,
    ItemOut,
    ListingOut,
    TrackRequest,
)
from app.scraper import ScrapeResult, scrape_many
from app.seed_skus import SEED, find_seed_for_url, find_seed_by_sku

# Swarm Agent C exposes apply_affiliate_to_url(url, retailer) -> str | None.
# Until that module lands, fall back to no-op so routes still work.
try:
    from app.affiliate import apply_affiliate_to_url  # type: ignore[import-not-found]
except ImportError:
    def apply_affiliate_to_url(url: str, retailer: str) -> str | None:  # noqa: D401
        return None


router = APIRouter()


# ─── helpers ──────────────────────────────────────────────────────────────


async def _get_or_create_item_with_listings(
    db: AsyncSession, canonical_sku: str
) -> Item:
    """Find Item by canonical_sku, or create from seed (with all its listings)."""
    seed = find_seed_by_sku(canonical_sku)
    if seed is None:
        raise HTTPException(404, f"no seed for canonical_sku={canonical_sku}")

    result = await db.execute(
        select(Item)
        .where(Item.canonical_sku == canonical_sku)
        .options(selectinload(Item.listings))
    )
    item = result.scalar_one_or_none()
    if item is not None:
        return item

    item = Item(
        canonical_sku=seed.canonical_sku,
        brand=seed.brand,
        model=seed.model,
        capacity_gb=seed.capacity_gb,
        speed_mts=seed.speed_mts,
        cas=seed.cas,
        image_url=None,
    )
    for sl in seed.listings:
        item.listings.append(
            Listing(retailer=sl.retailer, url=sl.url, variant=sl.variant)
        )
    db.add(item)
    await db.flush()
    return item


async def _record_scrape(
    db: AsyncSession, listing: Listing, sr: ScrapeResult
) -> PricePoint:
    """Persist one ScrapeResult as a PricePoint and update listing metadata."""
    pp = PricePoint(
        listing_id=listing.id,
        price_cents=sr.price_cents,
        in_stock=sr.in_stock,
        title_at_scrape=sr.title,
        screenshot_path=sr.screenshot_path,
        scraped_at=dt.datetime.utcnow(),
    )
    db.add(pp)
    listing.last_seen_at = pp.scraped_at
    return pp


async def _scrape_and_record(
    db: AsyncSession, item: Item, listings: list[Listing]
) -> list[ScrapeResult]:
    """Run scrapes for the given listings in parallel and record PricePoints."""
    urls = [l.url for l in listings]
    if not urls:
        return []
    results = await scrape_many(urls, take_screenshot=False)
    by_url = {r.url: r for r in results}

    for listing in listings:
        sr = by_url.get(listing.url)
        if sr is None:
            continue
        await _record_scrape(db, listing, sr)
        # Bubble up image to item if missing
        if not item.image_url and sr.image_url:
            item.image_url = sr.image_url

    await db.commit()
    return results


async def _build_item_out(db: AsyncSession, item: Item) -> ItemOut:
    """Load Item + listings + each listing's latest PricePoint, compute cheapest."""
    result = await db.execute(
        select(Item)
        .where(Item.id == item.id)
        .options(selectinload(Item.listings).selectinload(Listing.price_points))
    )
    item = result.scalar_one()

    listings_out: list[ListingOut] = []
    cheapest_price: int | None = None
    cheapest_retailer: str | None = None

    for listing in item.listings:
        latest = max(
            (pp for pp in listing.price_points if pp.price_cents is not None),
            key=lambda p: p.scraped_at,
            default=None,
        )
        last_price = latest.price_cents if latest else None
        listings_out.append(
            ListingOut(
                id=listing.id,
                retailer=listing.retailer,
                url=listing.url,
                affiliate_url=listing.affiliate_url
                or apply_affiliate_to_url(listing.url, listing.retailer),
                variant=listing.variant,
                last_price_cents=last_price,
                last_seen_at=listing.last_seen_at,
            )
        )
        if last_price is not None and (cheapest_price is None or last_price < cheapest_price):
            cheapest_price = last_price
            cheapest_retailer = listing.retailer

    return ItemOut(
        id=item.id,
        canonical_sku=item.canonical_sku,
        brand=item.brand,
        model=item.model,
        capacity_gb=item.capacity_gb,
        speed_mts=item.speed_mts,
        cas=item.cas,
        image_url=item.image_url,
        cheapest_price_cents=cheapest_price,
        cheapest_retailer=cheapest_retailer,
        listings=listings_out,
    )


# ─── routes ───────────────────────────────────────────────────────────────


@router.post("/items", response_model=ItemOut, status_code=201)
async def track(req: TrackRequest, db: AsyncSession = Depends(get_db)) -> ItemOut:
    """Paste a product URL → canonicalize → ensure Item+Listings exist → scrape all in parallel."""
    match = find_seed_for_url(req.url)
    if match is None:
        raise HTTPException(
            422,
            {
                "error": "url not in seeded SKU set",
                "supported_skus": [it.canonical_sku for it in SEED],
                "hint": "v1 supports 3 curated DDR5 RAM SKUs; paste a URL from one of them",
            },
        )
    seed_item, _ = match
    item = await _get_or_create_item_with_listings(db, seed_item.canonical_sku)
    await _scrape_and_record(db, item, list(item.listings))
    return await _build_item_out(db, item)


@router.get("/items", response_model=list[ItemOut])
async def list_items(db: AsyncSession = Depends(get_db)) -> list[ItemOut]:
    result = await db.execute(select(Item).options(selectinload(Item.listings)))
    items = result.scalars().all()
    return [await _build_item_out(db, it) for it in items]


@router.get("/items/{item_id}", response_model=ItemOut)
async def get_item(item_id: int, db: AsyncSession = Depends(get_db)) -> ItemOut:
    item = await db.get(Item, item_id)
    if item is None:
        raise HTTPException(404, "item not found")
    return await _build_item_out(db, item)


@router.get("/items/{item_id}/history", response_model=HistoryOut)
async def history(item_id: int, db: AsyncSession = Depends(get_db)) -> HistoryOut:
    item = await db.get(Item, item_id)
    if item is None:
        raise HTTPException(404, "item not found")

    result = await db.execute(
        select(PricePoint, Listing)
        .join(Listing, PricePoint.listing_id == Listing.id)
        .where(Listing.item_id == item_id)
        .order_by(PricePoint.scraped_at.asc())
    )
    rows = result.all()
    points = [
        HistoryPoint(
            retailer=l.retailer,
            listing_id=l.id,
            variant=l.variant,
            price_cents=pp.price_cents,
            in_stock=pp.in_stock,
            scraped_at=pp.scraped_at,
        )
        for pp, l in rows
    ]
    return HistoryOut(item_id=item.id, canonical_sku=item.canonical_sku, points=points)


@router.post("/items/{item_id}/refresh", response_model=ItemOut)
async def refresh(item_id: int, db: AsyncSession = Depends(get_db)) -> ItemOut:
    item = await db.get(Item, item_id, options=[selectinload(Item.listings)])
    if item is None:
        raise HTTPException(404, "item not found")
    await _scrape_and_record(db, item, list(item.listings))
    return await _build_item_out(db, item)


@router.post("/refresh-all", response_model=list[ItemOut])
async def refresh_all(db: AsyncSession = Depends(get_db)) -> list[ItemOut]:
    result = await db.execute(select(Item).options(selectinload(Item.listings)))
    items = result.scalars().all()
    if not items:
        return []
    # Flatten to one big parallel scrape across all SKUs
    all_listings: list[Listing] = [l for it in items for l in it.listings]
    urls = [l.url for l in all_listings]
    scrapes = await scrape_many(urls, take_screenshot=False)
    by_url = {s.url: s for s in scrapes}
    for listing in all_listings:
        sr = by_url.get(listing.url)
        if sr is None:
            continue
        await _record_scrape(db, listing, sr)
        # bubble image up to its parent item
        parent = next((it for it in items if it.id == listing.item_id), None)
        if parent and not parent.image_url and sr.image_url:
            parent.image_url = sr.image_url
    await db.commit()
    return [await _build_item_out(db, it) for it in items]


@router.post("/items/{item_id}/alerts", status_code=201)
async def create_alert(
    item_id: int, req: AlertRequest, db: AsyncSession = Depends(get_db)
) -> dict:
    item = await db.get(Item, item_id)
    if item is None:
        raise HTTPException(404, "item not found")
    alert = Alert(item_id=item_id, target_price_cents=req.target_price_cents)
    db.add(alert)
    await db.commit()
    return {"id": alert.id, "item_id": item_id, "target_price_cents": alert.target_price_cents}


@router.get("/items/{item_id}/alerts")
async def list_alerts(item_id: int, db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(
        select(Alert).where(Alert.item_id == item_id).order_by(Alert.created_at.desc())
    )
    alerts = result.scalars().all()
    return [
        {
            "id": a.id,
            "target_price_cents": a.target_price_cents,
            "created_at": a.created_at,
            "triggered_at": a.triggered_at,
        }
        for a in alerts
    ]


@router.delete("/items/{item_id}/alerts/{alert_id}", status_code=204)
async def delete_alert(
    item_id: int, alert_id: int, db: AsyncSession = Depends(get_db)
) -> None:
    alert = await db.get(Alert, alert_id)
    if alert is None or alert.item_id != item_id:
        raise HTTPException(404, "alert not found")
    await db.delete(alert)
    await db.commit()
