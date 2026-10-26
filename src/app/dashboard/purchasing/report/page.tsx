import type { Metadata } from "next";
import { moduleGate } from "@/components/dashboard/module-gate";
import { ButtonLink } from "@/components/ui/button";
import { msToDateInput } from "@/lib/date-input";
import { formatMoney } from "@/lib/money";
import { purchasesReport } from "@/server/inventory/purchasing";
import { parseRange } from "@/server/reports";
import { requireStoreContext } from "@/server/store-context";

export const metadata: Metadata = { title: "تقرير المشتريات" };

export default async function PurchasesReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requireStoreContext("products");
  const gate = moduleGate(ctx, "purchasing");
  if (gate) return gate;
  const sp = await searchParams;
  const range = parseRange(sp.from, sp.to);
  if (!range) return <p role="alert" className="rounded-md bg-danger/10 px-4 py-3 text-danger-fg">الفترة غير صحيحة (الحد الأقصى سنة).</p>;
  const rows = await purchasesReport(ctx.scope, range);
  const from = msToDateInput(range.from), to = msToDateInput(range.to);
  const input = "h-10 rounded-md border border-line bg-surface px-3 text-sm";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl">تقرير المشتريات</h1><p className="text-muted">المشتريات حسب المورد في الفترة، وأرصدة الموردين الحالية.</p></div>
        <ButtonLink href={`/dashboard/export-purchases?from=${from}&to=${to}`} variant="outline" size="sm">تصدير Excel</ButtonLink>
      </div>
      <form className="flex flex-wrap items-end gap-2"><input type="date" name="from" defaultValue={from} aria-label="من" dir="ltr" className={input} /><input type="date" name="to" defaultValue={to} aria-label="إلى" dir="ltr" className={input} /><button className="h-10 rounded-md bg-fg px-4 text-sm font-semibold text-bg">تطبيق</button></form>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="bg-surface-2 text-muted"><tr>{["المورد", "الفواتير", "إجمالي الفواتير", "المستلم", "الرصيد الحالي"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => <tr key={r.supplierId}><td className="px-3 py-2 font-medium">{r.name}</td><td className="px-3 py-2 tabular-nums">{r.invoices}</td><td className="px-3 py-2 tabular-nums">{formatMoney(r.total)}</td><td className="px-3 py-2 tabular-nums">{formatMoney(r.received)}</td><td className="px-3 py-2 font-bold tabular-nums">{formatMoney(r.balance)}</td></tr>)}
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">ما فيه موردين لسه.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
