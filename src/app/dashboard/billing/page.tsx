import type { Metadata } from "next";
import { Check, MessageCircle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getDb } from "@/db";
import { approxMonthly, periodLabel, periodUnit, upgradeRequestMessage } from "@/lib/billing";
import { formatDate, formatDateTimeYear } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { toWhatsappNumber } from "@/lib/phone";
import { PAYMENT_METHOD_LABEL, STATE_LABEL, STATE_TONE } from "@/lib/store-state";
import { waLink } from "@/lib/whatsapp";
import { listPlans } from "@/server/admin/plans";
import { getPlatformConfig } from "@/server/admin/settings";
import { listPayments } from "@/server/admin/subscriptions";
import { requireStoreContext } from "@/server/store-context";

export const metadata: Metadata = { title: "الاشتراك" };

const FLAGS = [["allTemplates", "كل القوالب"], ["coupons", "الكوبونات"], ["reports", "التقارير"], ["pixels", "Pixels"], ["customDomain", "دومين خاص"], ["removeBranding", "بدون شعار رُكن"]] as const;

export default async function BillingPage() {
  const ctx = await requireStoreContext("billing");
  const db = getDb();
  const [plans, config, payments] = await Promise.all([listPlans(db), getPlatformConfig(db), listPayments(db, { storeId: ctx.store.id, pageSize: 20 })]);
  const { store, access } = ctx;
  const current = plans.find((p) => p.id === store.planId);
  const end = store.status === "trial" ? store.trialEndsAt : store.currentPeriodEnd;
  const support = config.supportWhatsapp ? toWhatsappNumber(config.supportWhatsapp) : null;
  const request = (wanted?: string) => (support ? waLink(support, upgradeRequestMessage({ storeName: store.name, slug: store.slug, planName: current?.nameAr, wantedPlan: wanted })) : null);
  const renew = request();
  const activePlans = plans.filter((p) => p.isActive);
  const upgradeTo = current ? activePlans.find((p) => p.sortOrder > current.sortOrder) : undefined; // أول باقة أعلى
  const upgrade = upgradeTo ? request(upgradeTo.nameAr) : null;

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الاشتراك</h1><p className="text-muted">باقتك الحالية وتاريخ التجديد والترقية.</p></div>

      <Card><CardBody className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">{current ? `باقة ${current.nameAr} · ${periodLabel(current.billingPeriod)}` : "بدون باقة"} <Badge tone={STATE_TONE[access.state]}>{STATE_LABEL[access.state]}</Badge></p>
          {end && <p className="text-sm text-muted">{store.status === "trial" ? "تنتهي التجربة" : "يتجدد/ينتهي الاشتراك"} في {formatDate(end)}{access.daysLeft !== null && access.state !== "expired" ? ` · باقي ${access.daysLeft} ${access.daysLeft === 1 ? "يوم" : "أيام"}` : ""}</p>}
          {current && store.status !== "trial" && <p className="text-sm text-muted">سعر الباقة: {formatMoney(current.price)} / {periodUnit(current.billingPeriod)}</p>}
          {access.state === "expired" && <p className="text-sm font-medium text-danger-fg">انتهى الاشتراك: متجرك مغلق للزباين واللوحة للقراءة فقط.</p>}
          {access.state === "suspended" && <p className="text-sm font-medium text-danger-fg">متجرك موقوف. تواصل مع الدعم.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {renew ? <a href={renew} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-md bg-success px-5 font-semibold text-white hover:brightness-95"><MessageCircle className="size-4" aria-hidden /> {store.status === "trial" || access.state === "expired" ? "اشترك الحين" : "جدّد الاشتراك"}</a> : <p className="text-sm text-muted">تواصل مع دعم رُكن للتجديد.</p>}
          {upgrade && upgradeTo && access.state !== "suspended" && <a href={upgrade} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-md border border-gold bg-gold/15 px-5 font-semibold hover:bg-gold/25">رقّي باقتك إلى «{upgradeTo.nameAr}»</a>}
        </div>
      </CardBody></Card>

      <div>
        <h2 className="mb-3 text-xl">الباقات</h2>
        <ul className="grid gap-4 lg:grid-cols-3">
          {activePlans.map((p) => {
            const isCurrent = p.id === store.planId;
            const monthly = approxMonthly(p.price, p.billingPeriod);
            const higher = current ? p.sortOrder > current.sortOrder : false;
            const link = request(p.nameAr);
            return (
              <li key={p.id}>
                <Card className={`h-full space-y-3 p-5 ${isCurrent ? "border-gold ring-2 ring-gold/30" : ""}`}>
                  <div className="flex items-center justify-between"><h3 className="text-lg">{p.nameAr}</h3>{isCurrent && <Badge tone="gold">باقتك</Badge>}</div>
                  {p.descriptionAr && <p className="text-sm text-muted">{p.descriptionAr}</p>}
                  <p className="text-2xl font-bold">{formatMoney(p.price)} <span className="text-sm font-normal text-muted">/ {periodUnit(p.billingPeriod)}</span></p>
                  {monthly ? <p className="text-sm text-muted">يعني تقريباً {formatMoney(monthly)} في الشهر</p> : null}
                  <ul className="space-y-1.5 text-sm">
                    <li>{p.limits.maxProducts === null ? "منتجات غير محدودة" : `${p.limits.maxProducts} منتج`}</li>
                    <li>{p.limits.maxStaff === null ? "موظفين غير محدودين" : `${p.limits.maxStaff} موظف`}</li>
                    {FLAGS.map(([k, l]) => <li key={k} className={`flex items-center gap-1.5 ${p.limits[k] ? "" : "text-muted"}`}>{p.limits[k] ? <Check className="size-4 text-success-fg" aria-hidden /> : <X className="size-4" aria-hidden />}{l}</li>)}
                  </ul>
                  {link && !isCurrent && <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-semibold hover:bg-surface-2"><MessageCircle className="size-4" aria-hidden /> {higher ? "رقّي لهذي الباقة" : "حوّل لهذي الباقة"}</a>}
                </Card>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm text-muted">الدفع كاش أو تحويل مصرفي، والاشتراك يتفعل مباشرة بعد التأكيد.</p>
      </div>

      <Card>
        <CardHeader title="سجل الدفعات" />
        {payments.items.length === 0 ? <CardBody className="text-center text-sm text-muted">ما فيش دفعات مسجلة لسا.</CardBody> : (
          <ul className="divide-y divide-line">
            {payments.items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div><p className="font-semibold">{formatMoney(p.amount)} <span className="font-normal text-muted">· {p.planName} · {p.billingCycle === "yearly" ? "سنوية" : "شهرية"} · {PAYMENT_METHOD_LABEL[p.method]}</span></p><p className="text-xs text-muted">الفترة {formatDate(p.periodStart)} — {formatDate(p.periodEnd)} · {formatDateTimeYear(p.createdAt)}</p></div>
                {p.receiptMediaId && <a href={`/api/media/${p.receiptMediaId}`} target="_blank" rel="noopener noreferrer" className="text-link">الإيصال</a>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
