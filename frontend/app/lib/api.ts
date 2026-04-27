import type {
  ItemOut,
  HistoryOut,
  BuySignalOut,
  OverpayOut,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const msg = typeof body === "object" && body && "error" in body
      ? String((body as { error: unknown }).error)
      : `Request failed: ${res.status}`;
    throw new ApiError(res.status, body, msg);
  }
  return body as T;
}

export const api = {
  listItems: () => request<ItemOut[]>("/items"),
  trackItem: (url: string) =>
    request<ItemOut>("/items", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  refreshItem: (id: number) =>
    request<ItemOut>(`/items/${id}/refresh`, { method: "POST" }),
  refreshAll: () =>
    request<ItemOut[]>("/refresh-all", { method: "POST" }),
  history: (id: number) => request<HistoryOut>(`/items/${id}/history`),
  buySignal: (id: number) =>
    request<BuySignalOut>(`/items/${id}/buy-signal`, { method: "POST" }),
  createAlert: (id: number, target_price_cents: number) =>
    request<{ ok: boolean }>(`/items/${id}/alerts`, {
      method: "POST",
      body: JSON.stringify({ target_price_cents }),
    }),
  recordPurchase: (
    id: number,
    payload: {
      listing_id: number;
      purchase_date: string;
      purchase_price_cents: number;
    },
  ) =>
    request<{ ok: boolean }>(`/items/${id}/purchase`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  overpay: (id: number) => request<OverpayOut>(`/items/${id}/overpay`),
};
