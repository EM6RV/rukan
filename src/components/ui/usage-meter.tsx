import { cn } from "@/lib/cn";

/** «استعملت 48 من 50 منتج» بشريط تقدم. يحمر لما يقرب الحد. limit null = غير محدود. */
export function UsageMeter({ used, limit, unit, className }: { used: number; limit: number | null; unit: string; className?: string }) {
  if (limit === null) return <p className={cn("text-xs text-muted", className)}>{used} {unit} · بدون حد</p>;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const tone = pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-gold" : "bg-teal";
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex justify-between text-xs"><span className="text-muted">استعملت <span className="font-semibold tabular-nums text-fg">{used}</span> من <span className="tabular-nums">{limit}</span> {unit}</span>{pct >= 100 && <span className="font-semibold text-danger-fg">وصلت الحد</span>}</div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)} aria-label={`${unit}: ${used} من ${limit}`} className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={cn("h-full rounded-full transition-[width] duration-500", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
