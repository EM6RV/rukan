import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Printer } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getDb } from "@/db";
import { formatDateTimeYear } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { DENOMINATIONS } from "@/lib/pos-engine";
import { shiftReport } from "@/server/pos/listing";
import { requireStoreContext } from "@/server/store-context";

export const metadata: Metadata = { title: "تقرير الوردية" };
const KIND = { in: "إدخال", out: "سحب", drawer: "فتح الدرج بدون بيع" } as const;

export default async function ShiftPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStoreContext("reports");
  const z = await shiftReport(getDb(), ctx.scope, (await params).id);
  if (!z) notFound();
  const s = z.shift;
  const rows: [string, number][] = [
    ["الرصيد الافتتاحي", z.opening], ["مبيعات كاش", z.sales], ["سداد ديون وشحن محافظ (كاش)", z.collections], ["إدخال للدرج", z.cashIn],
    ["سحب من الدرج", -z.cashOut], ["مرتجع كاش", -z.refunds], ["المتوقع في الدرج", z.expected],
  ];
  return (
    <div className="space-y-5">
      <Link href="/dashboard/shifts" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronRight className="size-4" aria-hidden /> الورديات</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">{s.zNumber ? `تقرير Z${s.zNumber}` : "وردية مفتوحة"}</h1>
          <p className="text-muted">{z.branch?.name} · فتحها {z.openedByName} {formatDateTimeYear(s.openedAt)}{s.closedAt ? ` · قفلها ${z.closedByName} ${formatDateTimeYear(s.closedAt)}` : ""}</p>
        </div>
        {s.status === "closed" && <a href={`/print/shifts/${s.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-medium hover:bg-surface-2"><Printer className="size-4" aria-hidden /> طباعة Z</a>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[["الفواتير", String(z.salesCount)], ["إجمالي المبيعات", formatMoney(z.salesTotal)], ["بطاقة وتحويل", formatMoney(z.cardTransfer)], ["على الحساب", formatMoney(z.credit)], ["من المحافظ", formatMoney(z.wallet)]].map(([l, v]) => (
          <Card key={l}><CardBody className="p-4"><p className="text-sm text-muted">{l}</p><p className="mt-1 text-xl font-bold tabular-nums">{v}</p></CardBody></Card>
        ))}
      </div>
      <Card>
        <CardHeader title="الدرج" />
        <dl className="divide-y divide-line text-sm">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between px-5 py-2.5"><dt className="text-muted">{k}</dt><dd className="tabular-nums">{formatMoney(v)}</dd></div>)}
          {s.countedCash !== null && <div className="flex justify-between px-5 py-2.5 font-semibold"><dt>المعدود</dt><dd className="tabular-nums">{formatMoney(s.countedCash)}</dd></div>}
          {s.difference !== null && <div className="flex justify-between px-5 py-2.5 font-bold"><dt>{s.difference < 0 ? "عجز" : s.difference > 0 ? "زيادة" : "الفرق"}</dt><dd className="tabular-nums">{formatMoney(s.difference)}</dd></div>}
        </dl>
        {s.denominations && <CardBody className="border-t border-line text-sm text-muted">الفئات: {DENOMINATIONS.filter((d) => s.denominations![String(d)]).map((d) => `${d / 1000}×${s.denominations![String(d)]}`).join("، ")}{s.denominations.coins ? ` · فكة ${formatMoney(s.denominations.coins)}` : ""}</CardBody>}
      </Card>
      {z.moves.length > 0 && (
        <Card>
          <CardHeader title="حركات الدرج" />
          <ul className="divide-y divide-line text-sm">{z.moves.map((mv) => <li key={mv.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5"><span>{KIND[mv.kind]} · {mv.reason ?? ""} · {mv.actor}{mv.approver ? ` · موافقة ${mv.approver}` : ""}</span><b>{mv.kind === "drawer" ? "—" : formatMoney(mv.amount)}</b></li>)}</ul>
        </Card>
      )}
    </div>
  );
}
