import { periodLabel } from "@/lib/billing";
import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { getDb } from "@/db";
import { renewalMessage } from "@/lib/billing";
import { formatDate, formatDateTimeYear } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { toWhatsappNumber } from "@/lib/phone";
import { PAYMENT_METHOD_LABEL } from "@/lib/store-state";
import { waLink } from "@/lib/whatsapp";
import { listExpiring, listPayments } from "@/server/admin/subscriptions";
import { LINE_INFO, PRODUCT_LINES, isProductLine } from "@/lib/product-lines";

export const metadata: Metadata = { title: "الاشتراكات والدفعات" };

export default async function AdminPayments({ searchParams }: { searchParams: Promise<{ page?: string; line?: string }> }) {
  const sp = await searchParams;
  const line = isProductLine(sp.line) ? sp.line : undefined;
  const db = getDb();
  const [r, expiring] = await Promise.all([listPayments(db, { page: Number(sp.page) || 1, line }), listExpiring(db, { withinDays: 14, graceDays: 14, line })]);
  const q = (page?: number) => { const p = new URLSearchParams(); if (line) p.set("line", line); if (page && page > 1) p.set("page", String(page)); return p.size ? `?${p}` : "?"; };

  return (
    <>
      <div><h1 className="text-2xl">الاشتراكات والدفعات</h1><p className="text-muted">لتسجيل دفعة افتح النشاط من «النشاطات» واختار المنظومة في «تسجيل دفعة».</p></div>
      <nav aria-label="المنظومة" className="flex flex-wrap gap-2">
        {[undefined, ...PRODUCT_LINES].map((l) => (
          <Link key={l ?? "all"} href={l ? `?line=${l}` : "?"} aria-current={line === l ? "page" : undefined} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${line === l ? "border-fg bg-fg text-bg" : "border-line bg-surface text-muted hover:text-fg"}`}>{l ? LINE_INFO[l].brand : "كل المنظومات"}</Link>
        ))}
      </nav>

      <Card>
        <CardHeader title="تجديدات قادمة" description="تنتهي خلال 14 يوم أو انتهت آخر 14 يوم" />
        {expiring.length === 0 ? <CardBody className="text-center text-sm text-muted">ما فيش.</CardBody> : (
          <ul className="divide-y divide-line">
            {expiring.map((e) => {
              const wa = toWhatsappNumber(e.ownerPhone);
              return (
                <li key={`${e.id}-${e.line}`} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <Link href={`/admin/stores/${e.id}`} className="min-w-0 flex-1"><p className="truncate font-semibold">{e.name} <span className="font-normal text-muted">· {LINE_INFO[e.line].brand}</span></p><p className="text-muted">{e.ownerName} · {e.planName ?? "بدون باقة"} · ينتهي {formatDate(e.endsAt)}</p></Link>
                  <Badge tone={e.daysLeft <= 0 ? "danger" : e.daysLeft <= 5 ? "gold" : "neutral"}>{e.daysLeft <= 0 ? `منتهي من ${-e.daysLeft} يوم` : `باقي ${e.daysLeft} يوم`}</Badge>
                  {wa && <a href={waLink(wa, renewalMessage({ ownerName: e.ownerName, storeName: e.name, daysLeft: e.daysLeft, endDate: formatDate(e.endsAt), planName: e.planName, lineName: e.line === "store" ? undefined : LINE_INFO[e.line].brand }))} target="_blank" rel="noopener noreferrer" className="rounded-md bg-success px-3 py-1.5 font-semibold text-white hover:brightness-95">واتساب</a>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <h2 className="text-xl">كل الدفعات ({r.total})</h2>
      {r.items.length === 0 ? <EmptyState icon={<CreditCard className="size-6" />} title="ما فيش دفعات لسا" description="لما تسجل أول دفعة تظهر هنا." /> : (
        <ul className="space-y-2">
          {r.items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 text-sm shadow-soft">
              <div className="min-w-0">
                <Link href={`/admin/stores/${p.storeId}`} className="font-semibold hover:underline">{p.storeName}</Link>
                <p className="text-muted">{LINE_INFO[p.line].brand} · {p.planName} · {periodLabel(p.billingCycle)} · {PAYMENT_METHOD_LABEL[p.method]} · الفترة {formatDate(p.periodStart)} — {formatDate(p.periodEnd)}</p>
                <p className="text-xs text-muted">{formatDateTimeYear(p.createdAt)} · {p.recordedBy}{p.note ? ` · ${p.note}` : ""}</p>
              </div>
              <div className="flex items-center gap-3"><b className="text-base">{formatMoney(p.amount)}</b>{p.receiptMediaId && <a href={`/api/media/${p.receiptMediaId}`} target="_blank" rel="noopener noreferrer" className="text-link">الإيصال</a>}</div>
            </li>
          ))}
        </ul>
      )}
      {r.pageCount > 1 && (
        <nav aria-label="الصفحات" className="flex items-center justify-center gap-3 text-sm">
          {r.page > 1 && <Link className="rounded-md border border-line px-3 py-2" href={q(r.page - 1)}>السابق</Link>}
          <span className="text-muted">صفحة {r.page} من {r.pageCount}</span>
          {r.page < r.pageCount && <Link className="rounded-md border border-line px-3 py-2" href={q(r.page + 1)}>التالي</Link>}
        </nav>
      )}
    </>
  );
}
