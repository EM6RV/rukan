import { X } from "lucide-react";
import { periodLabel, type BillingPeriod } from "@/lib/billing";
import { dismissPlanNoticeAction } from "@/app/dashboard/billing/actions";

const FROM: Record<string, string> = { monthly: "الشهرية", semiannual: "«ست شهور»", yearly: "السنوية" };
const TO: Record<string, string> = { monthly: "نمو", semiannual: "نمو", yearly: "احترافي" };

/** رسالة شرح الباقات الجديدة للمشتركين القدام: تبان لين يقفلها (أو لين يجدد) */
export function PlanNotice({ notice, cycle, planName }: { notice: string; cycle: BillingPeriod; planName: string | null }) {
  const from = FROM[notice] ?? "القديمة", to = planName ?? TO[notice] ?? "الجديدة";
  return (
    <div role="status" className="flex items-start gap-3 border-b border-line bg-surface-2 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold">رُكن غيّرنا الباقات: باقتك {from} صارت «{to}» ({periodLabel(cycle)}).</p>
        <p className="text-muted">ما تغيّر شي عليك: نفس تاريخ انتهاء اشتراكك ونفس المبلغ لين تجدد. وعند التجديد تلقى الباقات والأسعار الجديدة في صفحة <a href="/dashboard/billing" className="font-semibold text-link underline underline-offset-4">الاشتراك</a>، وتقدر تختار المدة اللي تناسبك (شهر، 3 شهور، 6 شهور، سنة).</p>
      </div>
      <form action={dismissPlanNoticeAction}><button aria-label="إغلاق الرسالة" className="flex size-9 items-center justify-center rounded-md text-muted hover:bg-surface hover:text-fg"><X className="size-4" /></button></form>
    </div>
  );
}
