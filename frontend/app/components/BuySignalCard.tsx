"use client";

import { useEffect, useState } from "react";
import { Sparkles, ThumbsUp, Clock, OctagonX } from "lucide-react";
import clsx from "clsx";
import { api, ApiError } from "../lib/api";
import type { BuySignalOut } from "../lib/types";

const VERDICT_STYLE: Record<
  BuySignalOut["verdict"],
  { color: string; bg: string; border: string; Icon: typeof ThumbsUp }
> = {
  BUY: {
    color: "#22c55e",
    bg: "rgba(34,197,94,0.08)",
    border: "rgba(34,197,94,0.35)",
    Icon: ThumbsUp,
  },
  WAIT: {
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.35)",
    Icon: Clock,
  },
  AVOID: {
    color: "#ef4444",
    bg: "rgba(239,68,68,0.08)",
    border: "rgba(239,68,68,0.35)",
    Icon: OctagonX,
  },
};

export function BuySignalCard({ itemId }: { itemId: number }) {
  const [signal, setSignal] = useState<BuySignalOut | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setUnavailable(false);
    setSignal(null);
    api
      .buySignal(itemId)
      .then((s) => {
        if (alive) setSignal(s);
      })
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 404) {
          setUnavailable(true);
        } else {
          setUnavailable(true);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [itemId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-[var(--accent)]" />
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--muted-2)]">
            AI verdict
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-7 w-32 rounded shimmer" />
          <div className="h-3 w-full rounded shimmer" />
          <div className="h-3 w-3/4 rounded shimmer" />
        </div>
      </div>
    );
  }

  if (unavailable || !signal) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-[var(--accent)]" />
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--muted-2)]">
            AI verdict
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-7 w-40 rounded shimmer" />
          <div className="text-xs text-[var(--muted-2)] font-mono">
            AI signal coming online…
          </div>
        </div>
      </div>
    );
  }

  const style = VERDICT_STYLE[signal.verdict];
  const Icon = style.Icon;

  return (
    <div
      className={clsx(
        "rounded-lg border p-5",
        "bg-[var(--surface)]",
      )}
      style={{ borderColor: style.border }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-[var(--accent)]" />
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--muted-2)]">
            AI verdict
          </div>
          {signal.cached && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
              · cached
            </span>
          )}
        </div>
        <span
          className="text-[11px] font-mono px-2 py-0.5 rounded-full border"
          style={{
            borderColor: style.border,
            background: style.bg,
            color: style.color,
          }}
        >
          {Math.round(signal.confidence * 100)}% conf
        </span>
      </div>
      <div className="flex items-start gap-3">
        <div
          className="size-10 rounded-md flex items-center justify-center shrink-0"
          style={{ background: style.bg, border: `1px solid ${style.border}` }}
        >
          <Icon size={18} style={{ color: style.color }} />
        </div>
        <div className="min-w-0">
          <div
            className="text-2xl sm:text-3xl font-semibold tracking-tight leading-none"
            style={{ color: style.color }}
          >
            {signal.verdict}
          </div>
          <div className="mt-2 text-sm text-[var(--foreground)] leading-relaxed">
            {signal.reason}
          </div>
        </div>
      </div>
    </div>
  );
}
