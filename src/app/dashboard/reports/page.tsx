import type { Metadata } from "next";
import Link from "next/link";
import { Download, Lock } from "lucide-react";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { msToDateInput } from "@/lib/date-input";
import { formatDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/constants";
import { getReport, parseRange, ReportError, type Report } from "@/server/reports";
import { TZ_OFFSET_MS, startOfDay } from "@/server/orders/stats";
import { requireStoreContext } from "@/server/store-context";

export const metadata: Metadata = { title: "التقارير" };

const DAY = 86_400_000;
const PAY: Record<string, string> = { cod: "عند الاستلام", bank_transfer: "تحويل مصرفي", gateway: "بوابة دفع" };

function presets(now = Date.now()) {
  const today = startOfDay(now);
  const d = (ms: number) => msToDateInput(ms);
  const monthStart = (shift: number) => { const x = new Date(today + TZ_OFFSET_MS); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + shift, 1) - TZ_OFFSET_MS; };
  return [
    { label: "آخر 7 أيام", from: d(today - 6 * DAY), to: d(today) },
    { label: "آخر 30 يوم", from: d(today - 29 * DAY), to: d(today) },
    { label: "هذا الشهر", from: d(monthStart(0)), to: d(today) },
    { label: "الشهر الماضي", from: d(monthStart(-1)), to: d(monthStart(0) - DAY) },
  ];
}

/** للفترات الطويلة نجمّع الأيام في أسابيع علشان الرسم يبقى مقروء */
function chartData(daily: Report["daily"]) {
  if (daily.length <= 31) return daily;
  const out: Report["daily"] = [];
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7);
    out.push({ dayStart: chunk[0]!.dayStart, total: chunk.reduce((s, x) => s + x.total, 0), orders: chunk.reduce((s, x) => s + x.orders, 0) });
  }
  return out.slice(-12);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStoreContext("reports");

  if (!ctx.limits.reports) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl">التقارير</h1>
        <Card className="border-gold"><CardBody className="flex items-start gap-3"><Lock className="mt-0.5 size-5 shrink-0" aria-hidden /><div><p className="font-semibold">التقارير متاحة من الباقات الأعلى</p><p className="text-sm text-muted">تقارير المبيعات وأكثر المنتجات مبيعاً والمرتجعات والأرباح مع تصدير Excel.</p></div></CardBody></Card>
      </div>
    );
  }

  const range = parseRange(sp.from, sp.to);
  const ps = presets();
  let report: Report | null = null;
  let error: string | null = range ? null : "الفترة غير صحيحة. اختار تاريخين (الحد الأقصى سنة) والبداية قبل النهاية.";
  if (range) {
    try { report = await getReport(ctx.scope, range); } catch (e) { if (e instanceof ReportError) error = e.message; else throw e; }
  }
  const from = range ? msToDateInput(range.from) : sp.from ?? "";
  const to = range ? msToDateInput(range.to) : sp.to ?? "";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl">التقارير</h1>{range && <p className="text-muted">{formatDate(range.from)} — {formatDate(range.to)}</p>}</div>
        {range && !error && <a href={`/dashboard/reports/export?from=${from}&to=${to}`} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-fg px-3 text-sm font-semibold text-bg hover:opacity-90"><Download className="size-4" aria-hidden /> تصدير Excel</a>}
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
        <nav aria-label="الفترة" className="flex flex-wrap gap-2">
          {ps.map((p) => <Link key={p.label} href={`?from=${p.from}&to=${p.to}`} className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium", p.from === from && p.to === to ? "border-gold bg-gold/20" : "border-line text-muted hover:text-fg")}>{p.label}</Link>)}
        </nav>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <Input name="from" type="date" label="من" defaultValue={from} required />
          <Input name="to" type="date" label="إلى" defaultValue={to} required />
          <Button type="submit" variant="outline">عرض</Button>
        </form>
      </div>

      {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">{error}</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="إجمالي المبيعات" value={formatMoney(report.sales.total)} hint={`${report.sales.orders} طلبية`} />
            <Kpi label="متوسط الطلبية" value={formatMoney(report.sales.average)} />
            <Kpi label="مبيعات تم توصيلها" value={formatMoney(report.sales.deliveredTotal)} hint={`${report.sales.deliveredOrders} طلبية`} />
            <Kpi label="الخصومات" value={formatMoney(report.sales.discounts)} />
          </div>

          <Card>
            <CardHeader title="المبيعات" description={report.daily.length > 31 ? "تجميع أسبوعي (آخر 12 أسبوع)" : "يومياً"} />
            <CardBody><SalesChart data={chartData(report.daily)} /></CardBody>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="أكثر المنتجات مبيعاً" />
              {report.topProducts.length === 0 ? <Empty /> : (
                <ol className="divide-y divide-line">
                  {report.topProducts.map((p, i) => <li key={p.productId} className="flex items-center gap-3 px-5 py-3 text-sm"><span className="w-5 text-muted">{i + 1}</span><span className="min-w-0 flex-1 truncate font-medium">{p.name}</span><span className="text-muted">{p.quantity} قطعة</span><span className="font-bold">{formatMoney(p.revenue)}</span></li>)}
                </ol>
              )}
            </Card>
            <Card>
              <CardHeader title="حالات الطلبيات" />
              <ul className="divide-y divide-line">
                {ORDER_STATUSES.map((s) => <li key={s} className="flex justify-between px-5 py-3 text-sm"><span>{ORDER_STATUS_LABELS[s]}</span><b>{report.byStatus[s] ?? 0}</b></li>)}
              </ul>
            </Card>
            <Card>
              <CardHeader title="أعلى المدن" />
              {report.byCity.length === 0 ? <Empty /> : <ul className="divide-y divide-line">{report.byCity.map((c) => <li key={c.city} className="flex justify-between px-5 py-3 text-sm"><span>{c.city} <span className="text-muted">· {c.orders} طلبية</span></span><b>{formatMoney(c.total)}</b></li>)}</ul>}
            </Card>
            <Card>
              <CardHeader title="طرق الدفع" />
              {report.byPayment.length === 0 ? <Empty /> : <ul className="divide-y divide-line">{report.byPayment.map((c) => <li key={c.method} className="flex justify-between px-5 py-3 text-sm"><span>{PAY[c.method] ?? c.method} <span className="text-muted">· {c.orders} طلبية</span></span><b>{formatMoney(c.total)}</b></li>)}</ul>}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="المرتجعات" description="حسب تاريخ تسجيل المرتجع" />
              <CardBody className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div><p className="text-muted">العدد</p><p className="text-xl font-bold">{report.returns.count}</p></div>
                  <div><p className="text-muted">قيمتها</p><p className="text-xl font-bold">{formatMoney(report.returns.refundValue)}</p></div>
                  <div><p className="text-muted">توصيل ضايع</p><p className="text-xl font-bold">{formatMoney(report.returns.shippingLoss)}</p></div>
                </div>
                {report.returns.byReason.length > 0 && <ul className="divide-y divide-line border-t border-line">{report.returns.byReason.map((r) => <li key={r.reason} className="flex justify-between py-2"><span>{r.label}</span><b>{r.count}</b></li>)}</ul>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="الأرباح" description="للطلبيات المسلّمة بس، حسب سعر التكلفة المدخل" />
              <CardBody className="space-y-2 text-sm">
                <Line label="إيراد المنتجات (اللي لها تكلفة)" value={formatMoney(report.profit.revenue)} />
                <Line label="تكلفة البضاعة" value={`− ${formatMoney(report.profit.cost)}`} />
                <Line label="الربح الإجمالي" value={formatMoney(report.profit.gross)} bold />
                <Line label="الخصومات" value={`− ${formatMoney(report.profit.discounts)}`} />
                <Line label="توصيل ضايع في المرتجعات" value={`− ${formatMoney(report.profit.shippingLoss)}`} />
                <Line label="صافي الربح" value={formatMoney(report.profit.net)} bold />
                {report.profit.coverage === null ? <p className="pt-2 text-muted">ما فيش طلبيات مسلّمة في هذه الفترة.</p> : report.profit.coverage < 1 && (
                  <p className="rounded-md bg-gold/20 px-3 py-2">{Math.round(report.profit.coverage * 100)}% بس من البنود المسلّمة لها سعر تكلفة. أدخل التكلفة في المنتجات علشان الأرباح تكون دقيقة.</p>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

const Kpi = ({ label, value, hint }: { label: string; value: string; hint?: string }) => <Card className="p-4"><p className="text-sm text-muted">{label}</p><p className="mt-1 text-xl font-bold">{value}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</Card>;
const Line = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => <div className={cn("flex justify-between", bold && "border-t border-line pt-2 text-base font-bold")}><span className={bold ? "" : "text-muted"}>{label}</span><span>{value}</span></div>;
const Empty = () => <CardBody className="text-center text-sm text-muted">ما فيش بيانات في هذه الفترة.</CardBody>;
