# RAMifications

> _don't suffer the consequences._

A DDR5 RAM **cross-retailer** price tracker. Paste a Newegg / B&H link and see the same SKU at every retailer, with an AI verdict telling you whether to pull the trigger or wait. If you already bought it, find out if the price has dropped since — and get a one-click link to your retailer's price-match form.

Built in 90 minutes for the [progsu](https://progsu.com) Claude Code workshop, 2026-04-27.

---

## Why DDR5

DDR5 prices have been whiplashing since the HBM allocation pull pulled DRAM capacity in 2025. The cross-retailer spread on the **same exact SKU** can be \$100+ on any given day. RAMifications makes the spread visible.

## What's in the box

| | |
|---|---|
| **Cross-retailer chart** | One pasted URL → live prices at Newegg + B&H + Best Buy + Micro Center, plotted as a multi-line chart. The killer feature. |
| **AI buy-signal** | `claude-haiku-4-5` reads the price history and emits `BUY` / `WAIT` / `AVOID` with a one-sentence reason and a confidence score. Cached 1h per SKU; uses prompt caching on the system message. |
| **Retroactive overpay detector** | Mark "I bought this on date X for \$Y" → see how much the price has dropped since + a deep link to your retailer's price-match form. (Newegg honors 30 days; Best Buy honors 14.) |
| **Affiliate-tag rewriter** | Every outbound buy button is rewritten with affiliate parameters at response time (env-driven tags). No DB column, no auth, no Stripe — just monetization in two lines of YAML. |
| **Real-Chrome stealth scraper** | Playwright headless Chrome bypasses Cloudflare on B&H via channel=chrome + `navigator.webdriver` masking + a homepage warm-up to acquire the `cf_clearance` cookie. |

## Stack

- **Frontend:** Next.js 15 · React 19 · TypeScript · Tailwind 4 · Recharts · deployed to Vercel
- **Backend:** FastAPI · Python 3.11 · SQLAlchemy 2 async · aiosqlite (managed by `uv`)
- **Scraper:** Playwright Python · headless Chromium / real Chrome
- **AI:** Anthropic SDK · `claude-haiku-4-5-20251001` with ephemeral prompt caching

## Repo layout

```
.
├── frontend/             # next.js 15 app
│   └── app/
│       ├── components/   # 10 components (Header, ItemCard, PriceChart, BuySignalCard, …)
│       ├── lib/          # api client, formatters, types
│       ├── page.tsx      # list view + ItemDetailModal
│       └── globals.css   # design tokens
└── backend/
    └── app/
        ├── main.py       # FastAPI app + lifespan + lazy-router auto-mount
        ├── routes.py     # core item/listings/history/refresh/alerts
        ├── scraper.py    # 4-strategy chain: jsonld → og → site-specific → regex
        ├── buy_signal.py # claude haiku 4.5 verdict + 1h memo
        ├── affiliate.py  # url rewriter + retroactive overpay
        ├── seed_skus.py  # 3 curated SKUs × cross-retailer URLs
        ├── models.py     # 5-table sqlalchemy schema
        └── schemas.py    # pydantic v2 contracts
```

## Run locally

You need [uv](https://docs.astral.sh/uv/), [pnpm](https://pnpm.io/), and Google Chrome installed (Chrome bypasses Cloudflare on retailer pages — bundled Chromium gets blocked).

```bash
# 1. backend → http://localhost:8000
cd backend
uv sync
uv run playwright install chromium
echo "ANTHROPIC_API_KEY=sk-ant-…" > ../.env
uv run uvicorn app.main:app --reload

# 2. frontend → http://localhost:3000 (in another shell)
cd frontend
pnpm install
pnpm dev
```

**For a populated demo chart**, after the backend is running track each SKU once via the UI, then run the synthetic-history backfill so the chart has 14 days of motion to plot:

```bash
cd backend
uv run python -m scripts.seed_history          # 14 days of synthetic walk anchored on the live scrape
uv run python -m scripts.seed_history --days 30 --noise 0.04   # bigger window / louder volatility
```

The script is idempotent — listings that already have multiple history points are skipped, so you can paste new SKUs and re-run safely.

## Deploy frontend to Vercel

The backend stays local for this build (workshop scope). The frontend deploys cold:

1. Push this repo to GitHub (already done if you cloned `workoholyguy/ramifications`).
2. Open <https://vercel.com/new> and import the repo.
3. **Set Root Directory to `frontend`** in the Vercel project settings — the monorepo layout matters.
4. Add env var `NEXT_PUBLIC_API_BASE` → `http://localhost:8000` (so the deployed page hits whoever runs the backend locally — convenient for solo demos).
5. Click Deploy.

Production-deploying the **backend** is the obvious v2 stretch — Fly.io for the Playwright runtime, neon Postgres in place of SQLite. See "What I'd do next" below.

Then paste any of these into the Track form:

- `https://www.newegg.com/corsair-vengeance-32gb-ddr5-6000-cas-latency-cl30-desktop-memory-gray/p/N82E16820982040`
- `https://www.bhphotovideo.com/c/product/1830605-REG/corsair_cmk32gx5m2e6000z36_vengeance_32gb_2_x.html`
- `https://www.newegg.com/p/3C6-034Y-00350` (G.Skill Trident Z5 Royal Neo)
- `https://www.newegg.com/p/0RN-0005-00JE0` (Crucial Pro DDR5-5600)

## Cross-retailer demo, in five seconds

```bash
curl -s -X POST http://localhost:8000/items \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.newegg.com/corsair-vengeance-32gb-ddr5-6000-cas-latency-cl30-desktop-memory-gray/p/N82E16820982040"}' \
  | python3 -m json.tool
```

```json
{
  "canonical_sku": "corsair-vengeance-32gb-ddr5-6000",
  "cheapest_price_cents": 45399,
  "cheapest_retailer": "bh",
  "listings": [
    {"retailer":"newegg","variant":"CL30","last_price_cents":56599,"affiliate_url":"https://shareasale.com/r.cfm?…"},
    {"retailer":"bh",    "variant":"CL36","last_price_cents":45399,"affiliate_url":"https://www.bhphotovideo.com/…?BI=demo-bh"}
  ]
}
```

\$112 spread between two variants of the "same" SKU. The chart shows it; the AI explains it; the affiliate link captures the click.

## API

| | |
|---|---|
| `POST /items {url}` | track a SKU (resolves to canonical, scrapes every retailer in parallel) |
| `GET /items` | list all tracked SKUs with cheapest price + retailer |
| `GET /items/{id}/history` | every price point across every listing, ready for recharts |
| `POST /items/{id}/refresh` · `POST /refresh-all` | rescrape |
| `POST /items/{id}/buy-signal` | Claude verdict (1h cached) |
| `POST /items/{id}/purchase {listing_id, purchase_date, purchase_price_cents}` | mark a buy |
| `GET /items/{id}/overpay` | did the price drop since? + price-match link |
| `POST /items/{id}/alerts {target_price_cents}` | target-price alert |

## What I'd do next

- Auto-discover cross-retailer URLs by SKU (right now we ship a 3-SKU hand-curated seed)
- Email/SMS delivery for alerts (cron + SendGrid)
- Backend deploy (Fly.io) — frontend-only deploy is the workshop default
- Variant clustering: chart CL30 and CL36 with separate buy-signals, since they're meaningfully different products
- Drop alerts via webhooks for the Discord deal-hunter crowd

## License

MIT.

---

_Built with [Claude Code](https://claude.com/claude-code) via the progsu Claude Code workshop, 04-27-2026. Workshop scaffold: <https://github.com/liamellison02/claude-workshop-starter>._
