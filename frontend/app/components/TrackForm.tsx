"use client";

import { useState } from "react";
import { ArrowRight, Loader2, AlertTriangle } from "lucide-react";
import clsx from "clsx";
import { api, ApiError } from "../lib/api";
import type { ItemOut, TrackError } from "../lib/types";

type Props = {
  onTracked: (item: ItemOut) => void;
};

export function TrackForm({ onTracked }: Props) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<TrackError | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const item = await api.trackItem(url.trim());
      onTracked(item);
      setUrl("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && e.body && typeof e.body === "object") {
        setErr(e.body as TrackError);
      } else {
        setErr({
          error: e instanceof Error ? e.message : "Could not track that URL.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-16 pb-6">
      <div className="max-w-2xl">
        <div className="text-[12px] font-mono uppercase tracking-[0.18em] text-[var(--muted-2)] mb-3">
          DDR5 / cross-retailer / live
        </div>
        <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
          Track DDR5 prices across{" "}
          <span className="text-[var(--accent)]">every retailer</span>.
        </h1>
        <p className="mt-3 text-[var(--muted)] text-sm sm:text-base max-w-xl">
          Paste a Newegg, B&amp;H, Best Buy, Micro Center, or Amazon link. We resolve the SKU,
          pull every retailer&apos;s price, and tell you whether to buy.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="mt-7 flex flex-col sm:flex-row gap-2 max-w-2xl"
      >
        <div className="relative flex-1">
          <input
            type="url"
            required
            inputMode="url"
            placeholder="https://www.newegg.com/p/N82E16820236840"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={clsx(
              "w-full h-11 px-4 rounded-md text-sm font-mono",
              "bg-[var(--surface)] border border-[var(--border)]",
              "placeholder:text-[var(--muted-2)]",
              "focus:border-[var(--accent)] focus:outline-none",
              "transition-colors",
            )}
          />
        </div>
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className={clsx(
            "inline-flex items-center justify-center gap-2 h-11 px-5 rounded-md text-sm font-medium",
            "bg-[var(--accent)] text-white",
            "hover:bg-[#7c3aed] disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors",
          )}
        >
          {busy ? (
            <Loader2 size={15} className="spin-slow" />
          ) : (
            <ArrowRight size={15} />
          )}
          <span>{busy ? "Tracking…" : "Track"}</span>
        </button>
      </form>

      {err && (
        <div className="mt-4 max-w-2xl rounded-md border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} className="mt-0.5 text-[var(--danger)]" />
            <div className="text-sm text-[var(--foreground)]">
              <div className="font-medium">{err.error}</div>
              {err.hint && (
                <div className="mt-1 text-[var(--muted)]">{err.hint}</div>
              )}
              {err.supported_skus && err.supported_skus.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs uppercase tracking-wider text-[var(--muted-2)] mb-1.5">
                    Supported SKUs
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {err.supported_skus.map((s) => (
                      <code
                        key={s}
                        className="text-[13px] font-mono px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]"
                      >
                        {s}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
