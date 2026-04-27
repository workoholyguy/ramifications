"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import type { HistoryPoint } from "../lib/types";
import { retailerColor, retailerLabel } from "../lib/format";

type Series = {
  key: string; // listing_id-retailer-variant
  retailer: string;
  variant: string | null;
  label: string;
};

type Row = {
  ts: number; // epoch ms
} & Record<string, number | null | undefined>;

export function PriceChart({ points }: { points: HistoryPoint[] }) {
  // Build series + rows
  const seriesMap = new Map<string, Series>();
  for (const p of points) {
    const key = `r_${p.listing_id}`;
    if (!seriesMap.has(key)) {
      seriesMap.set(key, {
        key,
        retailer: p.retailer,
        variant: p.variant,
        label: `${retailerLabel(p.retailer)}${p.variant ? ` · ${p.variant}` : ""}`,
      });
    }
  }
  const series = Array.from(seriesMap.values());

  const rowMap = new Map<number, Row>();
  for (const p of points) {
    if (p.price_cents === null) continue;
    const ts = new Date(p.scraped_at).getTime();
    const k = `r_${p.listing_id}`;
    const existing = rowMap.get(ts) ?? { ts };
    existing[k] = p.price_cents / 100;
    rowMap.set(ts, existing);
  }
  const rows = Array.from(rowMap.values()).sort((a, b) => a.ts - b.ts);

  if (rows.length < 1 || series.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--muted)]">
        Not enough history yet — refresh to start collecting points.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--muted-2)]">
            Price history
          </div>
          <div className="text-sm text-[var(--foreground)] mt-0.5">
            {rows.length} {rows.length === 1 ? "snapshot" : "snapshots"} · {series.length}{" "}
            {series.length === 1 ? "retailer" : "retailers"}
          </div>
        </div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => format(new Date(v), "MMM d")}
              stroke="#52525b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
            />
            <YAxis
              stroke="#52525b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v}`}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: "#141418",
                border: "1px solid #27272a",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => format(new Date(v as number), "MMM d, yyyy · h:mm a")}
              formatter={(value, name) => {
                const s = series.find((x) => x.key === String(name));
                const num = typeof value === "number" ? value : Number(value);
                const display = isFinite(num) ? `$${num.toFixed(2)}` : "—";
                return [display, s?.label ?? String(name)];
              }}
              cursor={{ stroke: "#3f3f46", strokeWidth: 1 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              iconType="circle"
              formatter={(value: string) => {
                const s = series.find((x) => x.key === value);
                return (
                  <span style={{ color: "#a1a1aa" }}>{s?.label ?? value}</span>
                );
              }}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.key}
                stroke={retailerColor(s.retailer)}
                strokeWidth={2}
                dot={{ r: 2.5, strokeWidth: 0, fill: retailerColor(s.retailer) }}
                activeDot={{ r: 4 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
