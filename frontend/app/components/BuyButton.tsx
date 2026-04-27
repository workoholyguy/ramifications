import { ArrowUpRight } from "lucide-react";
import type { ListingOut } from "../lib/types";
import { formatCents, retailerColor, retailerLabel } from "../lib/format";

export function BuyButton({ listing }: { listing: ListingOut }) {
  const href = listing.affiliate_url || listing.url;
  const color = retailerColor(listing.retailer);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="group flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] hover:border-[var(--border-strong)] px-3.5 py-3 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="size-2 rounded-full shrink-0"
          style={{ background: color, boxShadow: `0 0 8px ${color}88` }}
        />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {retailerLabel(listing.retailer)}
          </div>
          {listing.variant && (
            <div className="text-[13px] text-[var(--muted-2)] font-mono">
              {listing.variant}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-mono font-medium">
          {formatCents(listing.last_price_cents)}
        </span>
        <ArrowUpRight
          size={14}
          className="text-[var(--muted-2)] group-hover:text-[var(--accent)] transition-colors"
        />
      </div>
    </a>
  );
}
