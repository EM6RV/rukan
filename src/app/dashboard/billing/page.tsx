import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getDb } from "@/db";
import { DURATIONS, periodLabel, periodUnit, planPrice, upgradeRequestMessage } from "@/lib/billing";
import { PricingTable } from "@/components/pricing/pricing-table";
import { UsageCard } from "@/components/dashboard/usage-card";
import { getSiteContent } from "@/server/admin/site-content";
import { storeUsage } from "@/server/store-usage";
import { formatDate, formatDateTimeYear } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { toWhatsappNumber } from "@/lib/phone";
import { PAYMENT_METHOD_LABEL, STATE_LABEL, STATE_TONE } from "@/lib/store-state";
import { waLink } from "@/lib/whatsapp";
import { listPlans, publicPlans } from "@/server/admin/plans";
import { getPlatformConfig } from "@/server/admin/settings";
import { listPayments } from "@/server/admin/subscriptions";
import { requireStoreContext } from "@/server/store-context";

export const metadata: Metadata = { title: "الاشتراك" };

export default async function BillingPage() {
  const ctx = await requireStoreContext("billing");
  const db = getDb();
  const config = await getPlatformConfig(db);
  const [plans, pricing, payments, content, usage] = await Promise.all([
    listPlans(db), publicPlans(db, config.freePlanEnabled), listPayments(db, { storeId: ctx.store.id, pageSize: 20 }), getSiteContent(db),
    storeUsage(db, ctx),
  ]);
  const { store, access } = ctx;
  const current = plans.find((p) => p.id === store.planId);
  const end = store.status === "trial" ? store.trialEndsAt : store.currentPeriodEnd;
  const support = config.supportWhatsapp ? toWhatsappNumber(config.supportWhatsapp) : null;
  const request = (wanted?: string) => (support ? waLink(support, upgradeRequestMessage({ storeName: store.name, slug: store.slug, planName: current?.nameAr, wantedPlan: wanted })) : null);
  const renew = request();
  const upgradeTo = current ? pricing.find((p) => p.sortOrder > current.sortOrder && !p.isFree) : undefined; // أول باقة أعلى
  const upgrade = upgradeTo ? request(upgradeTo.name) : null;
  // رابط واتساب جاهز لكل باقة ومدة (باش الزر يطلب الباقة والمدة بالضبط)
  const links = support ? Object.fromEntries(pricing.filter((p) => !p.isFree).map((p) => [p.id, Object.fromEntries(DURATIONS.filter((d) => planPrice(p, d.cycle) != null).map((d) => [d.cycle, waLink(support, upgradeRequestMessage({ storeName: store.name, slug: store.slug, planName: current?.nameAr, wantedPlan: `${p.name} (${d.unit})` }))]))])) : null;

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الاشتراك</h1><p className="text-muted">باقتك الحالية وتاريخ التجديد والترقية.</p></div>

      <Card><CardBody className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">{current ? (current.isFree ? `باقة ${current.nameAr}` : `باقة ${current.nameAr} · ${periodLabel(store.billingCycle)}`) : "بدون باقة"} <Badge tone={STATE_TONE[access.state]}>{STATE_LABEL[access.state]}</Badge></p>
          {end && <p className="text-sm text-muted">{store.status === "trial" ? "تنتهي التجربة" : "يتجدد/ينتهي الاشتراك"} في {formatDate(end)}{access.daysLeft !== null && access.state !== "expired" ? ` · باقي ${access.daysLeft} ${access.daysLeft === 1 ? "يوم" : "أيام"}` : ""}</p>}
          {current && store.status !== "trial" && !current.isFree && planPrice(current, store.billingCycle) != null && <p className="text-sm text-muted">سعر المدة: {formatMoney(planPrice(current, store.billingCycle)!)} / {periodUnit(store.billingCycle)}</p>}
          {access.state === "expired" && <p className="text-sm font-medium text-danger-fg">انتهى الاشتراك: متجرك مغلق للزباين واللوحة للقراءة فقط.</p>}
          {access.state === "suspended" && <p className="text-sm font-medium text-danger-fg">متجرك موقوف. تواصل مع الدعم.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {renew ? <a href={renew} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-md bg-success px-5 font-semibold text-white hover:brightness-95"><MessageCircle className="size-4" aria-hidden /> {store.status === "trial" || access.state === "expired" ? "اشترك الحين" : "جدّد الاشتراك"}</a> : <p className="text-sm text-muted">تواصل مع دعم رُكن للتجديد.</p>}
          {upgrade && upgradeTo && access.state !== "suspended" && <a href={upgrade} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-md border border-line px-5 font-semibold hover:bg-surface-2">رقّي باقتك إلى «{upgradeTo.name}»</a>}
        </div>
      </CardBody></Card>

      <UsageCard usage={usage} />

      <div>
        <h2 className="mb-3 text-xl">الباقات والمدد</h2>
        <PricingTable
          plans={pricing}
          labels={{ popularBadge: content.pricing.popularBadge, rows: content.pricing.rows }}
          initialCycle={store.billingCycle}
          cta={{ kind: "upgrade", currentPlanId: store.planId, currentCycle: store.status === "trial" ? null : store.billingCycle, links }}
        />
        <p className="mt-3 text-sm text-muted">الدفع كاش أو تحويل مصرفي، والاشتراك يتفعل مباشرة بعد التأكيد.</p>
      </div>

      <Card>
        <CardHeader title="سجل الدفعات" />
        {payments.items.length === 0 ? <CardBody className="text-center text-sm text-muted">ما فيش دفعات مسجلة لسا.</CardBody> : (
          <ul className="divide-y divide-line">
            {payments.items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div><p className="font-semibold">{formatMoney(p.amount)} <span className="font-normal text-muted">· {p.planName} · {periodLabel(p.billingCycle)} · {PAYMENT_METHOD_LABEL[p.method]}</span></p><p className="text-xs text-muted">الفترة {formatDate(p.periodStart)} — {formatDate(p.periodEnd)} · {formatDateTimeYear(p.createdAt)}</p></div>
                {p.receiptMediaId && <a href={`/api/media/${p.receiptMediaId}`} target="_blank" rel="noopener noreferrer" className="text-link">الإيصال</a>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
