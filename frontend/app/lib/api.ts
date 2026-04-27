import type {
  ItemOut,
  HistoryOut,
  BuySignalOut,
  OverpayOut,
  AlertOut,
} from "./types";
import {
  MOCK_ITEMS,
  MOCK_HISTORY,
  MOCK_BUY_SIGNALS,
} from "./mock-data";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

// Demo-mode flag flips to true the first time the backend is unreachable.
// Components can read it to render a "showing demo data" banner.
let _demoMode = false;
export function isDemoMode(): boolean {
  return _demoMode;
}
function flipDemoMode() {
  _demoMode = true;
}

// A network error means: fetch threw (rejected). HTTP 4xx/5xx don't count.
function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError;
}

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
  listItems: async () => {
    try {
      return await request<ItemOut[]>("/items");
    } catch (e) {
      if (isNetworkError(e)) {
        flipDemoMode();
        return MOCK_ITEMS;
      }
      throw e;
    }
  },
  trackItem: (url: string) =>
    request<ItemOut>("/items", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  refreshItem: (id: number) =>
    request<ItemOut>(`/items/${id}/refresh`, { method: "POST" }),
  refreshAll: async () => {
    try {
      return await request<ItemOut[]>("/refresh-all", { method: "POST" });
    } catch (e) {
      if (isNetworkError(e)) {
        flipDemoMode();
        return MOCK_ITEMS;
      }
      throw e;
    }
  },
  history: async (id: number) => {
    try {
      return await request<HistoryOut>(`/items/${id}/history`);
    } catch (e) {
      if (isNetworkError(e) && MOCK_HISTORY[id]) {
        flipDemoMode();
        return MOCK_HISTORY[id];
      }
      throw e;
    }
  },
  buySignal: async (id: number) => {
    try {
      return await request<BuySignalOut>(`/items/${id}/buy-signal`, {
        method: "POST",
      });
    } catch (e) {
      if (isNetworkError(e) && MOCK_BUY_SIGNALS[id]) {
        flipDemoMode();
        return MOCK_BUY_SIGNALS[id];
      }
      throw e;
    }
  },
  createAlert: (id: number, target_price_cents: number) =>
    request<{ id: number; item_id: number; target_price_cents: number }>(
      `/items/${id}/alerts`,
      {
        method: "POST",
        body: JSON.stringify({ target_price_cents }),
      },
    ),
  listAlerts: (id: number) => request<AlertOut[]>(`/items/${id}/alerts`),
  deleteAlert: (item_id: number, alert_id: number) =>
    request<null>(`/items/${item_id}/alerts/${alert_id}`, {
      method: "DELETE",
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
