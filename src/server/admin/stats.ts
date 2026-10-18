import { cycleMonths } from "@/lib/billing";
import { eq, gte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { plans, stores, subscriptionPayments, users } from "@/db/schema/platform";
import { monthKey } from "@/lib/billing";
import { computeStoreAccess } from "../store-access";
import { platformOrderTotals } from "../tenant";
import { listExpiring } from "./subscriptions";

const DAY = 86_400_000;

export async function getPlatformStats(db: Db, now = Date.now()) {
  const rows = await db.select({ s: stores, plan: plans, ownerName: users.name }).from(stores).leftJoin(plans, eq(plans.id, stores.planId)).innerJoin(users, eq(users.id, stores.ownerUserId));
  const byState = { trial: 0, active: 0, expired: 0, suspended: 0 };
  let mrr = 0, newWeek = 0, newMonth = 0, unfinished = 0;
  const byPlan = new Map<string, { name: string; count: number }>();
  for (const r of rows) {
    if (!r.s.onboardedAt) { unfinished++; continue; }
    const a = computeStoreAccess(r.s, now);
    byState[a.state]++;
    if (a.state === "active" && r.plan) {
      mrr += Math.round(r.plan.price / cycleMonths(r.plan.billingPeriod));
      const p = byPlan.get(r.plan.id) ?? { name: r.plan.nameAr, count: 0 };
      p.count++; byPlan.set(r.plan.id, p);
    }
    if (r.s.createdAt.getTime() >= now - 7 * DAY) newWeek++;
    if (r.s.createdAt.getTime() >= now - 30 * DAY) newMonth++;
  }

  // إيرادات آخر 6 شهور (حسب تاريخ تسجيل الدفعة، بتوقيت ليبيا)
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(now + 2 * 3_600_000); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); months.push(d.toISOString().slice(0, 7)); }
  const since = Date.parse(`${months[0]}-01T00:00:00Z`) - 2 * 3_600_000;
  const pays = await db.select({ amount: subscriptionPayments.amount, createdAt: subscriptionPayments.createdAt }).from(subscriptionPayments).where(gte(subscriptionPayments.createdAt, new Date(since)));
  const revenue = months.map((m) => ({ month: m, total: pays.filter((p) => monthKey(p.createdAt.getTime()) === m).reduce((s, p) => s + p.amount, 0), payments: pays.filter((p) => monthKey(p.createdAt.getTime()) === m).length }));

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
    expiring: (await listExpiring(db, {}, now)).slice(0, 10),
  };
}
