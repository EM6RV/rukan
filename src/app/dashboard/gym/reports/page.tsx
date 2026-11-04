import type { Metadata } from "next";
import { Download } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { msToDateInput } from "@/lib/date-input";
import { formatDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { gymReport } from "@/server/gym/reports";
import { parseRange } from "@/server/reports";
import { requireLineContext } from "@/server/store-context";

export const metadata: Metadata = { title: "تقارير النادي" };
const m = (n: number) => formatMoney(n);
const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export default async function GymReports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const ctx = await requireLineContext("gym", "reports");
  const sp = await searchParams;
  const range = parseRange(sp.from, sp.to) ?? parseRange(undefined, undefined)!;
  const r = await gymReport(ctx.scope, range);
  const from = msToDateInput(range.from), to = msToDateInput(range.to);
  const maxH = Math.max(1, ...r.attendance.byHour);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl">تقارير النادي</h1><p className="text-muted">العضويات والتجديد والإيراد والحضور وعمولات المدربين.</p></div>
        <form className="flex flex-wrap items-end gap-2" method="get">
          <label className="text-sm">من<input type="date" name="from" defaultValue={from} className="ms-1 h-10 rounded-md border border-line bg-surface px-2" /></label>
          <label className="text-sm">إلى<input type="date" name="to" defaultValue={to} className="ms-1 h-10 rounded-md border border-line bg-surface px-2" /></label>
          <button type="submit" className="h-10 rounded-md border border-line px-3 text-sm">عرض</button>
          <a href={`/dashboard/gym/reports/export?from=${from}&to=${to}`} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-gold px-3 text-sm font-semibold text-navy"><Download className="size-4" aria-hidden /> Excel</a>
        </form>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[["الأعضاء النشطين", String(r.members.active)], ["أعضاء جدد", String(r.members.new)], ["نسبة التجديد", r.members.renewalRate === null ? "—" : `${Math.round(r.members.renewalRate * 100)}%`], ["إيراد الاشتراكات", m(r.revenue.memberships)], ["أقساط متأخرة", `${m(r.revenue.installmentsLate)} (${r.revenue.lateCount})`]].map(([l, v]) => <Card key={l} className="p-4"><p className="text-sm text-muted">{l}</p><p className="mt-1 text-xl font-bold tabular-nums">{v}</p></Card>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="الإيراد" /><ul className="divide-y divide-line text-sm">{[["اشتراكات", r.revenue.memberships], ["حصص PT", r.revenue.ptPacks], ["مبيعات الكاشير", r.revenue.sales], ["مرتجعات", -r.revenue.refunds], ["أقساط قادمة", r.revenue.installmentsDue]].map(([l, v]) => <li key={l as string} className="flex justify-between px-5 py-2.5"><span>{l}</span><b className="tabular-nums">{m(v as number)}</b></li>)}</ul></Card>
        <Card><CardHeader title="حسب نوع الاشتراك" /><ul className="divide-y divide-line text-sm">{r.byPlan.map((p) => <li key={p.plan} className="flex justify-between px-5 py-2.5"><span>{p.plan} · {p.count}</span><b className="tabular-nums">{m(p.revenue)}</b></li>)}{r.byPlan.length === 0 && <li className="px-5 py-3 text-muted">ما فيش.</li>}</ul></Card>
        <Card><CardHeader title="الحضور" description={`${r.attendance.total} دخول · ${r.attendance.uniqueMembers} عضو`} />
          <div className="flex h-28 items-end gap-0.5 px-5 pb-2" role="img" aria-label="الحضور حسب الساعة">{r.attendance.byHour.map((v, h) => <div key={h} className="flex-1 rounded-t bg-teal" style={{ height: `${(v / maxH) * 100}%`, minHeight: v ? 2 : 0 }} title={`${h}:00 — ${v}`} />)}</div>
          <p className="px-5 pb-4 text-xs text-muted">{DAYS.map((d, i) => `${d} ${r.attendance.byDay[i]}`).join(" · ")}</p></Card>
        <Card><CardHeader title="الحصص" /><ul className="divide-y divide-line text-sm">{r.classes.map((c) => <li key={c.id} className="flex justify-between px-5 py-2.5"><span>{c.name}{c.trainer ? ` · ${c.trainer}` : ""}</span><span className="tabular-nums text-muted">حجز {c.booked} · حضر {c.attended} · غاب {c.noShow}</span></li>)}{r.classes.length === 0 && <li className="px-5 py-3 text-muted">ما فيش.</li>}</ul></Card>
        <Card><CardHeader title="عمولات المدربين" /><ul className="divide-y divide-line text-sm">{r.trainers.map((x) => <li key={x.trainerId} className="flex justify-between px-5 py-2.5"><span>{x.name} · {x.sessions} حصة</span><b className="tabular-nums">{m(x.commission)}</b></li>)}{r.trainers.length === 0 && <li className="px-5 py-3 text-muted">ما فيش.</li>}</ul></Card>
        <Card><CardHeader title="للمتابعة: ما جددوش" description="اللي انتهى اشتراكهم وما رجعوش." /><ul className="max-h-72 divide-y divide-line overflow-y-auto text-sm">{r.lostFollow.map((x) => <li key={x.id} className="flex justify-between px-5 py-2"><a href={`/dashboard/gym/members/${x.id}`} className="text-link-strong hover:underline">{x.name}</a><span className="text-muted">{formatDate(x.endedAt)}</span></li>)}{r.lostFollow.length === 0 && <li className="px-5 py-3 text-muted">ما فيش.</li>}</ul></Card>
      </div>
    </div>
  );
}
