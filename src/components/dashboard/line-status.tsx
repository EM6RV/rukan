import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { daysText, periodLabel } from "@/lib/billing";
import { formatDate } from "@/lib/datetime";
import { LINE_INFO } from "@/lib/product-lines";
import { STATE_LABEL, STATE_TONE } from "@/lib/store-state";
import type { LineAccess } from "@/server/line-access";

/** كرت حالة اشتراك منظومة: الباقة والحالة والأيام الباقية وزر التجديد على واتساب */
export function LineStatus({ access, renew }: { access: LineAccess; renew: string | null }) {
  if (!access.subscribed || access.state === "none") return null;
  const end = access.state === "trial" ? access.trialEndsAt : access.periodEnd;
  const brand = LINE_INFO[access.line].brand;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {access.planName ? `باقة ${access.planName}${access.state === "trial" ? "" : ` · ${periodLabel(access.cycle)}`}` : brand}
          <Badge tone={STATE_TONE[access.state]}>{STATE_LABEL[access.state]}</Badge>
        </p>
        {end && <p className="text-sm text-muted">{access.state === "trial" ? "تنتهي التجربة" : "ينتهي الاشتراك"} في {formatDate(end)}{access.daysLeft !== null && access.daysLeft > 0 ? ` · باقي ${daysText(access.daysLeft)}` : ""}</p>}
        {access.state === "expired" && <p className="text-sm font-medium text-danger-fg">انتهى اشتراك {brand}: للقراءة فقط لين تجدد.</p>}
        {access.state === "suspended" && <p className="text-sm font-medium text-danger-fg">{brand} موقوف. تواصل مع الدعم.</p>}
      </div>
      {access.state !== "suspended" && (renew
        ? <a href={renew} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-md bg-success px-5 font-semibold text-white hover:brightness-95"><MessageCircle className="size-4" aria-hidden /> {access.state === "trial" || access.state === "expired" ? "اشترك الحين" : "جدّد الاشتراك"}</a>
        : <p className="text-sm text-muted">تواصل مع دعم رُكن للتجديد.</p>)}
    </div>
  );
}
