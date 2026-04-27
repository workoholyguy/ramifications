"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X, RefreshCw, Info } from "lucide-react";
import clsx from "clsx";
import { api, isDemoMode } from "./lib/api";
import type { ItemOut, HistoryPoint } from "./lib/types";
import { formatCents, specSubtitle } from "./lib/format";
import { Header } from "./components/Header";
import { TrackForm } from "./components/TrackForm";
import { ItemCard } from "./components/ItemCard";
import { PriceChart } from "./components/PriceChart";
import { BuySignalCard } from "./components/BuySignalCard";
import { OverpayCard } from "./components/OverpayCard";
import { BuyButton } from "./components/BuyButton";
import { AlertForm } from "./components/AlertForm";
import { RetailerBadge } from "./components/RetailerBadge";

export default function Home() {
  const [items, setItems] = useState<ItemOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<ItemOut | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .listItems()
      .then((data) => {
        if (alive) {
          setItems(data);
          setDemoMode(isDemoMode());
        }
      })
      .catch(() => {
        // backend may not be up yet — render empty grid + track form
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const upsertItem = useCallback((next: ItemOut) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === next.id);
      if (idx === -1) return [next, ...prev];
      const copy = [...prev];
      copy[idx] = next;
      return copy;
    });
    setSelected((cur) => (cur && cur.id === next.id ? next : cur));
  }, []);

  async function refreshAll() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const next = await api.refreshAll();
      setItems(next);
      setSelected((cur) =>
        cur ? next.find((i) => i.id === cur.id) ?? cur : cur,
      );
    } catch {
      // swallow — surface in a toast in v2
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <Header
        count={items.length}
        onRefreshAll={refreshAll}
        refreshing={refreshing}
      />

      {demoMode && <DemoBanner />}

      <TrackForm onTracked={upsertItem} />

      <section className="mx-auto max-w-6xl px-5 sm:px-8 pb-24">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--muted)] py-12">
            <Loader2 size={14} className="spin-slow" />
            <span>Loading tracked SKUs…</span>
          </div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="flex items-baseline justify-between mb-5">
              <div className="text-[12px] font-mono uppercase tracking-[0.18em] text-[var(--muted-2)]">
                Tracked SKUs
              </div>
              <div className="text-[12px] font-mono uppercase tracking-[0.18em] text-[var(--muted-2)]">
                {items.length} active
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <ItemCard key={item.id} item={item} onOpen={setSelected} />
              ))}
            </div>
          </>
        )}
      </section>

      {selected && (
        <ItemDetailModal
          item={selected}
          onClose={() => setSelected(null)}
          onItemRefreshed={upsertItem}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function DemoBanner() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-5">
      <div className="flex items-start gap-2.5 rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-3">
        <Info size={15} className="mt-0.5 text-[var(--accent)] shrink-0" />
        <div className="text-sm text-[var(--foreground)] leading-snug">
          <span className="font-medium text-[var(--accent)]">
            Showing demo data.
          </span>{" "}
          <span className="text-[var(--muted)]">
            Run the backend locally (
            <code className="text-[var(--foreground)] font-mono">
              uv run uvicorn app.main:app --reload
            </code>
            ) for live scrapes, AI verdicts you can refresh, and the retroactive
            overpay detector. The chart, prices, and buy-signal you see below
            are from a baked-in snapshot of a real scrape.
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] py-16 text-center">
      <div className="text-sm text-[var(--muted)]">
        No SKUs tracked yet. Paste a URL above to start.
      </div>
      <div className="mt-2 text-[11px] text-[var(--muted-2)] font-mono">
        v1 supports 3 curated DDR5 RAM SKUs · cross-retailer chart unlocks at 2+ snapshots
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ItemDetailModal({
  item,
  onClose,
  onItemRefreshed,
}: {
  item: ItemOut;
  onClose: () => void;
  onItemRefreshed: (item: ItemOut) => void;
}) {
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [historyTick, setHistoryTick] = useState(0);

  useEffect(() => {
    let alive = true;
    api
      .history(item.id)
      .then((h) => {
        if (alive) setPoints(h.points);
      })
      .catch(() => {
        if (alive) setPoints([]);
      });
    return () => {
      alive = false;
    };
  }, [item.id, historyTick]);

  // Close on ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function refreshOne() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const next = await api.refreshItem(item.id);
      onItemRefreshed(next);
      setHistoryTick((t) => t + 1);
    } catch {
      // swallow
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm py-8 px-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-[var(--border)]">
          <div className="flex items-start gap-4 min-w-0">
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.image_url}
                alt={`${item.brand} ${item.model}`}
                className="size-16 rounded-md object-contain bg-[var(--surface-2)] border border-[var(--border)] p-1.5"
              />
            ) : null}
            <div className="min-w-0">
              <div className="text-[12px] font-mono uppercase tracking-[0.16em] text-[var(--muted-2)]">
                {item.brand}
              </div>
              <h2 className="text-lg sm:text-xl font-semibold tracking-tight truncate">
                {item.model}
              </h2>
              <div className="text-xs text-[var(--muted)] font-mono mt-0.5">
                {specSubtitle(item.capacity_gb, item.speed_mts, item.cas)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {item.cheapest_retailer && item.cheapest_price_cents !== null ? (
                  <>
                    <span className="text-[12px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
                      cheapest now
                    </span>
                    <span className="text-sm font-mono font-medium text-[var(--accent)]">
                      {formatCents(item.cheapest_price_cents)}
                    </span>
                    <RetailerBadge retailer={item.cheapest_retailer} size="xs" />
                  </>
                ) : (
                  <span className="text-xs text-[var(--muted-2)]">—</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={refreshOne}
              disabled={refreshing}
              className={clsx(
                "inline-flex items-center gap-2 h-8 px-3 rounded-md text-xs font-medium",
                "border border-[var(--border)] hover:border-[var(--border-strong)]",
                "bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors",
                "disabled:opacity-50",
              )}
            >
              <RefreshCw size={13} className={refreshing ? "spin-slow" : ""} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center size-8 rounded-md border border-[var(--border)] hover:border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-5">
          <PriceChart points={points} />

          <BuySignalCard itemId={item.id} />

          <div>
            <div className="text-[12px] font-mono uppercase tracking-[0.18em] text-[var(--muted-2)] mb-2">
              Buy at
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {item.listings.map((l) => (
                <BuyButton key={l.id} listing={l} />
              ))}
            </div>
          </div>

          <OverpayCard item={item} />

          <AlertForm itemId={item.id} />
        </div>
      </div>
    </div>
  );
}
