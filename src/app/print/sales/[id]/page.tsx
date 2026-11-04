import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { PAY_METHOD_LABELS } from "@/lib/constants";
import { formatDateTimeYear } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { getSale } from "@/server/pos/listing";
import { posConfigOf } from "@/server/pos/sync";
import { requireStoreContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { PrintButton } from "../../orders/[id]/print-button";

export const metadata: Metadata = { title: "فاتورة كاشير", robots: { index: false } };

/** فاتورة الكاشير للطباعة الحرارية (58/80) أو A4، والمتصفح يحفظها PDF */
export default async function PrintSale({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ size?: string }> }) {
  const [{ id }, { size }] = await Promise.all([params, searchParams]);
  const ctx = await requireStoreContext("reports");
  const d = await getSale(getDb(), ctx.scope, id);
  if (!d) notFound();
  const [settings] = await ctx.scope.from(t.storeSettings).limit(1);
  const paper = size === "a4" ? null : size === "80" ? 80 : size === "58" ? 58 : posConfigOf(settings?.posConfig).paperWidth;
  const { sale } = d;
  return (
    <div dir="rtl" className="min-h-dvh bg-white p-4 text-black print:p-0" style={{ colorScheme: "light" }}>
      {paper && <style>{`@page { size: ${paper}mm auto; margin: 2mm; } @media print { body { width: ${paper}mm; } }`}</style>}
      <div className="mx-auto mb-4 flex max-w-[48rem] flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/dashboard/sales/${sale.id}`} className="text-sm underline">رجوع للفاتورة</Link>
        <div className="flex items-center gap-3 text-sm">
          {[["58", "حراري 58"], ["80", "حراري 80"], ["a4", "A4"]].map(([v, l]) => <Link key={v} href={`?size=${v}`} className={(v === "a4" ? !paper : String(paper) === v) ? "font-bold" : "underline"}>{l}</Link>)}
          <PrintButton />
        </div>
      </div>
      <article className="mx-auto space-y-2 text-sm" style={{ maxWidth: paper ? `${paper - 4}mm` : "48rem" }}>
        <h1 className="text-center text-lg font-bold">{ctx.store.name}</h1>
        {d.branch?.receiptHeader && <p className="whitespace-pre-line text-center">{d.branch.receiptHeader}</p>}
        <p className="text-center">{d.branch?.name}{d.branch?.phone ? ` · ${d.branch.phone}` : ""}</p>
        <hr className="border-dashed border-black" />
        <p className="flex justify-between"><span>فاتورة {sale.receiptNo ?? `#${sale.number}`}</span><span>{formatDateTimeYear(sale.soldAt)}</span></p>
        <p>الكاشير: {d.cashier}{d.customer ? ` · الزبون: ${d.customer.name}` : ""}</p>
        <hr className="border-dashed border-black" />
        {d.items.map((i) => (
          <div key={i.id}><p>{i.name}</p><p className="flex justify-between"><span>{i.isWeighed ? `${i.quantity / 1000} كغ` : i.quantity} × {formatMoney(i.unitPrice)}{i.discount ? ` − ${formatMoney(i.discount)}` : ""}</span><span>{formatMoney(i.total)}</span></p></div>
        ))}
        <hr className="border-dashed border-black" />
        {sale.discount > 0 && <p className="flex justify-between"><span>الخصم</span><span>− {formatMoney(sale.discount)}</span></p>}
        <p className="flex justify-between text-base font-bold"><span>الإجمالي</span><span>{formatMoney(sale.total)}</span></p>
        {d.payments.map((p) => <p key={p.id} className="flex justify-between"><span>{PAY_METHOD_LABELS[p.method]}</span><span>{formatMoney(p.method === "cash" && sale.tendered ? sale.tendered : p.amount)}</span></p>)}
        {sale.change > 0 && <p className="flex justify-between"><span>الباقي</span><span>{formatMoney(sale.change)}</span></p>}
        <hr className="border-dashed border-black" />
        {(d.branch?.receiptFooter ?? settings?.footerText) && <p className="whitespace-pre-line text-center">{d.branch?.receiptFooter ?? settings?.footerText}</p>}
      </article>
    </div>
  );
}
