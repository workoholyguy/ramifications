/**
 * Static demo data baked into the bundle.
 *
 * The backend stays local (Playwright + real Chrome can't run in serverless),
 * so when the deployed frontend can't reach an API, we fall back to this
 * snapshot of what a seeded local backend would return. Lets the Vercel URL
 * tell its own story without requiring a visitor to run uvicorn.
 *
 * Numbers mirror the real seeded SKUs in `backend/app/seed_skus.py` and the
 * synthetic walk in `backend/scripts/seed_history.py`.
 */

import type {
  ItemOut,
  HistoryOut,
  BuySignalOut,
  HistoryPoint,
  OverpayOut,
} from "./types";

// deterministic prng (mulberry32) so demo data is stable across reloads
function makeRng(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function synthWalk(
  listingId: number,
  retailer: string,
  variant: string | null,
  anchorCents: number,
  days = 14,
  seed = 1,
): HistoryPoint[] {
  const rng = makeRng(seed);
  const out: HistoryPoint[] = [];
  const now = Date.now();
  let pct = 0;
  for (let d = days; d >= 0; d--) {
    pct += (rng() - 0.5) * 0.05;
    pct *= 0.9;
    const weekly = 0.015 * Math.sin((d / 7) * 2 * Math.PI);
    const cents = Math.max(
      Math.round(anchorCents * 0.7),
      Math.min(
        Math.round(anchorCents * 1.3),
        Math.round(anchorCents * (1 + pct + weekly)),
      ),
    );
    const ts = new Date(
      now - d * 86_400_000 + (rng() - 0.5) * 6 * 3_600_000,
    ).toISOString();
    out.push({
      retailer,
      listing_id: listingId,
      variant,
      price_cents: d === 0 ? anchorCents : cents,
      in_stock: true,
      scraped_at: ts,
    });
  }
  return out;
}

const NEWEGG_CORSAIR_URL =
  "https://www.newegg.com/corsair-vengeance-32gb-ddr5-6000-cas-latency-cl30-desktop-memory-gray/p/N82E16820982040";
const BH_CORSAIR_URL =
  "https://www.bhphotovideo.com/c/product/1830605-REG/corsair_cmk32gx5m2e6000z36_vengeance_32gb_2_x.html";
const MICROCENTER_CORSAIR_URL =
  "https://www.microcenter.com/product/669660/corsair-vengeance-32gb-(2-x-16gb)-ddr5-6000-pc5-48000-cl30-dual-channel-desktop-memory-kit-cmk32gx5m2b6000c30-black";
const NEWEGG_GSKILL_URL = "https://www.newegg.com/p/3C6-034Y-00350";
const NEWEGG_CRUCIAL_URL = "https://www.newegg.com/p/0RN-0005-00JE0";
const NEWEGG_KINGSTON_URL =
  "https://www.newegg.com/kingston-technology-corp-fury-beast-32gb-ddr5-6000-cas-latency-cl30-memory-black/p/N82E16820242860";
const MICROCENTER_KINGSTON_URL =
  "https://www.microcenter.com/product/706975/kingston-fury-beast-rgb-32gb-(2-x-16gb)-ddr5-6000-pc5-48000-cl30-dual-channel-desktop-memory-kit-kf560c30bbeak2-32-black";

// affiliate URLs match what backend's affiliate.py would emit
const AFF = {
  newegg: (u: string) =>
    `https://shareasale.com/r.cfm?b=demo-newegg&u=${encodeURIComponent(u)}`,
  bh: (u: string) => `${u}?BI=demo-bh`,
  microcenter: () => null,
} as const;

const NOW = new Date().toISOString();

export const MOCK_ITEMS: ItemOut[] = [
  {
    id: 1,
    canonical_sku: "corsair-vengeance-32gb-ddr5-6000",
    brand: "CORSAIR",
    model: "Vengeance",
    capacity_gb: 32,
    speed_mts: 6000,
    cas: null,
    image_url:
      "https://c1.neweggimages.com/ProductImage/20-236-941-08.jpg",
    cheapest_price_cents: 36999,
    cheapest_retailer: "microcenter",
    listings: [
      {
        id: 1,
        retailer: "newegg",
        url: NEWEGG_CORSAIR_URL,
        affiliate_url: AFF.newegg(NEWEGG_CORSAIR_URL),
        variant: "CL30",
        last_price_cents: 56599,
        last_seen_at: NOW,
      },
      {
        id: 2,
        retailer: "bh",
        url: BH_CORSAIR_URL,
        affiliate_url: AFF.bh(BH_CORSAIR_URL),
        variant: "CL36",
        last_price_cents: 45399,
        last_seen_at: NOW,
      },
      {
        id: 3,
        retailer: "microcenter",
        url: MICROCENTER_CORSAIR_URL,
        affiliate_url: AFF.microcenter(),
        variant: "CL30",
        last_price_cents: 36999,
        last_seen_at: NOW,
      },
    ],
  },
  {
    id: 2,
    canonical_sku: "gskill-trident-z5-royal-neo-32gb-ddr5-6000",
    brand: "G.SKILL",
    model: "Trident Z5 Royal Neo",
    capacity_gb: 32,
    speed_mts: 6000,
    cas: 30,
    image_url:
      "https://c1.neweggimages.com/ProductImageCompressAll300/3C6-034Y-00350_1.jpg",
    cheapest_price_cents: 135699,
    cheapest_retailer: "newegg",
    listings: [
      {
        id: 4,
        retailer: "newegg",
        url: NEWEGG_GSKILL_URL,
        affiliate_url: AFF.newegg(NEWEGG_GSKILL_URL),
        variant: "CL30 AMD EXPO",
        last_price_cents: 135699,
        last_seen_at: NOW,
      },
    ],
  },
  {
    id: 3,
    canonical_sku: "crucial-pro-32gb-ddr5-5600",
    brand: "Crucial",
    model: "Pro",
    capacity_gb: 32,
    speed_mts: 5600,
    cas: 46,
    image_url:
      "https://c1.neweggimages.com/ProductImageCompressAll300/0RN-0005-00JE0_1.jpg",
    cheapest_price_cents: 79552,
    cheapest_retailer: "newegg",
    listings: [
      {
        id: 5,
        retailer: "newegg",
        url: NEWEGG_CRUCIAL_URL,
        affiliate_url: AFF.newegg(NEWEGG_CRUCIAL_URL),
        variant: "CL46",
        last_price_cents: 79552,
        last_seen_at: NOW,
      },
    ],
  },
  {
    id: 4,
    canonical_sku: "kingston-fury-beast-32gb-ddr5-6000",
    brand: "Kingston",
    model: "FURY Beast",
    capacity_gb: 32,
    speed_mts: 6000,
    cas: 30,
    image_url:
      "https://c1.neweggimages.com/ProductImageCompressAll300/N82E16820242860_1.jpg",
    cheapest_price_cents: 48999,
    cheapest_retailer: "newegg",
    listings: [
      {
        id: 6,
        retailer: "newegg",
        url: NEWEGG_KINGSTON_URL,
        affiliate_url: AFF.newegg(NEWEGG_KINGSTON_URL),
        variant: "CL30 Black",
        last_price_cents: 48999,
        last_seen_at: NOW,
      },
      {
        id: 7,
        retailer: "microcenter",
        url: MICROCENTER_KINGSTON_URL,
        affiliate_url: AFF.microcenter(),
        variant: "CL30 RGB",
        last_price_cents: 49999,
        last_seen_at: NOW,
      },
    ],
  },
];

const ITEM_1_HISTORY: HistoryPoint[] = [
  ...synthWalk(1, "newegg", "CL30", 56599, 14, 11),
  ...synthWalk(2, "bh", "CL36", 45399, 14, 22),
  ...synthWalk(3, "microcenter", "CL30", 36999, 14, 33),
].sort(
  (a, b) =>
    new Date(a.scraped_at).getTime() - new Date(b.scraped_at).getTime(),
);

const ITEM_2_HISTORY: HistoryPoint[] = synthWalk(
  4,
  "newegg",
  "CL30 AMD EXPO",
  135699,
  14,
  44,
);

const ITEM_3_HISTORY: HistoryPoint[] = synthWalk(
  5,
  "newegg",
  "CL46",
  79552,
  14,
  55,
);

const ITEM_4_HISTORY: HistoryPoint[] = [
  ...synthWalk(6, "newegg", "CL30 Black", 48999, 14, 66),
  ...synthWalk(7, "microcenter", "CL30 RGB", 49999, 14, 77),
].sort(
  (a, b) =>
    new Date(a.scraped_at).getTime() - new Date(b.scraped_at).getTime(),
);

export const MOCK_HISTORY: Record<number, HistoryOut> = {
  1: {
    item_id: 1,
    canonical_sku: "corsair-vengeance-32gb-ddr5-6000",
    points: ITEM_1_HISTORY,
  },
  2: {
    item_id: 2,
    canonical_sku: "gskill-trident-z5-royal-neo-32gb-ddr5-6000",
    points: ITEM_2_HISTORY,
  },
  3: {
    item_id: 3,
    canonical_sku: "crucial-pro-32gb-ddr5-5600",
    points: ITEM_3_HISTORY,
  },
  4: {
    item_id: 4,
    canonical_sku: "kingston-fury-beast-32gb-ddr5-6000",
    points: ITEM_4_HISTORY,
  },
};

// Hardcoded price-match policies — mirrors backend/app/affiliate.py
const PRICE_MATCH_POLICIES: Record<string, string> = {
  newegg:
    "Newegg honors price-match within 30 days. Email customer service or use the Returns & Refunds page.",
  bestbuy:
    "Best Buy honors price-match within 14 days. File at https://www.bestbuy.com/site/help-topics/price-match-guarantee/pcmcat297300050000.c",
  microcenter:
    "Micro Center honors price-match within 30 days at the store.",
};

/**
 * Client-side overpay calculator for demo mode.
 * Mirrors the math in backend/app/affiliate.py::overpay so the deployed page
 * gives the same answer as the local backend would.
 */
export function computeMockOverpay(
  itemId: number,
  purchase: {
    listing_id: number;
    purchase_date: string;
    purchase_price_cents: number;
  },
): OverpayOut {
  const item = MOCK_ITEMS.find((i) => i.id === itemId);
  const purchaseListing = item?.listings.find(
    (l) => l.id === purchase.listing_id,
  );

  let minPrice: number | null = null;
  let minRetailer: string | null = null;
  if (item) {
    for (const l of item.listings) {
      if (
        l.last_price_cents !== null &&
        (minPrice === null || l.last_price_cents < minPrice)
      ) {
        minPrice = l.last_price_cents;
        minRetailer = l.retailer;
      }
    }
  }

  const delta =
    minPrice !== null ? minPrice - purchase.purchase_price_cents : null;
  const purchaseRetailer = purchaseListing?.retailer ?? "unknown";
  const policy = PRICE_MATCH_POLICIES[purchaseRetailer] ?? null;

  return {
    purchase_price_cents: purchase.purchase_price_cents,
    purchase_date: purchase.purchase_date,
    purchase_retailer: purchaseRetailer,
    current_min_price_cents: minPrice,
    current_min_retailer: minRetailer,
    delta_cents: delta,
    price_match_policy: policy,
  };
}

export const MOCK_BUY_SIGNALS: Record<number, BuySignalOut> = {
  1: {
    verdict: "BUY",
    confidence: 0.78,
    reason:
      "Micro Center CL30 at $369.99 is within 4.8% of its 30-day low ($352.86); B&H CL36 at $453.99 sits 3.8% above its low. Both retailers offer solid entry points with stable recent history.",
    cached: true,
    generated_at: NOW,
  },
  2: {
    verdict: "WAIT",
    confidence: 0.61,
    reason:
      "Trident Z5 Royal Neo at $1356.99 is 6.2% above its 30-day low. Premium silver kits typically dip on RGB-month promos — give it another week.",
    cached: true,
    generated_at: NOW,
  },
  3: {
    verdict: "BUY",
    confidence: 0.69,
    reason:
      "Crucial Pro DDR5-5600 at $795.52 is near its weekly low and DRAM spot pricing remains tight; this is a defensible mid-tier buy.",
    cached: true,
    generated_at: NOW,
  },
  4: {
    verdict: "BUY",
    confidence: 0.74,
    reason:
      "Kingston FURY Beast at $489.99 (Newegg) is only 2.0% above its 30-day low; the $10 cross-retailer spread vs Micro Center RGB at $499.99 is within normal noise — solid entry point.",
    cached: true,
    generated_at: NOW,
  },
};
