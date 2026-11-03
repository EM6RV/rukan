// تقارير الصالة: الإشغال والإيراد لكل جهاز ونوع، الجلسات مقابل البار، الذروة، أكثر اللاعبين، الماتشات في اليوم، الصيانة، وExcel.
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import writeExcelFile from "write-excel-file/node";
import { STATION_KIND_LABELS } from "@/lib/line-setup";
import { libyaClock } from "@/lib/promotions";
import { t, type StoreScope } from "../tenant";

const DAY = 86_400_000, LIBYA = 2 * 3_600_000;
const dayKey = (ms: number) => new Date(ms + LIBYA).toISOString().slice(0, 10);
const dayStart = (ms: number) => Math.floor((ms + LIBYA) / DAY) * DAY - LIBYA;

/** إيراد الصالة اليوم (فواتير منظومة الصالة) */
export async function loungeToday(scope: StoreScope, now = Date.now()) {
  const sales = await scope.from(t.sales, and(eq(t.sales.line, "lounge"), gte(t.sales.soldAt, new Date(dayStart(now))))!);
  return { revenue: sales.reduce((s, x) => s + x.total, 0), invoices: sales.length };
}

export async function loungeReport(scope: StoreScope, range: { from: number; to: number }) {
  const [sessions, stations, sales, maint, customers] = await Promise.all([
    scope.from(t.loungeSessions, and(gte(t.loungeSessions.startedAt, new Date(range.from)), lte(t.loungeSessions.startedAt, new Date(range.to)))!),
    scope.from(t.stations),
    scope.from(t.sales, and(eq(t.sales.line, "lounge"), gte(t.sales.soldAt, new Date(range.from)), lte(t.sales.soldAt, new Date(range.to)))!),
    scope.from(t.stationMaintenance, and(gte(t.stationMaintenance.openedAt, new Date(range.from)), lte(t.stationMaintenance.openedAt, new Date(range.to)))!),
    scope.from(t.customers),
  ]);
  const paid = sessions.filter((s) => s.status === "paid" || s.status === "ended");
  const items = sales.length ? await scope.from(t.saleItems, inArray(t.saleItems.saleId, sales.map((s) => s.id))) : [];
  const sessionRevenue = items.filter((i) => i.kind === "service" && paid.some((s) => s.id === i.refId)).reduce((a, i) => a + i.total, 0);
  const packRevenue = items.filter((i) => i.kind === "service" && !paid.some((s) => s.id === i.refId)).reduce((a, i) => a + i.total, 0);
  const barRevenue = items.filter((i) => i.kind !== "service").reduce((a, i) => a + i.total, 0);
  const rangeMinutes = Math.max(1, (Math.min(range.to, Date.now()) - range.from) / 60_000);
  const byStation = stations.map((st) => {
    const mine = paid.filter((s) => s.stationId === st.id);
    const minutes = mine.reduce((a, s) => a + s.minutes, 0);
    return { id: st.id, name: st.name, kind: STATION_KIND_LABELS[st.kind], sessions: mine.length, minutes, revenue: mine.reduce((a, s) => a + s.charge, 0), occupancy: Math.min(1, minutes / rangeMinutes) };
  }).sort((a, b) => b.revenue - a.revenue);
  const byKind = new Map<string, { kind: string; revenue: number; minutes: number; sessions: number }>();
  for (const s of byStation) { const k = byKind.get(s.kind) ?? { kind: s.kind, revenue: 0, minutes: 0, sessions: 0 }; k.revenue += s.revenue; k.minutes += s.minutes; k.sessions += s.sessions; byKind.set(s.kind, k); }
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const s of paid) { const c = libyaClock(s.startedAt.getTime()); heat[c.day]![Math.floor(c.minute / 60)]! += 1; }
  const players = new Map<string, { name: string; sessions: number; minutes: number; spent: number }>();
  for (const s of paid) {
    if (!s.customerId) continue;
    const c = customers.find((x) => x.id === s.customerId);
    const p = players.get(s.customerId) ?? { name: c?.name ?? "؟", sessions: 0, minutes: 0, spent: 0 };
    p.sessions++; p.minutes += s.minutes; p.spent += s.charge; players.set(s.customerId, p);
  }
  const matchesByDay = new Map<string, number>();
  for (const s of paid) if (s.matches) matchesByDay.set(dayKey(s.startedAt.getTime()), (matchesByDay.get(dayKey(s.startedAt.getTime())) ?? 0) + s.matches);
  return {
    totals: { sessions: paid.length, minutes: paid.reduce((a, s) => a + s.minutes, 0), sessionRevenue, barRevenue, packRevenue, cancelled: sessions.filter((s) => s.status === "cancelled").length, maintenanceCost: maint.reduce((a, m) => a + m.cost, 0) },
    byStation, byKind: [...byKind.values()].sort((a, b) => b.revenue - a.revenue), heat,
    topPlayers: [...players.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 15),
    matchesByDay: [...matchesByDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, matches]) => ({ day, matches })),
    maintenance: maint.map((m) => ({ station: stations.find((s) => s.id === m.stationId)?.name ?? "؟", issue: m.issue, cost: m.cost, status: m.status, at: m.openedAt.getTime() })),
  };
}
export type LoungeReport = Awaited<ReturnType<typeof loungeReport>>;

const money = (v: number) => ({ value: v / 1000, format: "#,##0.000" });
const h = (v: string) => ({ value: v, fontWeight: "bold" as const, backgroundColor: "#0D263E", color: "#FFFFFF" });
export async function loungeWorkbook(scope: StoreScope, range: { from: number; to: number }): Promise<Buffer> {
  const r = await loungeReport(scope, range);
  const sheets = [
    { name: "ملخص", rows: [[h("المؤشر"), h("القيمة")], ["الجلسات", r.totals.sessions], ["الدقايق", r.totals.minutes], ["إيراد الجلسات (د.ل)", money(r.totals.sessionRevenue)], ["إيراد البار (د.ل)", money(r.totals.barRevenue)], ["باقات الساعات (د.ل)", money(r.totals.packRevenue)], ["تكلفة الصيانة (د.ل)", money(r.totals.maintenanceCost)]] },
    { name: "الأجهزة", rows: [[h("الجهاز"), h("النوع"), h("الجلسات"), h("الدقايق"), h("الإشغال %"), h("الإيراد (د.ل)")], ...r.byStation.map((s) => [s.name, s.kind, s.sessions, s.minutes, Math.round(s.occupancy * 100), money(s.revenue)])] },
    { name: "اللاعبين", rows: [[h("اللاعب"), h("الجلسات"), h("الدقايق"), h("الصرف (د.ل)")], ...r.topPlayers.map((p) => [p.name, p.sessions, p.minutes, money(p.spent)])] },
    { name: "الصيانة", rows: [[h("الجهاز"), h("العطل"), h("التكلفة (د.ل)")], ...r.maintenance.map((m) => [m.station, m.issue, money(m.cost)])] },
  ];
  return writeExcelFile(sheets.map((s) => ({ data: s.rows, sheet: s.name, rightToLeft: true, stickyRowsCount: 1, columns: s.rows[0]!.map((_, i) => ({ width: i === 0 ? 26 : 14 })) })) as never).toBuffer() as Promise<Buffer>;
}
