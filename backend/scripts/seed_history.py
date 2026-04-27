"""Inject synthetic 14-day price history for every seeded listing.

The live scraper writes one PricePoint per refresh — to demo a populated chart
without waiting for real days to pass, this script back-fills realistic-looking
points anchored on the most recent live scrape and walking backwards with a
gentle random walk + a soft weekly cycle (DRAM spot prices wobble weekly).

Run it AFTER you've scraped each item at least once via `POST /items` so the
anchor price is real, not invented.

Usage:
    uv run python -m scripts.seed_history
    uv run python -m scripts.seed_history --days 30 --noise 0.04
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import math
import random
import sys
from pathlib import Path

# allow running both as `python -m scripts.seed_history` and as a script
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import selectinload  # noqa: E402

from app.db import async_session_factory, init_db  # noqa: E402
from app.models import Item, Listing, PricePoint  # noqa: E402


def synth_walk(
    anchor_cents: int, days: int, noise: float, weekly_amp: float, rng: random.Random
) -> list[tuple[dt.datetime, int]]:
    """Generate `days` PricePoints walking backwards from `now` toward `anchor_cents`.

    The most recent generated point lands one tick before now and is close to the
    anchor; older points drift farther via a damped random walk + weekly oscillation.
    """
    now = dt.datetime.utcnow()
    out: list[tuple[dt.datetime, int]] = []

    # current price drifts as a fraction; older points = larger drift
    current_pct = 0.0
    for d in range(days, 0, -1):
        t = now - dt.timedelta(days=d) + dt.timedelta(hours=rng.uniform(-3, 3))
        # damped random walk in pct-space
        current_pct += rng.gauss(0, noise * 0.4)
        current_pct *= 0.92  # mean-revert
        weekly = weekly_amp * math.sin((d / 7.0) * 2 * math.pi)
        cents = int(round(anchor_cents * (1.0 + current_pct + weekly)))
        cents = max(int(anchor_cents * 0.7), min(int(anchor_cents * 1.3), cents))
        out.append((t, cents))

    return out


async def seed(days: int, noise: float, weekly_amp: float) -> None:
    rng = random.Random(0xC0DEDDA1)  # deterministic for repeatable demos
    await init_db()

    async with async_session_factory() as db:
        result = await db.execute(
            select(Item).options(selectinload(Item.listings).selectinload(Listing.price_points))
        )
        items = result.scalars().all()
        if not items:
            print("No tracked items found. Run POST /items first.", file=sys.stderr)
            return

        inserted = 0
        for item in items:
            for listing in item.listings:
                latest = max(
                    (pp for pp in listing.price_points if pp.price_cents is not None),
                    key=lambda p: p.scraped_at,
                    default=None,
                )
                if latest is None or latest.price_cents is None:
                    print(
                        f"  skip {item.canonical_sku}/{listing.retailer}: no anchor price"
                    )
                    continue

                # Avoid double-seeding: if there's already historic data, skip.
                if len(listing.price_points) > 1:
                    print(
                        f"  skip {item.canonical_sku}/{listing.retailer}: already has {len(listing.price_points)} points"
                    )
                    continue

                anchor = latest.price_cents
                walk = synth_walk(anchor, days, noise, weekly_amp, rng)
                for ts, cents in walk:
                    db.add(
                        PricePoint(
                            listing_id=listing.id,
                            price_cents=cents,
                            in_stock=True,
                            scraped_at=ts,
                            title_at_scrape=latest.title_at_scrape,
                        )
                    )
                    inserted += 1
                print(
                    f"  +{len(walk)} synthetic points for {item.canonical_sku}/{listing.retailer} (anchor=${anchor/100:.2f})"
                )

        await db.commit()
        print(f"\nSeeded {inserted} synthetic price points across {len(items)} items.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill synthetic price history.")
    parser.add_argument("--days", type=int, default=14, help="how many days back to seed")
    parser.add_argument("--noise", type=float, default=0.025, help="per-step volatility")
    parser.add_argument("--weekly", type=float, default=0.015, help="weekly cycle amplitude")
    args = parser.parse_args()
    asyncio.run(seed(days=args.days, noise=args.noise, weekly_amp=args.weekly))


if __name__ == "__main__":
    main()
