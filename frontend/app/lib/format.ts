import { formatDistanceToNowStrict } from "date-fns";

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return `${formatDistanceToNowStrict(new Date(iso))} ago`;
  } catch {
    return "—";
  }
}

const RETAILER_COLORS: Record<string, string> = {
  newegg: "#f7a600",
  bh: "#005ea6",
  bestbuy: "#0046be",
  microcenter: "#cc0000",
  amazon: "#ff9900",
};

const RETAILER_LABELS: Record<string, string> = {
  newegg: "Newegg",
  bh: "B&H",
  bestbuy: "Best Buy",
  microcenter: "Micro Center",
  amazon: "Amazon",
};

export function retailerColor(retailer: string): string {
  return RETAILER_COLORS[retailer.toLowerCase()] ?? "#8b5cf6";
}

export function retailerLabel(retailer: string): string {
  return RETAILER_LABELS[retailer.toLowerCase()] ?? retailer;
}

export function specSubtitle(capacity_gb: number, speed_mts: number, cas: number | null): string {
  const base = `${capacity_gb}GB DDR5-${speed_mts}`;
  return cas ? `${base} CL${cas}` : base;
}
