import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { getDb } from "@/db";
import { msToDateInput } from "@/lib/date-input";
import { formatDateTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { marketCan } from "@/server/market/access";
import { customerDebts, marketReport, memberNames } from "@/server/market/reports";
import { listWriteoffs } from "@/server/market/batches";
import { supplierDues } from "@/server/market/purchase-orders";
import { parseRange } from "@/server/reports";
import { requireLineContext } from "@/server/store-context";
import { Heatmap } from "./heatmap";

export const metadata: Metadata = { title: "تقارير الماركت" };
const m = (n: number) => formatMoney(n);
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
const qtyOf = (q: number, w: boolean) => (w ? `${(q / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 })} كغ` : String(q));

function Delta({ now, before }: { now: number; before: number }) {
  const d = pct(now, before);
  if (d === null) return <span className="text-xs text-muted">—</span>;
  return <Badge tone={d >= 0 ? "success" : "danger"}>{d >= 0 ? "+" : ""}{d}%</Badge>;
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return <p className="px-5 pb-5 text-sm text-muted">ما فيش بيانات في الفترة.</p>;
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="جدول"><table className="w-full min-w-[420px] text-sm">
      <thead className="bg-surface-2 text-muted"><tr>{head.map((h) => <th key={h} className="p-2.5 text-start font-medium">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-line">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="p-2.5 tabular-nums">{c}</td>)}</tr>)}</tbody>
    </table></div>
  );
}

export default async function MarketReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requireLineContext("market", "reports");
  const sp = await searchParams;
  const range = parseRange(sp.from, sp.to) ?? parseRange(undefined, undefined)!;
  const advanced = marketCan(ctx.lines, "advancedReports");
  const [r, debts, dues, waste] = await Promise.all([
    marketReport(ctx.scope, range, { names: await memberNames(getDb(), ctx.store.id), advanced }),
    customerDebts(ctx.scope), supplierDues(ctx.scope), listWriteoffs(ctx.scope, range),
  ]);
  const from = msToDateInput(range.from), to = msToDateInput(range.to);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl">تقارير الماركت</h1><p className="text-muted">من فواتير الكاشير. الربح بمتوسط التكلفة لحظة البيع، بعد المرتجع وخصم الفاتورة.</p></div>
        <form className="flex flex-wrap items-end gap-2" method="get">
          <label className="text-sm">من<input type="date" name="from" defaultValue={from} className="ms-1 h-10 rounded-md border border-line bg-surface px-2" /></label>
          <label className="text-sm">إلى<input type="date" name="to" defaultValue={to} className="ms-1 h-10 rounded-md border border-line bg-surface px-2" /></label>
          <button type="submit" className="h-10 rounded-md border border-line px-3 text-sm">عرض</button>
          <a href={`/dashboard/market/reports/export?from=${from}&to=${to}`} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-gold px-3 text-sm font-semibold text-navy"><Download className="size-4" aria-hidden /> Excel</a>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[["المبيعات الصافية", m(r.totals.revenue)], ["الربح الإجمالي", m(r.totals.profit)], ["الفواتير", String(r.totals.invoices)], ["متوسط الفاتورة", m(r.totals.average)], ["الهالك (تكلفة)", m(waste.total)]].map(([l, v]) => (
          <Card key={l} className="p-4"><p className="text-sm text-muted">{l}</p><p className="mt-1 text-xl font-bold tabular-nums">{v}</p></Card>
        ))}
      </div>
      {r.totals.costCoverage !== null && r.totals.costCoverage < 0.95 && <p className="rounded-xl bg-gold/15 px-4 py-3 text-sm">{Math.round((1 - r.totals.costCoverage) * 100)}% من المبيعات لأصناف بدون سعر تكلفة: الربح الحقيقي ممكن يكون أقل. سجّل التكلفة من فواتير الشراء.</p>}

      {r.advanced && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="المقارنة" description="اليوم مقابل نفس اليوم الأسبوع اللي فات، والأسبوع (من السبت) مقابل اللي قبله لنفس الوقت." />
            <ul className="divide-y divide-line text-sm">
              <li className="flex items-center justify-between px-5 py-3"><span>اليوم: <b className="tabular-nums">{m(r.advanced.compare.today.total)}</b> <span className="text-muted">({r.advanced.compare.today.count} فاتورة)</span></span><span className="flex items-center gap-2 text-muted">قبل أسبوع {m(r.advanced.compare.sameDayLastWeek.total)} <Delta now={r.advanced.compare.today.total} before={r.advanced.compare.sameDayLastWeek.total} /></span></li>
              <li className="flex items-center justify-between px-5 py-3"><span>الأسبوع: <b className="tabular-nums">{m(r.advanced.compare.thisWeek.total)}</b></span><span className="flex items-center gap-2 text-muted">اللي فات {m(r.advanced.compare.lastWeek.total)} <Delta now={r.advanced.compare.thisWeek.total} before={r.advanced.compare.lastWeek.total} /></span></li>
            </ul>
          </Card>
          <Card>
            <CardHeader title="ساعات الذروة" description="المبيعات حسب اليوم والساعة (بتوقيت ليبيا)." />
            <Heatmap heat={r.advanced.heat} />
          </Card>
        </div>
      )}
      {!advanced && <Card className="p-4 text-sm">المقارنات وخريطة ساعات الذروة والراكد في باقة «احترافي» لرُكن ماركت. <Link href="/dashboard/lines?add=market" className="text-link-strong underline">رقّي الباقة</Link></Card>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="باليوم" /><Table head={["اليوم", "الفواتير", "المبيعات", "الربح"]} rows={r.byDay.map((d) => [d.day, d.count, m(d.total), m(d.profit)])} /></Card>
        <Card><CardHeader title="بالكاشير" /><Table head={["الكاشير", "الفواتير", "المبيعات"]} rows={r.byCashier.map((c) => [c.name, c.count, m(c.total)])} /></Card>
        <Card><CardHeader title="بالوردية" /><Table head={["الوردية", "فتحها", "الفواتير", "المبيعات"]} rows={r.byShift.slice(0, 30).map((s) => [s.zNumber ? `Z${s.zNumber}` : "مفتوحة", `${s.cashier} · ${formatDateTime(s.openedAt)}`, s.count, m(s.total)])} /></Card>
        <Card><CardHeader title="بالقسم" /><Table head={["القسم", "المبيعات", "الربح"]} rows={r.byCategory.map((c) => [c.name, m(c.revenue), m(c.profit)])} /></Card>
        <Card><CardHeader title="الأكثر مبيعاً" /><Table head={["الصنف", "الكمية", "المبيعات", "الربح"]} rows={r.top.map((p) => [p.name, qtyOf(p.qty, p.isWeighed), m(p.revenue), m(p.profit)])} /></Card>
        <Card><CardHeader title="الأقل مبيعاً (من اللي اتباعوا)" /><Table head={["الصنف", "الكمية", "المبيعات"]} rows={r.bottom.map((p) => [p.name, qtyOf(p.qty, p.isWeighed), m(p.revenue)])} /></Card>
        {r.advanced && <Card><CardHeader title="الراكد" description="فيه مخزون وما اتباعش 30 يوم (بقيمة التكلفة)." /><Table head={["الصنف", "المخزون", "القيمة"]} rows={r.advanced.slow.map((s) => [s.name, qtyOf(s.stock, s.isWeighed), m(s.value)])} /></Card>}
        <Card><CardHeader title="طرق الدفع" /><Table head={["الطريقة", "المبلغ"]} rows={r.payments.map((p) => [p.label, m(p.amount)])} /></Card>
        <Card><CardHeader title="ديون الزبائن" action={<Link href="/dashboard/debts" className="text-sm text-link-strong underline">الكل</Link>} /><Table head={["الزبون", "الدين"]} rows={debts.slice(0, 15).map((d) => [d.name, m(d.debt)])} /></Card>
        <Card><CardHeader title="مستحقات الموردين" /><Table head={["المورد", "الرصيد", "متأخر"]} rows={dues.map((d) => [d.name, m(d.balance), d.overdue ? m(d.overdue) : "—"])} /></Card>
      </div>
    </div>
  );
}
