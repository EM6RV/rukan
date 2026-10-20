import Link from "next/link";
import { cn } from "@/lib/cn";
import { UsageMeter } from "./usage-meter";

const tones = {
  neutral: "bg-surface-2 text-fg",
  teal: "bg-teal/10 text-link-strong",
  success: "bg-success/10 text-success-fg",
  danger: "bg-danger/10 text-danger-fg",
} as const;

/** بطاقة رقم: أيقونة + عنوان + قيمة (+ سطر توضيح أو شريط استهلاك). بيضاء بحد رفيع، والضغط يدخل للصفحة. */
export function StatCard({
  href, icon, label, value, hint, tone = "neutral", usage, className,
}: {
  href?: string; icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string;
  tone?: keyof typeof tones; usage?: { used: number; limit: number | null; unit: string }; className?: string;
}) {
  const body = (
    <div className={cn("flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors", href && "group-hover:border-fg/25", className)}>
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5", tones[tone])} aria-hidden>{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-sm text-muted">{label}</p>
          <p className="text-xl font-bold tabular-nums tracking-tight">{value}</p>
          {hint && <p className="text-xs tabular-nums text-muted">{hint}</p>}
        </div>
      </div>
      {usage && usage.limit !== null && <UsageMeter used={usage.used} limit={usage.limit} unit={usage.unit} />}
    </div>
  );
  return href ? <Link href={href} className="group block">{body}</Link> : body;
}
