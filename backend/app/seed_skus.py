"""Curated DDR5 RAM SKU seed.

Each canonical SKU groups every retailer's listing for the same product line.
URLs were verified live via the Playwright MCP during Phase 2-3 selector discovery.

Cross-retailer matching is the killer feature, so the seed is opinionated rather than
auto-discovered: we trust this hand-curated mapping for v1 and surface listings whose
sub-variants (CL30 vs CL36, RGB vs non-RGB) sit under the same canonical SKU.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from urllib.parse import urlparse


@dataclass(frozen=True)
class SeedListing:
    retailer: str
    url: str
    variant: str | None = None  # e.g. "CL30", "CL36 RGB"


@dataclass(frozen=True)
class SeedItem:
    canonical_sku: str
    brand: str
    model: str
    capacity_gb: int
    speed_mts: int
    cas: int | None
    listings: tuple[SeedListing, ...] = field(default_factory=tuple)


SEED: tuple[SeedItem, ...] = (
    SeedItem(
        canonical_sku="corsair-vengeance-32gb-ddr5-6000",
        brand="CORSAIR",
        model="Vengeance",
        capacity_gb=32,
        speed_mts=6000,
        cas=None,  # mixed across listings — see variant on each listing
        listings=(
            SeedListing(
                retailer="newegg",
                url="https://www.newegg.com/corsair-vengeance-32gb-ddr5-6000-cas-latency-cl30-desktop-memory-gray/p/N82E16820982040",
                variant="CL30",
            ),
            SeedListing(
                retailer="bh",
                url="https://www.bhphotovideo.com/c/product/1830605-REG/corsair_cmk32gx5m2e6000z36_vengeance_32gb_2_x.html",
                variant="CL36",
            ),
        ),
    ),
    SeedItem(
        canonical_sku="gskill-trident-z5-royal-neo-32gb-ddr5-6000",
        brand="G.SKILL",
        model="Trident Z5 Royal Neo",
        capacity_gb=32,
        speed_mts=6000,
        cas=30,
        listings=(
            SeedListing(
                retailer="newegg",
                url="https://www.newegg.com/p/3C6-034Y-00350",
                variant="CL30 AMD EXPO",
            ),
        ),
    ),
    SeedItem(
        canonical_sku="crucial-pro-32gb-ddr5-5600",
        brand="Crucial",
        model="Pro",
        capacity_gb=32,
        speed_mts=5600,
        cas=46,
        listings=(
            SeedListing(
                retailer="newegg",
                url="https://www.newegg.com/p/0RN-0005-00JE0",
                variant="CL46",
            ),
        ),
    ),
)


# Lookup: any seeded URL → its canonical SKU.
_URL_TO_SKU: dict[str, str] = {
    listing.url: item.canonical_sku
    for item in SEED
    for listing in item.listings
}


def find_seed_for_url(url: str) -> tuple[SeedItem, SeedListing] | None:
    """Return (item, listing) if the pasted URL matches a seeded listing exactly,
    otherwise try a host+path-prefix match for permalink variations."""
    if url in _URL_TO_SKU:
        sku = _URL_TO_SKU[url]
        item = next(it for it in SEED if it.canonical_sku == sku)
        listing = next(l for l in item.listings if l.url == url)
        return item, listing

    parsed = urlparse(url)
    pasted_id = _path_id(parsed.path)
    for item in SEED:
        for listing in item.listings:
            seeded = urlparse(listing.url)
            if parsed.netloc == seeded.netloc and pasted_id and pasted_id == _path_id(seeded.path):
                return item, listing
    return None


def find_seed_by_sku(canonical_sku: str) -> SeedItem | None:
    return next((it for it in SEED if it.canonical_sku == canonical_sku), None)


def _path_id(path: str) -> str | None:
    """Heuristic: most retailer product URLs end in a stable id segment.
    Newegg: .../p/N82E16820982040 or .../p/0RN-0005-00JE0
    B&H:    .../c/product/1830605-REG/corsair_..._x.html
    """
    parts = [p for p in path.split("/") if p]
    if not parts:
        return None
    last = parts[-1]
    if last.endswith(".html"):
        # B&H: product id is the second-to-last segment (e.g. "1830605-REG")
        if len(parts) >= 2:
            return parts[-2]
    return last
