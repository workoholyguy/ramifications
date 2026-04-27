# Supported URLs

> The only product URLs RAMifications will accept. Anything outside this list returns `422` with a "url not in seeded SKU set" error.

RAMifications v1 ships with **4 hand-curated DDR5 RAM SKUs**. Auto-canonicalization of arbitrary URLs is a real NLP problem we punted on (see [Presentation.md](./Presentation.md) → "What's next" for the v2 plan).

---

## Recommended for the live demo

```
https://www.newegg.com/corsair-vengeance-32gb-ddr5-6000-cas-latency-cl30-desktop-memory-gray/p/N82E16820982040
```

Pasting this triggers a parallel scrape of **all three retailers** (Newegg + B&H + Micro Center) for the Corsair Vengeance kit. You get the multi-line chart and the **$196 cross-retailer spread**. This is the demo URL.

---

## All seven fetchable URLs

| # | URL | Resolves to canonical SKU | Retailers tracked |
|---|---|---|---|
| 1 | `https://www.newegg.com/corsair-vengeance-32gb-ddr5-6000-cas-latency-cl30-desktop-memory-gray/p/N82E16820982040` | `corsair-vengeance-32gb-ddr5-6000` | **3** — Newegg (CL30) + B&H (CL36) + Micro Center (CL30) |
| 2 | `https://www.bhphotovideo.com/c/product/1830605-REG/corsair_cmk32gx5m2e6000z36_vengeance_32gb_2_x.html` | same as #1 | same — 3 retailers |
| 3 | `https://www.microcenter.com/product/669660/corsair-vengeance-32gb-(2-x-16gb)-ddr5-6000-pc5-48000-cl30-dual-channel-desktop-memory-kit-cmk32gx5m2b6000c30-black` | same as #1 | same — 3 retailers |
| 4 | `https://www.newegg.com/p/3C6-034Y-00350` | `gskill-trident-z5-royal-neo-32gb-ddr5-6000` | 1 — Newegg (CL30 AMD EXPO) |
| 5 | `https://www.newegg.com/p/0RN-0005-00JE0` | `crucial-pro-32gb-ddr5-5600` | 1 — Newegg (CL46) |
| 6 | `https://www.newegg.com/kingston-technology-corp-fury-beast-32gb-ddr5-6000-cas-latency-cl30-memory-black/p/N82E16820242860` | `kingston-fury-beast-32gb-ddr5-6000` | **2** — Newegg (CL30 Black) + Micro Center (CL30 RGB) |
| 7 | `https://www.microcenter.com/product/706975/kingston-fury-beast-rgb-32gb-(2-x-16gb)-ddr5-6000-pc5-48000-cl30-dual-channel-desktop-memory-kit-kf560c30bbeak2-32-black` | same as #6 | same — 2 retailers |

- URLs **1, 2, 3** → the same Corsair card (3 retailers in chart)
- URLs **6, 7** → the same Kingston card (2 retailers in chart)
- URL **4** → G.Skill (single retailer — niche premium kit not stocked elsewhere)
- URL **5** → Crucial (single retailer — Micro Center only carries the 64GB variant of this line, conflating sizes would muddle the buy-signal)

7 URLs → **4 cards** on the home page. Two of those cards have multi-retailer charts.

---

## What about Best Buy / Amazon URLs?

Both retailers have URL patterns that the scraper *can* handle (and affiliate rewriting is wired for them), but **none of our 3 seeded SKUs include a Best Buy or Amazon listing**. So pasting their URLs returns `422` with the supported-SKU list.

Adding them is a v2 task. Best Buy specifically has heavy client-side hydration that didn't surface stable URLs through the Playwright MCP during selector discovery.

---

## What happens if you paste an unsupported URL

The Track form catches the `422` and renders a violet error callout with:
- The error message: *"url not in seeded SKU set"*
- A code-chip list of the 3 supported `canonical_sku` values
- A hint: *"v1 supports 3 curated DDR5 RAM SKUs; paste a URL from one of them"*

So the failure mode is graceful — the user sees what they should paste instead.

---

## Curl-only quick test

```bash
# any of the three Corsair URLs gives the cross-retailer demo:
curl -s -X POST http://localhost:8000/items \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.newegg.com/corsair-vengeance-32gb-ddr5-6000-cas-latency-cl30-desktop-memory-gray/p/N82E16820982040"}' \
  | python3 -m json.tool
```

You should see `cheapest_price_cents: 36999`, `cheapest_retailer: "microcenter"`, and 3 listings in the response.

---

## Note on the deployed Vercel page

The deployed URL (https://ramifications.vercel.app/) ships with a **mock-data fallback** — when the page can't reach a backend, it renders a baked-in snapshot of these same 3 SKUs so the deploy looks populated. A small banner at the top says "Showing demo data." For the *live* scrape behavior (paste URL → real Playwright run → real prices), run the backend locally — those URLs above are what to paste once you do.
