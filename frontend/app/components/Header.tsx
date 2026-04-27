"use client";

import { RefreshCw } from "lucide-react";
import clsx from "clsx";

type Props = {
  count: number;
  onRefreshAll: () => void;
  refreshing: boolean;
};

export function Header({ count, onRefreshAll, refreshing }: Props) {
  return (
    <header className="sticky top-0 z-30 hairline-b backdrop-blur-md bg-[rgba(10,10,11,0.72)]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 h-16 flex items-center justify-between">
        <div className="flex items-baseline gap-3 min-w-0">
          <span
            className="font-[var(--font-display)] text-[1.35rem] font-bold tracking-tight text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            RAM<span className="text-[var(--accent)]">ifications</span>
          </span>
          <span className="hidden sm:inline text-xs text-[var(--muted-2)] tracking-wide truncate">
            don&apos;t suffer the consequences
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[var(--muted)] font-mono">
            <span className="size-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
            {count} {count === 1 ? "SKU" : "SKUs"} tracked
          </span>
          <button
            type="button"
            onClick={onRefreshAll}
            disabled={refreshing}
            className={clsx(
              "inline-flex items-center gap-2 h-8 px-3 rounded-md text-xs font-medium",
              "border border-[var(--border)] hover:border-[var(--border-strong)]",
              "bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
            aria-label="Refresh all"
          >
            <RefreshCw
              size={13}
              className={refreshing ? "spin-slow" : ""}
            />
            <span>Refresh all</span>
          </button>
        </div>
      </div>
    </header>
  );
}
