"""Claude-powered buy-signal verdict for a tracked DDR5 RAM item.

Exposes POST /items/{item_id}/buy-signal. Reads the item's price history
across all listings, asks Claude Haiku 4.5 for a BUY|WAIT|AVOID verdict,
and memoizes the result for 1 hour per item_id.

Prompt caching is enabled on the system message so repeated calls across
items only pay full input cost on the first request.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
from typing import Any

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.models import Item, Listing, PricePoint
from app.schemas import BuySignalOut

router = APIRouter()

MODEL = "claude-haiku-4-5-20251001"
CACHE_TTL = dt.timedelta(hours=1)
RECENT_POINTS_PER_LISTING = 12

SYSTEM_PROMPT = """You are a DDR5 RAM market analyst. You advise buyers on whether to pull the trigger on a specific SKU right now or wait for a better price, based on cross-retailer price history.

Pricing context for DDR5 (2024-2026):
- Prices fluctuate weekly with retailer promos and DRAM spot-market swings.
- A current price within 3% of the 30-day low is a strong BUY.
- A current price more than 8% above the 30-day low usually means WAIT.
- An obvious outlier high (>15% above the 30d low) with no recent dips is AVOID.
- Thin history (<3 points) lowers confidence regardless of verdict.

Output format: respond with STRICTLY a single JSON object and nothing else. No prose, no code fences, no commentary. Schema:
{"verdict": "BUY" | "WAIT" | "AVOID", "reason": "<single concise sentence>", "confidence": <float between 0.0 and 1.0>}
"""

# Module-level memo: {item_id: (BuySignalOut-with-cached=False, expires_at)}
_verdict_cache: dict[int, tuple[BuySignalOut, dt.datetime]] = {}

_client: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise HTTPException(500, "ANTHROPIC_API_KEY not configured")
        _client = AsyncAnthropic(api_key=api_key)
    return _client


def _build_user_payload(item: Item) -> dict[str, Any]:
    """Compact JSON payload for Claude: per-listing 30d low/high + recent points."""
    now = dt.datetime.utcnow()
    cutoff_30d = now - dt.timedelta(days=30)

    listings_payload: list[dict[str, Any]] = []
    for listing in item.listings:
        priced = [pp for pp in listing.price_points if pp.price_cents is not None]
        priced.sort(key=lambda p: p.scraped_at)

        last_30d = [pp for pp in priced if pp.scraped_at >= cutoff_30d]
        prices_30d = [pp.price_cents for pp in last_30d if pp.price_cents is not None]
        low_30d = min(prices_30d) if prices_30d else None
        high_30d = max(prices_30d) if prices_30d else None
        current = priced[-1].price_cents if priced else None

        recent = priced[-RECENT_POINTS_PER_LISTING:]
        recent_points = [
            {
                "scraped_at": pp.scraped_at.isoformat(timespec="seconds"),
                "price_cents": pp.price_cents,
            }
            for pp in recent
        ]

        listings_payload.append(
            {
                "retailer": listing.retailer,
                "variant": listing.variant,
                "current_price_cents": current,
                "low_30d_cents": low_30d,
                "high_30d_cents": high_30d,
                "recent_points": recent_points,
            }
        )

    return {
        "sku": item.canonical_sku,
        "brand": item.brand,
        "model": item.model,
        "listings": listings_payload,
    }


_JSON_OBJ_RE = re.compile(r"\{.*\}", re.DOTALL)


def _parse_verdict(raw: str) -> dict[str, Any]:
    """Best-effort parse of Claude's JSON response. Returns a sane fallback on failure.

    Defenses against common LLM output drift:
    - leading/trailing whitespace
    - markdown code fences (``` or ```json)
    - prose around the JSON object — fall back to the first balanced {...} match
    """
    text = raw.strip()
    # Strip code fences
    if text.startswith("```"):
        text = text.lstrip("`")
        # drop optional language tag (json, JSON, etc.)
        if "\n" in text:
            text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0].strip()

    candidates = [text]
    match = _JSON_OBJ_RE.search(text)
    if match:
        candidates.append(match.group(0))

    parsed = None
    for cand in candidates:
        try:
            parsed = json.loads(cand)
            break
        except (json.JSONDecodeError, ValueError):
            continue

    if not isinstance(parsed, dict):
        return {
            "verdict": "WAIT",
            "reason": "model response was not valid json; defaulting to wait",
            "confidence": 0.0,
        }

    verdict = str(parsed.get("verdict", "WAIT")).upper()
    if verdict not in {"BUY", "WAIT", "AVOID"}:
        verdict = "WAIT"
    reason = str(parsed.get("reason", "no reason provided"))[:500]
    try:
        confidence = float(parsed.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))
    return {"verdict": verdict, "reason": reason, "confidence": confidence}


async def _call_claude(item: Item) -> dict[str, Any]:
    client = _get_client()
    payload = _build_user_payload(item)
    user_text = json.dumps(payload, separators=(",", ":"))

    message = await client.messages.create(
        model=MODEL,
        max_tokens=300,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_text}],
    )

    raw = ""
    for block in message.content:
        if getattr(block, "type", None) == "text":
            raw += block.text
    return _parse_verdict(raw)


@router.post("/items/{item_id}/buy-signal", response_model=BuySignalOut)
async def buy_signal(
    item_id: int, db: AsyncSession = Depends(get_db)
) -> BuySignalOut:
    now = dt.datetime.utcnow()

    # Cache hit short-circuit
    cached = _verdict_cache.get(item_id)
    if cached is not None:
        signal, expires_at = cached
        if expires_at > now:
            return BuySignalOut(
                verdict=signal.verdict,
                reason=signal.reason,
                confidence=signal.confidence,
                cached=True,
                generated_at=signal.generated_at,
            )
        # Expired
        _verdict_cache.pop(item_id, None)

    result = await db.execute(
        select(Item)
        .where(Item.id == item_id)
        .options(selectinload(Item.listings).selectinload(Listing.price_points))
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(404, "item not found")

    has_points = any(
        any(pp.price_cents is not None for pp in l.price_points) for l in item.listings
    )
    if not has_points:
        signal = BuySignalOut(
            verdict="WAIT",
            reason="no price history yet",
            confidence=0.0,
            cached=False,
            generated_at=now,
        )
        _verdict_cache[item_id] = (signal, now + CACHE_TTL)
        return signal

    parsed = await _call_claude(item)
    signal = BuySignalOut(
        verdict=parsed["verdict"],
        reason=parsed["reason"],
        confidence=parsed["confidence"],
        cached=False,
        generated_at=now,
    )
    _verdict_cache[item_id] = (signal, now + CACHE_TTL)
    return signal
