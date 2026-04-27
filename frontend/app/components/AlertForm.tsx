"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Check, Loader2, X } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { formatCents } from "../lib/format";
import type { AlertOut } from "../lib/types";

export function AlertForm({ itemId }: { itemId: number }) {
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertOut[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const refreshAlerts = useCallback(async () => {
    try {
      const list = await api.listAlerts(itemId);
      setAlerts(list);
    } catch {
      // soft fail — leave existing list
    }
  }, [itemId]);

  useEffect(() => {
    refreshAlerts();
  }, [refreshAlerts]);

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
      refreshAlerts();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not set alert");
    } finally {
      setBusy(false);
    }
  }

  async function remove(alertId: number) {
    if (deletingId !== null) return;
    setDeletingId(alertId);
    // optimistic removal
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    try {
      await api.deleteAlert(itemId, alertId);
    } catch {
      // restore on failure
      refreshAlerts();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Bell size={15} className="text-[var(--accent)]" />
        <div className="text-[13px] font-mono uppercase tracking-[0.18em] text-[var(--muted-2)]">
          Price alert{alerts.length > 0 && ` (${alerts.length})`}
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
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
            className="w-full h-11 pl-7 pr-3 rounded-md text-sm font-mono bg-[var(--surface-2)] border border-[var(--border)] focus:border-[var(--accent)] focus:outline-none text-[var(--foreground)]"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className={clsx(
            "inline-flex items-center justify-center gap-2 h-11 px-4 rounded-md text-sm font-medium",
            "border border-[var(--border)] bg-[var(--surface-2)] text-[var(--foreground)]",
            "hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors",
            "disabled:opacity-50",
          )}
        >
          {busy ? (
            <Loader2 size={15} className="spin-slow" />
          ) : done ? (
            <Check size={15} className="text-[var(--success)]" />
          ) : (
            <Bell size={15} />
          )}
          <span>{done ? "Set" : "Set alert"}</span>
        </button>
      </form>
      {err && <div className="mt-2 text-xs text-[var(--danger)]">{err}</div>}

      {alerts.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {alerts.map((a) => {
            const triggered = a.triggered_at !== null;
            return (
              <li
                key={a.id}
                className={clsx(
                  "group flex items-center justify-between gap-3 rounded-md border px-3 py-2",
                  triggered
                    ? "border-[var(--success)]/30 bg-[var(--success)]/5"
                    : "border-[var(--border)] bg-[var(--surface-2)]",
                  deletingId === a.id && "opacity-50",
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={clsx(
                      "size-1.5 rounded-full shrink-0",
                      triggered
                        ? "bg-[var(--success)]"
                        : "bg-[var(--accent)]",
                    )}
                  />
                  <span className="text-sm font-mono text-[var(--foreground)]">
                    {formatCents(a.target_price_cents)}
                  </span>
                  {triggered && (
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--success)]">
                      hit
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  disabled={deletingId === a.id}
                  aria-label="Remove alert"
                  className="size-7 rounded-md flex items-center justify-center text-[var(--muted-2)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
