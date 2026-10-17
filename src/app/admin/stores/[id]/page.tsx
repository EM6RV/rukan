import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, ExternalLink, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getDb } from "@/db";
import { renewalMessage } from "@/lib/billing";
import { getEnv } from "@/lib/env";
import { formatDate, formatDateTimeYear } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { toWhatsappNumber } from "@/lib/phone";
import { PAYMENT_METHOD_LABEL, STATE_LABEL, STATE_TONE } from "@/lib/store-state";
import { storeUrl } from "@/lib/store-url";
import { currentRequest } from "@/server/request-origin";
import { waLink } from "@/lib/whatsapp";
import { listPlans } from "@/server/admin/plans";
import { getStoreDetail } from "@/server/admin/stores";
import { getStoreDomain } from "@/server/domains";
import { DomainAdmin } from "./domain-admin";
import { ResetOwnerPassword } from "./reset-password";
import { StoreActions } from "./store-actions";

export const metadata: Metadata = { title: "تفاصيل المتجر" };

const ROLE = { owner: "المالك", manager: "مدير", orders_staff: "موظف طلبيات", courier: "مندوب" } as const;
const ACTION_LABEL: Record<string, string> = {
  "subscription.payment": "تسجيل دفعة", "store.extend_trial": "تمديد التجربة", "store.suspend": "إيقاف المتجر", "store.unsuspend": "تفعيل المتجر",
  "store.change_plan": "تغيير الباقة", "staff.add": "إضافة موظف", "staff.remove": "حذف موظف", "staff.role": "تغيير صلاحية", "staff.password": "تغيير كلمة سر",
};

export default async function StoreDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [d, plans, domain] = await Promise.all([getStoreDetail(db, id), listPlans(db), getStoreDomain(db, id)]);
  if (!d) notFound();
  const { store, access } = d;
  const end = store.status === "trial" ? store.trialEndsAt : store.currentPeriodEnd;
  const wa = toWhatsappNumber(d.ownerPhone);
  const msg = renewalMessage({ ownerName: d.ownerName, storeName: store.name, daysLeft: access.daysLeft ?? 0, endDate: end ? formatDate(end) : "—", planName: d.plan?.nameAr });

  const req = await currentRequest();
  return (
    <>
      <Link href="/admin/stores" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronRight className="size-4" aria-hidden /> كل المتاجر</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl">{store.name}<Badge tone={STATE_TONE[access.state]}>{STATE_LABEL[access.state]}</Badge>{!store.onboardedAt && <Badge>ما كمّل الإعداد</Badge>}</h1>
          <p dir="ltr" className="text-start text-muted">{store.slug}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={storeUrl(store.slug, getEnv(), req)} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium hover:bg-surface-2"><ExternalLink className="size-4" aria-hidden /> فتح المتجر</a>
          {wa && <a href={waLink(wa, msg)} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-success px-3 text-sm font-semibold text-white hover:brightness-95"><MessageCircle className="size-4" aria-hidden /> واتساب المالك</a>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="معلومات" />
          <dl className="divide-y divide-line text-sm">
            {([
              ["المالك", `${d.ownerName}`], ["الهاتف", d.ownerPhone], ["الباقة", d.plan ? `${d.plan.nameAr} (${d.plan.billingPeriod === "yearly" ? "سنوية" : "شهرية"})` : "بدون باقة"],
              [store.status === "trial" ? "تنتهي التجربة" : "ينتهي الاشتراك", end ? `${formatDate(end)}${access.daysLeft !== null ? ` · ${access.daysLeft > 0 ? `باقي ${access.daysLeft} يوم` : "منتهي"}` : ""}` : "—"],
              ["القالب", store.template], ["تاريخ التسجيل", formatDateTimeYear(store.createdAt)],
              ["المنتجات", String(d.counts.products)], ["الطلبيات", String(d.counts.orders)], ["الزبائن", String(d.counts.customers)],
            ] as const).map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-5 py-2.5"><dt className="text-muted">{k}</dt><dd className="text-end font-medium" dir={k === "الهاتف" ? "ltr" : undefined}>{v}</dd></div>)}
          </dl>
        </Card>
        <StoreActions
          storeId={store.id} suspended={store.status === "suspended"} currentPlanId={store.planId} state={access.state}
          plans={plans.filter((p) => p.isActive || p.id === store.planId).map((p) => ({ id: p.id, name: p.nameAr, billingPeriod: p.billingPeriod, price: p.price }))}
        />
      </div>

      <ResetOwnerPassword userId={store.ownerUserId} storeId={store.id} ownerName={d.ownerName} />

      {domain && <DomainAdmin id={domain.id} domain={domain.domain} status={domain.status} />}

      <Card>
        <CardHeader title="الدفعات" description="سجل الاشتراكات اللي اتسجلت" />
        {d.payments.length === 0 ? <CardBody className="text-center text-sm text-muted">ما فيش دفعات.</CardBody> : (
          <ul className="divide-y divide-line">
            {d.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div><p className="font-semibold">{formatMoney(p.amount)} <span className="font-normal text-muted">· {p.planName} · {p.billingCycle === "yearly" ? "سنوي" : "شهري"} · {PAYMENT_METHOD_LABEL[p.method]}</span></p><p className="text-xs text-muted">الفترة {formatDate(p.periodStart)} — {formatDate(p.periodEnd)} · سجّلها {p.recordedBy} · {formatDateTimeYear(p.createdAt)}</p>{p.note && <p className="text-xs">{p.note}</p>}</div>
                {p.receiptMediaId && <a href={`/api/media/${p.receiptMediaId}`} target="_blank" rel="noopener noreferrer" className="text-link">الإيصال</a>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="الأعضاء" />
          <ul className="divide-y divide-line text-sm">{d.members.map((m) => <li key={m.phone} className="flex justify-between px-5 py-2.5"><span>{m.name} <span dir="ltr" className="text-muted">{m.phone}</span></span><Badge>{ROLE[m.role]}</Badge></li>)}</ul>
        </Card>
        <Card>
          <CardHeader title="آخر العمليات" />
          {d.audit.length === 0 ? <CardBody className="text-center text-sm text-muted">ما فيش عمليات مسجلة.</CardBody> : (
            <ul className="divide-y divide-line text-sm">{d.audit.map((a) => <li key={a.id} className="flex justify-between gap-3 px-5 py-2.5"><span>{ACTION_LABEL[a.action] ?? a.action}{a.actor ? <span className="text-muted"> · {a.actor}</span> : null}</span><span className="shrink-0 text-xs text-muted">{formatDateTimeYear(a.createdAt)}</span></li>)}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
