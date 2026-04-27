"use client";

import { useState } from "react";
import { Receipt, Loader2, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import clsx from "clsx";
import { api, ApiError } from "../lib/api";
import { formatCents, retailerLabel } from "../lib/format";
import type { ItemOut, OverpayOut } from "../lib/types";

export function OverpayCard({ item }: { item: ItemOut }) {
  const [open, setOpen] = useState(false);
  const [listingId, setListingId] = useState<number | "">(
    item.listings[0]?.id ?? "",
  );
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OverpayOut | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || listingId === "") return;
    const num = parseFloat(price);
    if (!isFinite(num) || num <= 0) {
      setErr("Enter a valid purchase price");
      return;
    }
    setBusy(true);
    setErr(null);
    setUnavailable(false);
    try {
      await api.recordPurchase(item.id, {
        listing_id: Number(listingId),
        purchase_date: date,
        purchase_price_cents: Math.round(num * 100),
      });
      const overpay = await api.overpay(item.id);
      setResult(overpay);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setUnavailable(true);
      } else {
        setErr(e instanceof Error ? e.message : "Could not record purchase");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2">
          <Receipt size={14} className="text-[var(--accent)]" />
          <div className="text-[12px] font-mono uppercase tracking-[0.18em] text-[var(--muted-2)]">
            I bought this
          </div>
        </div>
        <div
          className={clsx(
            "h-5 w-9 rounded-full p-0.5 transition-colors",
            open ? "bg-[var(--accent)]" : "bg-[var(--border)]",
          )}
        >
          <div
            className={clsx(
              "h-4 w-4 rounded-full bg-white transition-transform",
              open ? "translate-x-4" : "translate-x-0",
            )}
          />
        </div>
      </button>

      {open && !result && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          {unavailable && (
            <div className="text-xs text-[var(--muted-2)] font-mono">
              retro feature coming online…
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[12px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-1">
                Retailer
              </label>
              <select
                value={listingId}
                onChange={(e) =>
                  setListingId(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="w-full h-9 px-2 rounded-md text-sm bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none"
              >
                {item.listings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {retailerLabel(l.retailer)}
                    {l.variant ? ` · ${l.variant}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-9 px-2 rounded-md text-sm bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-[12px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-1">
                Price
              </label>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--muted-2)] font-mono text-sm">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="129.99"
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    setErr(null);
                  }}
                  className="w-full h-9 pl-6 pr-2 rounded-md text-sm font-mono bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-md text-sm font-medium bg-[var(--accent)] text-white hover:bg-[#7c3aed] disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 size={14} className="spin-slow" /> : <Receipt size={14} />}
            <span>{busy ? "Checking…" : "Did I overpay?"}</span>
          </button>
          {err && <div className="text-xs text-[var(--danger)]">{err}</div>}
        </form>
      )}

      {open && result && (
        <OverpayResult result={result} onReset={() => setResult(null)} />
      )}
    </div>
  );
}

function OverpayResult({
  result,
  onReset,
}: {
  result: OverpayOut;
  onReset: () => void;
}) {
  const delta = result.delta_cents;
  // negative delta = price dropped after purchase = you overpaid
  const overpaid = delta !== null && delta < 0;
  const saved = delta !== null && delta > 0;
  const color = overpaid ? "#ef4444" : saved ? "#22c55e" : "#a1a1aa";
  const label = overpaid ? "You overpaid" : saved ? "You scored" : "Even";
  const Icon = overpaid ? TrendingDown : TrendingUp;
  const absDelta = delta !== null ? Math.abs(delta) : null;

  return (
    <div className="mt-4 space-y-4">
      <div
        className="rounded-md border p-4 flex items-start gap-3"
        style={{ borderColor: `${color}55`, background: `${color}0d` }}
      >
        <div
          className="size-10 rounded-md flex items-center justify-center shrink-0"
          style={{ background: `${color}1a`, border: `1px solid ${color}33` }}
        >
          <Icon size={18} style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="text-xl sm:text-2xl font-semibold tracking-tight leading-none"
            style={{ color }}
          >
            {label} {absDelta !== null && `· ${formatCents(absDelta)}`}
          </div>
          <div className="mt-2 text-xs text-[var(--muted)] grid grid-cols-2 gap-y-1 font-mono">
            <span className="text-[var(--muted-2)]">Paid</span>
            <span>
              {formatCents(result.purchase_price_cents)}{" "}
              <span className="text-[var(--muted-2)]">
                · {retailerLabel(result.purchase_retailer)} ·{" "}
                {result.purchase_date}
              </span>
            </span>
            <span className="text-[var(--muted-2)]">Now</span>
            <span>
              {formatCents(result.current_min_price_cents)}{" "}
              {result.current_min_retailer && (
                <span className="text-[var(--muted-2)]">
                  · {retailerLabel(result.current_min_retailer)}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {result.price_match_policy && (
        <div className="rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3 flex items-start gap-2.5">
          <ShieldCheck size={15} className="mt-0.5 text-[var(--accent)] shrink-0" />
          <div className="text-xs text-[var(--foreground)] leading-relaxed">
            <div className="font-medium text-[var(--accent)] mb-0.5">
              Price-match available
            </div>
            <div className="text-[var(--muted)]">{result.price_match_policy}</div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onReset}
        className="text-xs text-[var(--muted-2)] hover:text-[var(--foreground)] transition-colors"
      >
        ← record another
      </button>
    </div>
  );
}
