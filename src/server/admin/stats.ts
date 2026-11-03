import { cycleMonths, planPrice } from "@/lib/billing";
import { eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { lineSubscriptions, plans, stores, subscriptionPayments, users } from "@/db/schema/platform";
import { LINE_INFO, PRODUCT_LINES, type ProductLine } from "@/lib/product-lines";
import { computeLineState, type LineState } from "../line-access";
import { monthKey } from "@/lib/billing";
import { computeStoreAccess } from "../store-access";
import { platformOrderTotals } from "../tenant";
import { listExpiring } from "./subscriptions";

const DAY = 86_400_000;
const RANK: Record<string, number> = { active: 4, trial: 3, expired: 2, suspended: 1 };

export type LineStats = { line: ProductLine; total: number; byState: Record<LineState, number>; mrr: number; converted: number; trials: number; revenueThisMonth: number };

export async function getPlatformStats(db: Db, now = Date.now()) {
  const rows = await db.select({ s: stores, ownerName: users.name }).from(stores).innerJoin(users, eq(users.id, stores.ownerUserId));
  const subs = await db.select({ sub: lineSubscriptions, plan: plans }).from(lineSubscriptions).leftJoin(plans, eq(plans.id, lineSubscriptions.planId));
  const paidLines = new Set((await db.selectDistinct({ storeId: subscriptionPayments.storeId, line: subscriptionPayments.line }).from(subscriptionPayments)).map((p) => `${p.storeId}:${p.line}`));
  const byState = { trial: 0, active: 0, expired: 0, suspended: 0 };
  let mrr = 0, newWeek = 0, newMonth = 0, unfinished = 0;
  const byPlan = new Map<string, { name: string; count: number }>();
  const perLine = new Map<ProductLine, LineStats>(PRODUCT_LINES.map((l) => [l, { line: l, total: 0, byState: { trial: 0, active: 0, expired: 0, suspended: 0 }, mrr: 0, converted: 0, trials: 0, revenueThisMonth: 0 }]));
  const onboarded = new Set(rows.filter((r) => r.s.onboardedAt).map((r) => r.s.id));
  for (const r of rows) {
    if (!r.s.onboardedAt) { unfinished++; continue; }
    // حالة النشاط: المتجر لو مشترك فيه، وإلا أحسن منظومة (نشاط قديم بدون سطور: أعمدة stores)
    const mine = subs.filter((x) => x.sub.storeId === r.s.id).map((x) => ({ line: x.sub.line, ...computeLineState(x.sub, now) }));
    const pick = mine.find((m) => m.line === "store") ?? mine.sort((a, b) => (RANK[b.state] ?? 0) - (RANK[a.state] ?? 0))[0];
    byState[(pick?.state ?? computeStoreAccess(r.s, now).state) as keyof typeof byState]++;
    if (r.s.createdAt.getTime() >= now - 7 * DAY) newWeek++;
    if (r.s.createdAt.getTime() >= now - 30 * DAY) newMonth++;
  }
  for (const { sub, plan } of subs) {
    if (!onboarded.has(sub.storeId)) continue;
    const st = computeLineState(sub, now).state as LineState;
    const L = perLine.get(sub.line)!;
    L.total++; L.byState[st]++;
    if (st === "trial") L.trials++;
    if (paidLines.has(`${sub.storeId}:${sub.line}`)) L.converted++;
    if (st === "active" && plan) {
      // الإيراد الشهري المتكرر: سعر مدة الاشتراك ÷ عدد شهورها
      const m = Math.round((planPrice(plan, sub.billingCycle) ?? 0) / cycleMonths(sub.billingCycle));
      mrr += m; L.mrr += m;
      const p = byPlan.get(plan.id) ?? { name: sub.line === "store" ? plan.nameAr : `${LINE_INFO[sub.line].brand} · ${plan.nameAr}`, count: 0 };
      p.count++; byPlan.set(plan.id, p);
    }
  }

  // إيرادات آخر 6 شهور (حسب تاريخ تسجيل الدفعة، بتوقيت ليبيا)
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(now + 2 * 3_600_000); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); months.push(d.toISOString().slice(0, 7)); }
  const since = Date.parse(`${months[0]}-01T00:00:00Z`) - 2 * 3_600_000;
  const pays = await db.select({ amount: subscriptionPayments.amount, line: subscriptionPayments.line, createdAt: subscriptionPayments.createdAt }).from(subscriptionPayments).where(gte(subscriptionPayments.createdAt, new Date(since)));
  const revenue = months.map((m) => ({ month: m, total: pays.filter((p) => monthKey(p.createdAt.getTime()) === m).reduce((s, p) => s + p.amount, 0), payments: pays.filter((p) => monthKey(p.createdAt.getTime()) === m).length }));
  for (const p of pays) if (monthKey(p.createdAt.getTime()) === months.at(-1)) perLine.get(p.line)!.revenueThisMonth += p.amount;

  // أنشط المتاجر (طلبيات آخر 30 يوم)
  const totals = await platformOrderTotals(db, now - 30 * DAY);
  const names = new Map(rows.map((r) => [r.s.id, r.s]));
  const top = totals.filter((t) => names.has(t.storeId)).sort((a, b) => b.orders - a.orders || b.total - a.total).slice(0, 8)
    .map((t) => ({ id: t.storeId, name: names.get(t.storeId)!.name, slug: names.get(t.storeId)!.slug, orders: t.orders, total: t.total }));

  const [{ users: usersCount } = { users: 0 }] = await db.select({ users: sql<number>`count(*)` }).from(users);
  return {
    storesTotal: rows.length - unfinished, unfinished, byState, mrr, newWeek, newMonth, usersCount,
    byPlan: [...byPlan.values()].sort((a, b) => b.count - a.count),
    revenue, revenueThisMonth: revenue.at(-1)!.total,
    platformOrders30d: { orders: totals.reduce((s, t) => s + t.orders, 0), total: totals.reduce((s, t) => s + t.total, 0) },
    topStores: top,
    perLine: [...perLine.values()],
    expiring: (await listExpiring(db, {}, now)).slice(0, 10),
  };
}
