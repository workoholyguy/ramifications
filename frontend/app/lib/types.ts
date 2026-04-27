export type Retailer =
  | "newegg"
  | "bh"
  | "bestbuy"
  | "microcenter"
  | "amazon";

export type ListingOut = {
  id: number;
  retailer: string;
  url: string;
  affiliate_url: string | null;
  variant: string | null;
  last_price_cents: number | null;
  last_seen_at: string | null;
};

export type ItemOut = {
  id: number;
  canonical_sku: string;
  brand: string;
  model: string;
  capacity_gb: number;
  speed_mts: number;
  cas: number | null;
  image_url: string | null;
  cheapest_price_cents: number | null;
  cheapest_retailer: string | null;
  listings: ListingOut[];
};

export type HistoryPoint = {
  retailer: string;
  listing_id: number;
  variant: string | null;
  price_cents: number | null;
  in_stock: boolean;
  scraped_at: string;
};

export type HistoryOut = {
  item_id: number;
  canonical_sku: string;
  points: HistoryPoint[];
};

export type BuySignalOut = {
  verdict: "BUY" | "WAIT" | "AVOID";
  reason: string;
  confidence: number;
  cached: boolean;
  generated_at: string;
};

export type OverpayOut = {
  purchase_price_cents: number;
  purchase_date: string;
  purchase_retailer: string;
  current_min_price_cents: number | null;
  current_min_retailer: string | null;
  delta_cents: number | null;
  price_match_policy: string | null;
};

export type TrackError = {
  error: string;
  supported_skus?: string[];
  hint?: string;
};
