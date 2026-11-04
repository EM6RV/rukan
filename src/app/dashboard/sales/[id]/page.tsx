import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Printer, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getDb } from "@/db";
import { PAY_METHOD_LABELS } from "@/lib/constants";
import { formatDateTimeYear } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { getSale } from "@/server/pos/listing";
import { requireStoreContext } from "@/server/store-context";

export const metadata: Metadata = { title: "فاتورة كاشير" };

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStoreContext("reports");
  const d = await getSale(getDb(), ctx.scope, (await params).id);
  if (!d) notFound();
  const { sale } = d;
  return (
    <div className="space-y-5">
      <Link href="/dashboard/sales" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronRight className="size-4" aria-hidden /> فواتير الكاشير</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">فاتورة #{sale.number} {sale.receiptNo && <span className="text-base font-normal text-muted" dir="ltr">({sale.receiptNo})</span>}</h1>
          <p className="text-muted">{formatDateTimeYear(sale.soldAt)} · {d.branch?.name} · الكاشير {d.cashier}{d.customer ? ` · ${d.customer.name}` : ""}</p>
        </div>
        <a href={`/print/sales/${sale.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md border border-line px-4 text-sm font-medium hover:bg-surface-2"><Printer className="size-4" aria-hidden /> طباعة / PDF</a>
      </div>
      {sale.needsReview && (
        <Card><CardBody className="space-y-1">
          <p className="flex items-center gap-2 font-semibold text-fg"><TriangleAlert className="size-4" aria-hidden /> تحتاج مراجعة</p>
          <ul className="list-inside list-disc text-sm">{(sale.reviewNotes ?? []).map((n, i) => <li key={i}>{n}</li>)}</ul>
        </CardBody></Card>
      )}
      <Card>
        <CardHeader title="السطور" />
        <ul className="divide-y divide-line">
          {d.items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <span>{i.name} <span className="text-muted">× {i.isWeighed ? `${i.quantity / 1000} كغ` : i.quantity}{i.discount ? ` · خصم ${formatMoney(i.discount)}` : ""}{i.returnedQty ? ` · رجع ${i.returnedQty}` : ""}</span></span>
              <b className="tabular-nums">{formatMoney(i.total)}</b>
            </li>
          ))}
        </ul>
        <CardBody className="space-y-1 border-t border-line text-sm">
          <div className="flex justify-between"><span className="text-muted">المجموع</span><span className="tabular-nums">{formatMoney(sale.subtotal)}</span></div>
          {sale.discount > 0 && <div className="flex justify-between"><span className="text-muted">الخصم{d.approver ? ` (موافقة ${d.approver})` : ""}</span><span className="tabular-nums">− {formatMoney(sale.discount)}</span></div>}
          <div className="flex justify-between text-base font-bold"><span>الإجمالي</span><span className="tabular-nums">{formatMoney(sale.total)}</span></div>
          {d.payments.map((p) => <div key={p.id} className="flex justify-between"><span className="text-muted">{PAY_METHOD_LABELS[p.method]}</span><span className="tabular-nums">{formatMoney(p.amount)}</span></div>)}
          {sale.change > 0 && <div className="flex justify-between"><span className="text-muted">الباقي للزبون</span><span className="tabular-nums">{formatMoney(sale.change)}</span></div>}
        </CardBody>
      </Card>
      {d.returns.length > 0 && (
        <Card>
          <CardHeader title="المرتجعات" />
          <ul className="divide-y divide-line">{d.returns.map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm"><span>{formatDateTimeYear(r.at)} · {r.actor}{r.approver ? ` · موافقة ${r.approver}` : <Badge tone="danger">بدون موافقة</Badge>}{r.reason ? ` · ${r.reason}` : ""}</span><b>{formatMoney(r.amount)} ({PAY_METHOD_LABELS[r.refundMethod]})</b></li>)}</ul>
        </Card>
      )}
    </div>
  );
}
