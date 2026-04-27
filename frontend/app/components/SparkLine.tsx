"use client";

import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import type { HistoryPoint } from "../lib/types";

export function SparkLine({ points }: { points: HistoryPoint[] }) {
  // collapse to one series — minimum price across retailers per timestamp bucket
  const byTime = new Map<string, number>();
  for (const p of points) {
    if (p.price_cents === null) continue;
    const k = p.scraped_at.slice(0, 13); // bucket per hour
    const cur = byTime.get(k);
    if (cur === undefined || p.price_cents < cur) byTime.set(k, p.price_cents);
  }
  const data = Array.from(byTime.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, v]) => ({ t, price: v / 100 }));

  if (data.length < 2) return null;

  const first = data[0].price;
  const last = data[data.length - 1].price;
  const trendDown = last <= first;
  const stroke = trendDown ? "#22c55e" : "#ef4444";

  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="price"
            stroke={stroke}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
