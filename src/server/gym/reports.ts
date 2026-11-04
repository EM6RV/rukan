// تقارير النادي: العضويات والتجديد، الإيرادات، الحضور، الحصص، وعمولات المدربين، وExcel.
import { and, eq, gte, lte } from "drizzle-orm";
import writeExcelFile from "write-excel-file/node";
import { libyaDay, libyaMinute, overdueInstallments } from "@/lib/gym";
import { t, type StoreScope } from "../tenant";
import { commissionReport, gymConfigOf } from "./service";

const DAY = 86_400_000;
export async function gymReport(scope: StoreScope, range: { from: number; to: number }, now = Date.now()) {
  const cfg = await gymConfigOf(scope);
  const [members, ships, inst, checks, classes, bookings, packs, sales, trainers] = await Promise.all([
    scope.from(t.gymMembers), scope.from(t.gymMemberships), scope.from(t.gymInstallments), scope.from(t.gymCheckins, and(eq(t.gymCheckins.result, "ok"), gte(t.gymCheckins.at, new Date(range.from)), lte(t.gymCheckins.at, new Date(range.to)))!),
    scope.from(t.gymClasses), scope.from(t.gymClassBookings), scope.from(t.gymPtPacks), scope.from(t.sales, and(eq(t.sales.line, "gym"), gte(t.sales.soldAt, new Date(range.from)), lte(t.sales.soldAt, new Date(range.to)))!), scope.from(t.gymTrainers),
  ]);
  const live = ships.filter((s) => s.status === "active" || s.status === "frozen");
  const activeMembers = new Set(live.filter((s) => s.endsAt.getTime() >= now && s.status !== "cancelled").map((s) => s.memberId));
  const newMembers = members.filter((m) => m.createdAt.getTime() >= range.from && m.createdAt.getTime() <= range.to);
  const endedInRange = ships.filter((s) => s.endsAt.getTime() >= range.from && s.endsAt.getTime() <= range.to && s.status !== "cancelled" && s.status !== "replaced");
  const renewed = endedInRange.filter((s) => ships.some((n) => n.memberId === s.memberId && n.id !== s.id && n.startsAt.getTime() >= s.endsAt.getTime() - 7 * DAY && n.startsAt.getTime() <= s.endsAt.getTime() + 30 * DAY && n.status !== "cancelled"));
  const notRenewed = endedInRange.filter((s) => !renewed.includes(s) && !activeMembers.has(s.memberId));
  const paid = inst.filter((i) => i.paidAt && i.paidAt.getTime() >= range.from && i.paidAt.getTime() <= range.to);
  const byPlan = new Map<string, { plan: string; count: number; revenue: number }>();
  for (const i of paid) {
    const s = ships.find((x) => x.id === i.membershipId);
    const k = s?.planName ?? "؟"; const v = byPlan.get(k) ?? { plan: k, count: 0, revenue: 0 };
    v.revenue += i.amount; if (i.note === "دفعة عند الاشتراك" || i.note === "ترقية") v.count++; byPlan.set(k, v);
  }
  const unpaid = inst.filter((i) => !i.paidAt);
  const lateList = overdueInstallments(unpaid.map((i) => ({ ...i, dueAt: i.dueAt.getTime(), paidAt: null })), now, cfg.installmentGraceDays);
  const byHour = Array.from({ length: 24 }, () => 0), byDay = Array.from({ length: 7 }, () => 0);
  for (const c of checks) { const m = libyaMinute(c.at.getTime()); byHour[Math.floor(m.minute / 60)]!++; byDay[m.day]!++; }
  const classStats = classes.map((c) => {
    const mine = bookings.filter((b) => b.classId === c.id && b.day >= libyaDay(range.from) && b.day <= libyaDay(range.to));
    return { id: c.id, name: c.name, trainer: trainers.find((x) => x.id === c.trainerId)?.name ?? null, booked: mine.filter((b) => b.status !== "cancelled" && b.status !== "waitlist").length, attended: mine.filter((b) => b.status === "attended").length, noShow: mine.filter((b) => b.status === "no_show").length };
  }).sort((a, b) => b.booked - a.booked);
  const lostFollow = members.filter((m) => m.status === "active" && !activeMembers.has(m.id)).map((m) => ({ id: m.id, name: m.name, phone: m.phone, endedAt: Math.max(0, ...ships.filter((s) => s.memberId === m.id).map((s) => s.endsAt.getTime())) })).filter((m) => m.endedAt > 0).sort((a, b) => b.endedAt - a.endedAt).slice(0, 50);
  return {
    members: { active: activeMembers.size, new: newMembers.length, ended: endedInRange.length, renewalRate: endedInRange.length ? renewed.length / endedInRange.length : null, notRenewed: notRenewed.length },
    revenue: { memberships: paid.filter((i) => i.amount > 0).reduce((a, i) => a + i.amount, 0), refunds: -paid.filter((i) => i.amount < 0).reduce((a, i) => a + i.amount, 0), ptPacks: packs.filter((p) => p.createdAt.getTime() >= range.from && p.createdAt.getTime() <= range.to).reduce((a, p) => a + p.price, 0), sales: sales.reduce((a, s) => a + s.total, 0),
      installmentsDue: unpaid.reduce((a, i) => a + i.amount, 0), installmentsLate: lateList.reduce((a, i) => a + i.amount, 0), lateCount: lateList.length },
    byPlan: [...byPlan.values()].sort((a, b) => b.revenue - a.revenue),
    attendance: { total: checks.length, byHour, byDay, uniqueMembers: new Set(checks.map((c) => c.memberId)).size },
    classes: classStats, trainers: await commissionReport(scope, range), lostFollow,
  };
}
export type GymReport = Awaited<ReturnType<typeof gymReport>>;

const money = (v: number) => ({ value: v / 1000, format: "#,##0.000" });
const h = (v: string) => ({ value: v, fontWeight: "bold" as const, backgroundColor: "#0D263E", color: "#FFFFFF" });
export async function gymWorkbook(scope: StoreScope, range: { from: number; to: number }): Promise<Buffer> {
  const r = await gymReport(scope, range);
  const sheets = [
    { name: "ملخص", rows: [[h("المؤشر"), h("القيمة")], ["الأعضاء النشطين", r.members.active], ["أعضاء جدد", r.members.new], ["نسبة التجديد %", r.members.renewalRate === null ? "—" : Math.round(r.members.renewalRate * 100)], ["إيراد الاشتراكات (د.ل)", money(r.revenue.memberships)], ["حصص خاصة (د.ل)", money(r.revenue.ptPacks)], ["مبيعات (د.ل)", money(r.revenue.sales)], ["أقساط مستحقة (د.ل)", money(r.revenue.installmentsDue)], ["أقساط متأخرة (د.ل)", money(r.revenue.installmentsLate)], ["مرات الدخول", r.attendance.total]] },
    { name: "حسب الاشتراك", rows: [[h("الاشتراك"), h("العدد"), h("الإيراد (د.ل)")], ...r.byPlan.map((p) => [p.plan, p.count, money(p.revenue)])] },
    { name: "الحصص", rows: [[h("الحصة"), h("المدرب"), h("الحجوزات"), h("حضروا"), h("غابوا")], ...r.classes.map((c) => [c.name, c.trainer ?? "—", c.booked, c.attended, c.noShow])] },
    { name: "عمولات المدربين", rows: [[h("المدرب"), h("الحصص"), h("العمولة (د.ل)")], ...r.trainers.map((x) => [x.name, x.sessions, money(x.commission)])] },
    { name: "متابعة (ما جددوش)", rows: [[h("العضو"), h("الهاتف")], ...r.lostFollow.map((m) => [m.name, m.phone])] },
  ];
  return writeExcelFile(sheets.map((s) => ({ data: s.rows, sheet: s.name, rightToLeft: true, stickyRowsCount: 1, columns: s.rows[0]!.map((_, i) => ({ width: i === 0 ? 26 : 16 })) })) as never).toBuffer() as Promise<Buffer>;
}
