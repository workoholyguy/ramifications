"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import clsx from "clsx";
import { Cpu } from "lucide-react";
import type { ItemOut, HistoryPoint } from "../lib/types";
import { formatCents, specSubtitle } from "../lib/format";
import { RetailerBadge } from "./RetailerBadge";
import { SparkLine } from "./SparkLine";
import { api } from "../lib/api";

type Props = {
  item: ItemOut;
  onOpen: (item: ItemOut) => void;
};

export function ItemCard({ item, onOpen }: Props) {
  const [points, setPoints] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    let alive = true;
    api
      .history(item.id)
      .then((h) => {
        if (alive) setPoints(h.points);
      })
      .catch(() => {
        // fail soft — sparkline just won't render
      });
    return () => {
      alive = false;
    };
  }, [item.id]);

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={clsx(
        "group relative text-left w-full",
        "rounded-lg border border-[var(--border)] bg-[var(--surface)]",
        "hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
        "transition-colors overflow-hidden",
      )}
    >
      <div className="aspect-[16/10] bg-[var(--surface-2)] border-b border-[var(--border)] relative overflow-hidden">
        {item.image_url ? (
          // using <img> here because retailer image domains aren't whitelisted in next.config
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={`${item.brand} ${item.model}`}
            className="w-full h-full object-contain p-4 group-hover:scale-[1.02] transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--muted-2)]">
            <Cpu size={36} strokeWidth={1.25} />
          </div>
        )}
        <div className="absolute top-3 left-3">
          <code className="text-[12px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-[var(--border)] bg-[rgba(10,10,11,0.6)] text-[var(--muted)] backdrop-blur">
            {item.canonical_sku}
          </code>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        <div>
          <div className="text-[12px] font-mono uppercase tracking-[0.16em] text-[var(--muted-2)]">
            {item.brand}
          </div>
          <div className="text-[15px] font-medium leading-snug truncate">
            {item.model}
          </div>
          <div className="text-xs text-[var(--muted)] mt-0.5 font-mono">
            {specSubtitle(item.capacity_gb, item.speed_mts, item.cas)}
          </div>
        </div>

        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-2xl sm:text-[28px] font-semibold tracking-tight text-[var(--accent)] leading-none font-mono">
              {formatCents(item.cheapest_price_cents)}
            </div>
            {item.cheapest_retailer && item.cheapest_price_cents !== null && (
              <div className="mt-2">
                <RetailerBadge retailer={item.cheapest_retailer} size="xs" />
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[12px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
              {item.listings.length} {item.listings.length === 1 ? "retailer" : "retailers"}
            </div>
          </div>
        </div>

        {points.length >= 2 && (
          <div className="pt-1">
            <SparkLine points={points} />
          </div>
        )}
      </div>
    </button>
  );
}
