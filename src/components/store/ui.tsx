import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { mediaSrcSet, mediaUrl } from "@/lib/media-url";
import { discountPercent } from "@/lib/pricing";

/** صورة من /api/media بأحجام متعددة (srcset) وتحميل كسول. fill = تملأ الحاوية. */
export function MediaImage({
  id, alt, sizes = "(min-width: 1024px) 25vw, 50vw", priority, className, widths,
}: { id: string; alt: string; sizes?: string; priority?: boolean; className?: string; widths?: readonly number[] }) {
  return (
     
    <img
      src={mediaUrl(id, 640)} srcSet={mediaSrcSet(id, widths)} sizes={sizes} alt={alt}
      loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" draggable={false}
      className={cn("size-full object-cover", className)}
    />
  );
}

export function Price({
  price, maxPrice, compareAt, className, size = "md",
}: { price: number; maxPrice?: number; compareAt?: number | null; className?: string; size?: "sm" | "md" | "lg" }) {
  const pct = discountPercent(price, compareAt ?? null);
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-base";
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      <span className={cn("font-bold", text)}>
        {maxPrice !== undefined && maxPrice > price ? <span className="text-[0.8em] font-medium opacity-70">من </span> : null}
        {formatMoney(price)}
      </span>
      {compareAt && pct ? (
        <>
          <s className="text-[0.85em] opacity-55">{formatMoney(compareAt)}</s>
          <span className="sr-only">خصم {pct}%</span>
        </>
      ) : null}
    </span>
  );
}
