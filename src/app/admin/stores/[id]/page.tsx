import { periodLabel } from "@/lib/billing";
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
import { listAddons, listPlans } from "@/server/admin/plans";
import { storeAddons } from "@/db/schema/platform";
import { eq } from "drizzle-orm";
import { getStoreDetail } from "@/server/admin/stores";
import { getStoreDomain } from "@/server/domains";
import { DomainAdmin } from "./domain-admin";
import { InboxBeta } from "./inbox-beta";
import { ResetOwnerPassword } from "./reset-password";
import { StoreActions } from "./store-actions";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";
import { LinesAdmin } from "./lines-admin";
import { listBundles } from "@/server/admin/bundles";
import { lineLaunch } from "@/server/lines";
import { LINE_INFO, PRODUCT_LINES } from "@/lib/product-lines";

export const metadata: Metadata = { title: "تفاصيل المتجر" };

const ROLE = STAFF_ROLE_LABELS;
const ACTION_LABEL: Record<string, string> = {
  "subscription.payment": "تسجيل دفعة", "store.extend_trial": "تمديد التجربة", "store.suspend": "إيقاف المتجر", "store.unsuspend": "تفعيل المتجر",
  "store.change_plan": "تغيير الباقة", "line.start_trial": "بداية تجربة منظومة", "store.line_beta": "تجربة منظومة قبل الإطلاق", "staff.add": "إضافة موظف", "staff.remove": "حذف موظف", "staff.role": "تغيير صلاحية", "staff.password": "تغيير كلمة سر",
};

export default async function StoreDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [d, plans, domain, addonList, current, bundles, launch] = await Promise.all([
    getStoreDetail(db, id), listPlans(db), getStoreDomain(db, id), listAddons(db),
    db.select({ addonId: storeAddons.addonId, quantity: storeAddons.quantity, line: storeAddons.line }).from(storeAddons).where(eq(storeAddons.storeId, id)),
    listBundles(db), lineLaunch(db),
  ]);
  if (!d) notFound();
  const { store, access, lines } = d;
  // الرسالة والتواريخ: المتجر لو مشترك فيه، وإلا أول منظومة
  const main = lines.store.subscribed ? lines.store : PRODUCT_LINES.map((l) => lines[l]).find((l) => l.subscribed) ?? lines.store;
  const end = main.state === "trial" ? main.trialEndsAt : main.periodEnd;
  const wa = toWhatsappNumber(d.ownerPhone);
  const msg = renewalMessage({ ownerName: d.ownerName, storeName: store.name, daysLeft: main.daysLeft ?? 0, endDate: end ? formatDate(end) : "—", planName: main.planName });

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
              ["المالك", `${d.ownerName}`], ["الهاتف", d.ownerPhone],
              ["المنظومات", PRODUCT_LINES.filter((l) => lines[l].subscribed).map((l) => `${LINE_INFO[l].brand}: ${lines[l].planName ?? "بدون باقة"}${lines[l].state === "trial" ? "" : ` (${periodLabel(lines[l].cycle)})`}`).join("، ") || "—"],
              ["الإضافات", current.length ? current.map((c) => `${addonList.find((a) => a.id === c.addonId)?.nameAr ?? "?"} × ${c.quantity}${c.line === "store" ? "" : ` (${LINE_INFO[c.line].brand})`}`).join("، ") : "—"],
              [main.state === "trial" ? "تنتهي التجربة" : "ينتهي الاشتراك", end ? `${formatDate(end)}${main.daysLeft !== null ? ` · ${main.daysLeft > 0 ? `باقي ${main.daysLeft} يوم` : "منتهي"}` : ""}` : "—"],
              ["القالب", store.template], ["تاريخ التسجيل", formatDateTimeYear(store.createdAt)],
              ["المنتجات", String(d.counts.products)], ["الطلبيات", String(d.counts.orders)], ["الزبائن", String(d.counts.customers)],
            ] as const).map(([k, v]) => <div key={k} className="flex justify-between gap-4 px-5 py-2.5"><dt className="text-muted">{k}</dt><dd className="text-end font-medium" dir={k === "الهاتف" ? "ltr" : undefined}>{v}</dd></div>)}
          </dl>
        </Card>
        <StoreActions
          storeId={store.id} suspended={access.state === "suspended"}
          plans={plans.filter((p) => (p.isActive && !p.slug.startsWith("legacy-")) || PRODUCT_LINES.some((l) => lines[l].planId === p.id)).map((p) => ({ id: p.id, name: p.nameAr, prices: p.prices, isFree: p.isFree, line: p.line }))}
          addons={addonList.filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.nameAr, monthlyPrice: a.monthlyPrice, kind: a.kind }))}
          currentAddons={Object.fromEntries(PRODUCT_LINES.map((l) => [l, Object.fromEntries(current.filter((c) => c.line === l).map((c) => [c.addonId, c.quantity]))]))}
          lines={PRODUCT_LINES.map((l) => ({ line: l, subscribed: lines[l].subscribed, state: lines[l].state, planId: lines[l].planId, cycle: lines[l].cycle }))}
          bundles={bundles.filter((b) => b.isActive).map((b) => ({ nameAr: b.nameAr, lines: b.lines, discountPercent: b.discountPercent }))}
        />
      </div>

      <LinesAdmin storeId={store.id} beta={store.lineBeta}
        rows={PRODUCT_LINES.map((l) => ({ line: l, subscribed: lines[l].subscribed, state: lines[l].state, planName: lines[l].planName, daysLeft: lines[l].daysLeft, launched: launch[l] === "live" }))} />

      <InboxBeta storeId={store.id} enabled={store.inboxBeta} />

      <ResetOwnerPassword userId={store.ownerUserId} storeId={store.id} ownerName={d.ownerName} />

      {domain && <DomainAdmin id={domain.id} domain={domain.domain} status={domain.status} />}

      <Card>
        <CardHeader title="الدفعات" description="سجل الاشتراكات اللي اتسجلت" />
        {d.payments.length === 0 ? <CardBody className="text-center text-sm text-muted">ما فيش دفعات.</CardBody> : (
          <ul className="divide-y divide-line">
            {d.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div><p className="font-semibold">{formatMoney(p.amount)} <span className="font-normal text-muted">· {p.planName} · {periodLabel(p.billingCycle)} · {PAYMENT_METHOD_LABEL[p.method]}</span></p><p className="text-xs text-muted">الفترة {formatDate(p.periodStart)} — {formatDate(p.periodEnd)} · سجّلها {p.recordedBy} · {formatDateTimeYear(p.createdAt)}</p>{p.note && <p className="text-xs">{p.note}</p>}</div>
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
