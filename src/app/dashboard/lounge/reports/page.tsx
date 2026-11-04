import type { Metadata } from "next";
import { Download } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { msToDateInput } from "@/lib/date-input";
import { formatDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { canUse } from "@/lib/entitlements";
import { loungeReport } from "@/server/lounge/reports";
import { parseRange } from "@/server/reports";
import { requireLineContext } from "@/server/store-context";
import { Heatmap } from "../../market/reports/heatmap";

export const metadata: Metadata = { title: "تقارير الصالة" };
const m = (n: number) => formatMoney(n);

export default async function LoungeReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requireLineContext("lounge", "reports");
  const sp = await searchParams;
  const range = parseRange(sp.from, sp.to) ?? parseRange(undefined, undefined)!;
  const r = await loungeReport(ctx.scope, range);
  const adv = canUse(ctx.lines.lounge.limits ?? {}, "advancedReports");
  const from = msToDateInput(range.from), to = msToDateInput(range.to);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl">تقارير الصالة</h1><p className="text-muted">الإشغال والإيراد لكل جهاز ونوع، الجلسات مقابل البار، واللاعبين والصيانة.</p></div>
        <form className="flex flex-wrap items-end gap-2" method="get">
          <label className="text-sm">من<input type="date" name="from" defaultValue={from} className="ms-1 h-10 rounded-md border border-line bg-surface px-2" /></label>
          <label className="text-sm">إلى<input type="date" name="to" defaultValue={to} className="ms-1 h-10 rounded-md border border-line bg-surface px-2" /></label>
          <button type="submit" className="h-10 rounded-md border border-line px-3 text-sm">عرض</button>
          <a href={`/dashboard/lounge/reports/export?from=${from}&to=${to}`} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-gold px-3 text-sm font-semibold text-navy"><Download className="size-4" aria-hidden /> Excel</a>
        </form>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[["الجلسات", String(r.totals.sessions)], ["ساعات اللعب", (r.totals.minutes / 60).toFixed(1)], ["إيراد الجلسات", m(r.totals.sessionRevenue)], ["إيراد البار", m(r.totals.barRevenue)], ["تكلفة الصيانة", m(r.totals.maintenanceCost)]].map(([l, v]) => <Card key={l} className="p-4"><p className="text-sm text-muted">{l}</p><p className="mt-1 text-xl font-bold tabular-nums">{v}</p></Card>)}
      </div>
      <Card>
        <CardHeader title="الأجهزة" description="الإشغال = دقايق اللعب من دقايق الفترة." />
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="جدول الأجهزة"><table className="w-full min-w-[520px] text-sm"><thead className="bg-surface-2 text-muted"><tr>{["الجهاز", "النوع", "الجلسات", "الساعات", "الإشغال", "الإيراد"].map((h) => <th key={h} className="p-2.5 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{r.byStation.map((s) => <tr key={s.id}><td className="p-2.5">{s.name}</td><td className="p-2.5">{s.kind}</td><td className="p-2.5 tabular-nums">{s.sessions}</td><td className="p-2.5 tabular-nums">{(s.minutes / 60).toFixed(1)}</td><td className="p-2.5 tabular-nums">{Math.round(s.occupancy * 100)}%</td><td className="p-2.5 tabular-nums">{m(s.revenue)}</td></tr>)}</tbody></table></div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="حسب النوع" /><ul className="divide-y divide-line text-sm">{r.byKind.map((k) => <li key={k.kind} className="flex justify-between px-5 py-2.5"><span>{k.kind} · {k.sessions} جلسة</span><b className="tabular-nums">{m(k.revenue)}</b></li>)}</ul></Card>
        <Card><CardHeader title="أكثر اللاعبين حضوراً" />{r.topPlayers.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">اربط الجلسات بزبون باش يطلعوا هنا.</p> : <ul className="divide-y divide-line text-sm">{r.topPlayers.map((p) => <li key={p.name} className="flex justify-between px-5 py-2.5"><span>{p.name} · {p.sessions} جلسة</span><b className="tabular-nums">{m(p.spent)}</b></li>)}</ul>}</Card>
        {adv && <Card><CardHeader title="ساعات الذروة" description="عدد الجلسات حسب اليوم والساعة." /><Heatmap heat={r.heat} /></Card>}
        <Card><CardHeader title="الماتشات في اليوم" />{r.matchesByDay.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">ما فيش ماتشات.</p> : <ul className="divide-y divide-line text-sm">{r.matchesByDay.map((d) => <li key={d.day} className="flex justify-between px-5 py-2"><span>{d.day}</span><b className="tabular-nums">{d.matches}</b></li>)}</ul>}</Card>
        <Card><CardHeader title="الصيانة" />{r.maintenance.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">ما فيش أعطال.</p> : <ul className="divide-y divide-line text-sm">{r.maintenance.map((x, i) => <li key={i} className="flex justify-between px-5 py-2"><span>{x.station} · {x.issue} <span className="text-muted">{formatDate(x.at)}</span></span><b className="tabular-nums">{m(x.cost)}</b></li>)}</ul>}</Card>
      </div>
    </div>
  );
}
