import { retailerColor, retailerLabel } from "../lib/format";

export function RetailerBadge({
  retailer,
  variant,
  size = "sm",
}: {
  retailer: string;
  variant?: string | null;
  size?: "sm" | "xs";
}) {
  const color = retailerColor(retailer);
  const label = retailerLabel(retailer);
  const dim = size === "xs" ? "text-[12px] px-1.5 py-0.5" : "text-[13px] px-2 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-mono uppercase tracking-wider border ${dim}`}
      style={{
        borderColor: `${color}33`,
        background: `${color}10`,
        color: color,
      }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: color }}
      />
      {label}
      {variant && (
        <span className="text-[var(--muted-2)] normal-case">· {variant}</span>
      )}
    </span>
  );
}
