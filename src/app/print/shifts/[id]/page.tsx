import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { formatDateTimeYear } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { shiftReport } from "@/server/pos/listing";
import { posConfigOf } from "@/server/pos/sync";
import { requireStoreContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { PrintButton } from "../../orders/[id]/print-button";

export const metadata: Metadata = { title: "تقرير Z", robots: { index: false } };

export default async function PrintShift({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStoreContext("reports");
  const z = await shiftReport(getDb(), ctx.scope, (await params).id);
  if (!z) notFound();
  const [settings] = await ctx.scope.from(t.storeSettings).limit(1);
  const paper = posConfigOf(settings?.posConfig).paperWidth;
  const s = z.shift;
  const rows: [string, number][] = [
    [`المبيعات (${z.salesCount})`, z.salesTotal], ["بطاقة وتحويل", z.cardTransfer], ["على الحساب", z.credit], ["مرتجع كاش", -z.refunds],
    ["الرصيد الافتتاحي", z.opening], ["مبيعات كاش", z.sales], ["سداد وشحن كاش", z.collections], ["إدخال", z.cashIn], ["سحب", -z.cashOut],
  ];
  return (
    <div dir="rtl" className="min-h-dvh bg-white p-4 text-black print:p-0" style={{ colorScheme: "light" }}>
      <style>{`@page { size: ${paper}mm auto; margin: 2mm; } @media print { body { width: ${paper}mm; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-[48rem] items-center justify-between print:hidden"><Link href={`/dashboard/shifts/${s.id}`} className="text-sm underline">رجوع</Link><PrintButton /></div>
      <article className="mx-auto space-y-1.5 text-sm" style={{ maxWidth: `${paper - 4}mm` }}>
        <h1 className="text-center text-lg font-bold">{ctx.store.name}</h1>
        <p className="text-center">{z.branch?.name}</p>
        <hr className="border-dashed border-black" />
        <h2 className="text-center font-bold">تقرير Z{s.zNumber ? ` رقم ${s.zNumber}` : ""}</h2>
        <p>من {formatDateTimeYear(s.openedAt)}{s.closedAt ? ` إلى ${formatDateTimeYear(s.closedAt)}` : ""}</p>
        <p>فتحها {z.openedByName}{z.closedByName ? ` · قفلها ${z.closedByName}` : ""}</p>
        <hr className="border-dashed border-black" />
        {rows.map(([k, v]) => <p key={k} className="flex justify-between"><span>{k}</span><span>{formatMoney(v)}</span></p>)}
        <hr className="border-dashed border-black" />
        <p className="flex justify-between font-bold"><span>المتوقع في الدرج</span><span>{formatMoney(z.expected)}</span></p>
        {s.countedCash !== null && <p className="flex justify-between font-bold"><span>المعدود</span><span>{formatMoney(s.countedCash)}</span></p>}
        {s.difference !== null && <p className="flex justify-between font-bold"><span>{s.difference < 0 ? "عجز" : s.difference > 0 ? "زيادة" : "الفرق"}</span><span>{formatMoney(s.difference)}</span></p>}
      </article>
    </div>
  );
}
