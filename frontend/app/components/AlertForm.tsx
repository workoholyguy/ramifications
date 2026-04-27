"use client";

import { useState } from "react";
import { Bell, Check, Loader2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";

export function AlertForm({ itemId }: { itemId: number }) {
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const num = parseFloat(price);
    if (!isFinite(num) || num <= 0) {
      setErr("Enter a valid price");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.createAlert(itemId, Math.round(num * 100));
      setDone(true);
      setPrice("");
      setTimeout(() => setDone(false), 2400);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not set alert");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Bell size={14} className="text-[var(--accent)]" />
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--muted-2)]">
          Price alert
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-2)] font-mono text-sm">
            $
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="alert me when price drops to…"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              setErr(null);
            }}
            className="w-full h-10 pl-7 pr-3 rounded-md text-sm font-mono bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className={clsx(
            "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-md text-sm font-medium",
            "border border-[var(--border)] bg-[var(--surface-2)]",
            "hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors",
            "disabled:opacity-50",
          )}
        >
          {busy ? (
            <Loader2 size={14} className="spin-slow" />
          ) : done ? (
            <Check size={14} className="text-[var(--success)]" />
          ) : (
            <Bell size={14} />
          )}
          <span>{done ? "Set" : "Set alert"}</span>
        </button>
      </div>
      {err && <div className="mt-2 text-xs text-[var(--danger)]">{err}</div>}
    </form>
  );
}
