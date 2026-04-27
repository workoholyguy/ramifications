"""DDR5 RAM price scraper.

Strategy chain per page (first match wins):
  1. JSON-LD Product schema (schema.org) — cleanest, used by Newegg, B&H, Micro Center
  2. og:price:amount + og:title + og:image meta tags — fallback for sites without JSON-LD
  3. Site-specific CSS selectors — Newegg, Best Buy
  4. Currency regex near <h1> — last resort

Selectors discovered live via the Playwright MCP, not memorized.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import Browser, async_playwright

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/127.0.0.0 Safari/537.36"
)
SCREENSHOT_DIR = Path(__file__).resolve().parent.parent / "screenshots"
PRICE_RE = re.compile(r"\$\s?([\d,]+\.\d{2})")

# Cloudflare-fronted retailers (e.g. B&H) reject bundled Chromium fingerprints AND
# direct deep-links from a cold session. Visiting the homepage first acquires the
# `cf_clearance` cookie, after which product pages render normally.
WARMUP_HOSTS = {"bhphotovideo.com": "https://www.bhphotovideo.com/"}

# Mask the most obvious headless automation tells before any site script runs.
STEALTH_INIT_JS = (
    "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
    "window.chrome = window.chrome || { runtime: {} };"
)


@dataclass
class ScrapeResult:
    url: str
    retailer: str
    title: str | None
    price_cents: int | None
    currency: str | None
    image_url: str | None
    in_stock: bool
    strategy: str
    screenshot_path: str | None
    error: str | None = None


def retailer_from_url(url: str) -> str:
    host = urlparse(url).netloc.lower().removeprefix("www.")
    mapping = {
        "newegg.com": "newegg",
        "bestbuy.com": "bestbuy",
        "bhphotovideo.com": "bh",
        "microcenter.com": "microcenter",
        "amazon.com": "amazon",
    }
    for domain, name in mapping.items():
        if host.endswith(domain):
            return name
    return host.split(".")[0]


def _price_to_cents(value: str | float | int | None) -> int | None:
    if value is None:
        return None
    try:
        s = str(value).replace(",", "").replace("$", "").strip()
        return int(round(float(s) * 100))
    except (ValueError, TypeError):
        return None


# JS payload runs in the page; returns a {strategy, ...} dict if any strategy hits.
EXTRACT_JS = r"""
() => {
  const out = { strategy: null };

  // 1. JSON-LD Product schema
  const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of ldScripts) {
    try {
      const raw = s.textContent.trim();
      if (!raw) continue;
      const data = JSON.parse(raw);
      const arr = Array.isArray(data) ? data : [data];
      for (const d of arr) {
        const t = d?.['@type'];
        const isProduct = t === 'Product' || (Array.isArray(t) && t.includes('Product'));
        if (!isProduct) continue;
        const offer = Array.isArray(d.offers) ? d.offers[0] : d.offers;
        if (!offer) continue;
        out.strategy = 'jsonld';
        out.name = d.name;
        out.price = offer.price ?? offer.lowPrice;
        out.currency = offer.priceCurrency || 'USD';
        out.image = Array.isArray(d.image) ? d.image[0] : d.image;
        out.availability = offer.availability;
        return out;
      }
    } catch (_) {}
  }

  // 2. og: + product: meta tags
  const og = (p) => document.querySelector(`meta[property="${p}"]`)?.content;
  const ogPrice = og('product:price:amount') || og('og:price:amount');
  if (ogPrice) {
    out.strategy = 'og';
    out.name = og('og:title') || document.querySelector('h1')?.textContent?.trim();
    out.price = ogPrice;
    out.currency = og('product:price:currency') || og('og:price:currency') || 'USD';
    out.image = og('og:image');
    out.availability = og('product:availability');
    return out;
  }

  // 3. Site-specific selectors
  const host = location.hostname;
  let priceText = null, titleText = null, imageUrl = null;

  if (host.includes('newegg.com')) {
    const dollars = document.querySelector('.product-price .price-current strong')?.textContent?.trim();
    const cents = document.querySelector('.product-price .price-current sup')?.textContent?.trim();
    if (dollars) priceText = `${dollars}${cents || '.00'}`;
    titleText = document.querySelector('h1.product-title')?.textContent?.trim();
    imageUrl = document.querySelector('.swiper-slide-active img, .product-view-img-original')?.src;
  } else if (host.includes('bestbuy.com')) {
    priceText = document.querySelector('[data-testid="customer-price"] span, .priceView-customer-price span')?.textContent?.trim();
    titleText = document.querySelector('h1.heading-5')?.textContent?.trim();
    imageUrl = document.querySelector('.primary-image img')?.src;
  } else if (host.includes('bhphotovideo.com')) {
    priceText = document.querySelector('[data-selenium="pricingPrice"]')?.textContent?.trim();
    titleText = document.querySelector('h1[data-selenium="productTitle"]')?.textContent?.trim();
    imageUrl = document.querySelector('img[data-selenium="inlineMediaMainImage"]')?.src;
  } else if (host.includes('microcenter.com')) {
    priceText = document.querySelector('#pricing #priceValue, .price-list .price')?.getAttribute?.('content')
      || document.querySelector('#pricing #priceValue, .price-list .price')?.textContent?.trim();
    titleText = document.querySelector('h1[itemprop="name"], h1[data-name="productName"]')?.textContent?.trim();
    imageUrl = document.querySelector('img#productImage, img[itemprop="image"]')?.src;
  }

  if (priceText) {
    out.strategy = 'site-specific';
    out.name = titleText;
    out.price = priceText;
    out.currency = 'USD';
    out.image = imageUrl;
    return out;
  }

  // 4. Currency regex near h1
  const h1 = document.querySelector('h1');
  if (h1) {
    const haystack = (h1.parentElement?.parentElement?.textContent || '').slice(0, 4000);
    const m = haystack.match(/\$\s?([\d,]+\.\d{2})/);
    if (m) {
      out.strategy = 'regex';
      out.name = h1.textContent?.trim();
      out.price = m[1];
      out.currency = 'USD';
      out.image = document.querySelector('meta[property="og:image"]')?.content;
      return out;
    }
  }

  return out;  // strategy still null
}
"""


async def _scrape_one(browser: Browser, url: str, take_screenshot: bool) -> ScrapeResult:
    retailer = retailer_from_url(url)
    context = await browser.new_context(
        user_agent=UA,
        viewport={"width": 1366, "height": 900},
        locale="en-US",
    )
    await context.add_init_script(STEALTH_INIT_JS)
    page = await context.new_page()
    screenshot_path: str | None = None

    try:
        # Cloudflare warm-up: acquire clearance cookie via the homepage before
        # deep-linking to the product page. Without this, B&H product URLs
        # return the "Just a moment..." interstitial and EXTRACT_JS finds no DOM.
        host = urlparse(url).netloc.lower().removeprefix("www.")
        for domain, warmup_url in WARMUP_HOSTS.items():
            if host.endswith(domain):
                try:
                    await page.goto(warmup_url, wait_until="domcontentloaded", timeout=20_000)
                    try:
                        await page.wait_for_load_state("networkidle", timeout=4_000)
                    except Exception:
                        pass
                except Exception:
                    pass  # warm-up best-effort; main goto still gets a chance
                break

        await page.goto(url, wait_until="domcontentloaded", timeout=20_000)
        # let async price renderers settle
        try:
            await page.wait_for_load_state("networkidle", timeout=4_000)
        except Exception:
            pass
        # B&H lazy-renders price; wait briefly for a price-bearing element.
        if "bhphotovideo.com" in host:
            try:
                await page.wait_for_selector(
                    'script[type="application/ld+json"], [data-selenium="pricingPrice"]',
                    timeout=8_000,
                )
            except Exception:
                pass

        data = await page.evaluate(EXTRACT_JS)

        if take_screenshot:
            SCREENSHOT_DIR.mkdir(exist_ok=True)
            ts = re.sub(r"[^0-9]", "", page.url)[:8]
            shot = SCREENSHOT_DIR / f"{retailer}-{ts or 'page'}.png"
            try:
                await page.screenshot(path=str(shot), full_page=False)
                screenshot_path = str(shot.relative_to(SCREENSHOT_DIR.parent))
            except Exception:
                pass

        if not data or not data.get("strategy"):
            return ScrapeResult(
                url=url, retailer=retailer, title=None, price_cents=None,
                currency=None, image_url=None, in_stock=False,
                strategy="none", screenshot_path=screenshot_path,
                error="no extraction strategy matched",
            )

        price_cents = _price_to_cents(data.get("price"))
        availability = (data.get("availability") or "").lower()
        in_stock = (
            "instock" in availability
            or "in_stock" in availability
            or "available" in availability
            or availability == ""  # default to true if site doesn't say
        )

        return ScrapeResult(
            url=url,
            retailer=retailer,
            title=(data.get("name") or "").strip()[:480] or None,
            price_cents=price_cents,
            currency=data.get("currency") or "USD",
            image_url=data.get("image"),
            in_stock=in_stock if price_cents else False,
            strategy=data.get("strategy"),
            screenshot_path=screenshot_path,
        )
    except Exception as e:
        return ScrapeResult(
            url=url, retailer=retailer, title=None, price_cents=None,
            currency=None, image_url=None, in_stock=False,
            strategy="error", screenshot_path=screenshot_path,
            error=f"{type(e).__name__}: {e}",
        )
    finally:
        await context.close()


async def _launch_browser(p) -> Browser:
    """Launch real Chrome when available (Cloudflare trusts its TLS/JS fingerprint),
    falling back to bundled Chromium otherwise. Disabling the
    AutomationControlled blink feature also removes a key bot-detection tell.
    """
    args = ["--disable-blink-features=AutomationControlled"]
    try:
        return await p.chromium.launch(headless=True, channel="chrome", args=args)
    except Exception:
        return await p.chromium.launch(headless=True, args=args)


async def scrape(url: str, *, take_screenshot: bool = True) -> ScrapeResult:
    async with async_playwright() as p:
        browser = await _launch_browser(p)
        try:
            return await _scrape_one(browser, url, take_screenshot)
        finally:
            await browser.close()


async def scrape_many(urls: list[str], *, take_screenshot: bool = True) -> list[ScrapeResult]:
    async with async_playwright() as p:
        browser = await _launch_browser(p)
        try:
            return await asyncio.gather(*[_scrape_one(browser, u, take_screenshot) for u in urls])
        finally:
            await browser.close()


async def _cli(urls: list[str]) -> None:
    results = await scrape_many(urls, take_screenshot=False)
    for r in results:
        print(json.dumps(r.__dict__, indent=2, default=str))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python -m app.scraper <url> [<url> ...]", file=sys.stderr)
        sys.exit(2)
    asyncio.run(_cli(sys.argv[1:]))
