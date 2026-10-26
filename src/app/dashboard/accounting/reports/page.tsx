import type { Metadata } from "next";
import { moduleGate } from "@/components/dashboard/module-gate";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { msToDateInput } from "@/lib/date-input";
import { formatDateTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { cashFlow, listClosings, profitAndLoss } from "@/server/accounting/ledger";
import { parseRange } from "@/server/reports";
import { requireStoreContext } from "@/server/store-context";

export const metadata: Metadata = { title: "الأرباح والتدفق النقدي" };

export default async function AccountingReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requireStoreContext("accounting");
  const gate = moduleGate(ctx, "accounting");
  if (gate) return gate;
  const sp = await searchParams;
  const range = parseRange(sp.from, sp.to);
  if (!range) return <p role="alert" className="rounded-md bg-danger/10 px-4 py-3 text-danger-fg">الفترة غير صحيحة (الحد الأقصى سنة).</p>;
  const [pl, flow, closings] = await Promise.all([profitAndLoss(ctx.scope, range), cashFlow(ctx.scope, range), listClosings(ctx.scope)]);
  const input = "h-10 rounded-md border border-line bg-surface px-3 text-sm";
  const row = (label: string, v: number, strong = false, sign = 1) => <div className={`flex justify-between py-2 ${strong ? "border-t border-line text-base font-bold" : "text-sm"}`}><dt>{label}</dt><dd className="tabular-nums"><bdi dir="ltr">{sign < 0 && v ? "− " : ""}{formatMoney(Math.abs(v))}</bdi></dd></div>;
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الأرباح والتدفق النقدي</h1><p className="text-muted">الربح = المبيعات المسلّمة − تكلفة البضاعة − الخصومات − التوصيل الضايع − المصاريف.</p></div>
      <form className="flex flex-wrap items-end gap-2"><input type="date" name="from" defaultValue={msToDateInput(range.from)} aria-label="من" dir="ltr" className={input} /><input type="date" name="to" defaultValue={msToDateInput(range.to)} aria-label="إلى" dir="ltr" className={input} /><button className="h-10 rounded-md bg-fg px-4 text-sm font-semibold text-bg">تطبيق</button></form>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="الأرباح والخسائر" description={pl.coverage !== null && pl.coverage < 1 ? `تكلفة ${Math.round(pl.coverage * 100)}% من المنتجات المباعة فقط معروفة` : undefined} />
          <CardBody><dl className="divide-y divide-line">
            {row("المبيعات (المسلّمة)", pl.revenue)}{row("تكلفة البضاعة", pl.cogs, false, -1)}{row("الخصومات", pl.discounts, false, -1)}{row("تكلفة التوصيل الضايعة", pl.shippingLoss, false, -1)}{row("المصاريف", pl.expenses, false, -1)}
            <div className={`flex justify-between border-t-2 border-fg pt-3 text-lg font-extrabold ${pl.net < 0 ? "text-danger-fg" : "text-success-fg"}`}><dt>صافي الربح</dt><dd className="tabular-nums"><bdi dir="ltr">{pl.net < 0 ? "−" : ""}{formatMoney(Math.abs(pl.net))}</bdi></dd></div>
          </dl></CardBody>
        </Card>
        <Card>
          <CardHeader title="التدفق النقدي لكل حساب" />
          <CardBody><table className="w-full text-sm"><thead className="text-muted"><tr>{["الحساب", "دخل", "خرج", "الصافي"].map((h) => <th key={h} className="py-1 text-start font-medium">{h}</th>)}</tr></thead><tbody className="divide-y divide-line">
            {flow.map((f) => <tr key={f.accountId}><td className="py-2 font-medium">{f.name}</td><td className="tabular-nums text-success-fg">{formatMoney(f.inflow)}</td><td className="tabular-nums text-danger-fg">{formatMoney(f.outflow)}</td><td className="font-bold tabular-nums"><bdi dir="ltr">{f.net < 0 ? "−" : ""}{formatMoney(Math.abs(f.net))}</bdi></td></tr>)}
          </tbody></table></CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="فروقات الإقفال" description="الرصيد المتوقع مقابل الفعلي عند إقفال الخزنة." />
        <CardBody>
          {closings.length === 0 ? <p className="text-sm text-muted">ما فيه إقفالات. اقفل الخزنة من صفحة «الحسابات».</p> : (
            <ul className="divide-y divide-line">{closings.map((c) => <li key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm"><span className="text-xs text-muted">{formatDateTime(c.at)}</span><b>{c.account}</b><span className="text-muted">متوقع {formatMoney(c.expected)} · فعلي {formatMoney(c.actual)}</span><span className="flex-1" /><b className={`tabular-nums ${c.difference === 0 ? "text-success-fg" : "text-danger-fg"}`}><bdi dir="ltr">{c.difference > 0 ? "+" : c.difference < 0 ? "−" : ""}{formatMoney(Math.abs(c.difference))}</bdi></b></li>)}</ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
