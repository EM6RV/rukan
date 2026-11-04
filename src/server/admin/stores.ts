import { and, asc, desc, eq, gt, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLogs, plans, storeMembers, stores, users } from "@/db/schema/platform";
import { computeStoreAccess } from "../store-access";
import { platformStoreCounts } from "../tenant";
import { listPayments } from "./subscriptions";

export const STORE_STATE_FILTERS = ["trial", "active", "expired", "suspended"] as const;
export type StoreStateFilter = (typeof STORE_STATE_FILTERS)[number];

const like = (q: string) => `%${q.trim().replace(/[\\%_]/g, "\\$&")}%`;

/** حالة المتجر الفعلية (نفس منطق computeStoreAccess) كشرط SQL علشان الفلترة والصفحات تكون صحيحة */
function stateCondition(state: StoreStateFilter, now: number): SQL {
  const end = sql`(CASE WHEN ${stores.status} = 'trial' THEN ${stores.trialEndsAt} ELSE ${stores.currentPeriodEnd} END)`;
  const expired = or(eq(stores.status, "expired"), and(sql`${end} IS NOT NULL`, lte(end, now)))!;
  switch (state) {
    case "suspended": return eq(stores.status, "suspended");
    case "expired": return and(ne(stores.status, "suspended"), expired)!;
    case "trial": return and(eq(stores.status, "trial"), or(isNull(stores.trialEndsAt), gt(stores.trialEndsAt, new Date(now))))!;
    case "active": return and(eq(stores.status, "active"), or(isNull(stores.currentPeriodEnd), gt(stores.currentPeriodEnd, new Date(now))))!;
  }
}

export type AdminStoreRow = {
  id: string; slug: string; name: string; ownerName: string; ownerPhone: string; planName: string | null; billingCycle: string;
  state: "trial" | "active" | "expired" | "suspended"; daysLeft: number | null; onboarded: boolean; createdAt: number;
};

export async function listStores(db: Db, f: { q?: string; state?: StoreStateFilter; planId?: string; page?: number; pageSize?: number } = {}, now = Date.now()) {
  const c: SQL[] = [];
  const q = f.q?.trim();
  if (q) {
    const t = like(q);
    const digits = q.replace(/\D/g, "");
    c.push(or(sql`${stores.name} LIKE ${t} ESCAPE '\\'`, sql`${stores.slug} LIKE ${t} ESCAPE '\\'`, sql`${users.phone} LIKE ${like(digits || q)} ESCAPE '\\'`, sql`${users.name} LIKE ${t} ESCAPE '\\'`)!);
  }
  if (f.state) c.push(stateCondition(f.state, now));
  if (f.planId) c.push(eq(stores.planId, f.planId));
  const where = c.length ? and(...c) : undefined;
  const size = Math.min(f.pageSize ?? 25, 100);

  const base = () => db.select({ n: sql<number>`count(*)` }).from(stores).innerJoin(users, eq(users.id, stores.ownerUserId)).where(where);
  const [{ n } = { n: 0 }] = await base();
  const pageCount = Math.max(1, Math.ceil(n / size));
  const page = Math.min(Math.max(1, f.page ?? 1), pageCount);
  const rows = await db
    .select({ s: stores, ownerName: users.name, ownerPhone: users.phone, planName: plans.nameAr })
    .from(stores).innerJoin(users, eq(users.id, stores.ownerUserId)).leftJoin(plans, eq(plans.id, stores.planId))
    .where(where).orderBy(desc(stores.createdAt), asc(stores.id)).limit(size).offset((page - 1) * size);

  const items: AdminStoreRow[] = rows.map((r) => {
    const a = computeStoreAccess(r.s, now);
    return { id: r.s.id, slug: r.s.slug, name: r.s.name, ownerName: r.ownerName, ownerPhone: r.ownerPhone, planName: r.planName, billingCycle: r.s.billingCycle, state: a.state, daysLeft: a.daysLeft, onboarded: !!r.s.onboardedAt, createdAt: r.s.createdAt.getTime() };
  });
  return { items, total: n, page, pageCount };
}

export async function getStoreDetail(db: Db, id: string, now = Date.now()) {
  const row = await db
    .select({ s: stores, ownerName: users.name, ownerPhone: users.phone, plan: plans })
    .from(stores).innerJoin(users, eq(users.id, stores.ownerUserId)).leftJoin(plans, eq(plans.id, stores.planId))
    .where(eq(stores.id, id)).get();
  if (!row) return null;
  const [counts, members, payments, audit] = await Promise.all([
    platformStoreCounts(db, id),
    db.select({ role: storeMembers.role, name: users.name, phone: users.phone }).from(storeMembers).innerJoin(users, eq(users.id, storeMembers.userId)).where(eq(storeMembers.storeId, id)),
    listPayments(db, { storeId: id, pageSize: 20 }),
    db.select({ a: auditLogs, actor: users.name }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorUserId)).where(eq(auditLogs.storeId, id)).orderBy(desc(auditLogs.createdAt)).limit(15),
  ]);
  return {
    store: row.s, ownerName: row.ownerName, ownerPhone: row.ownerPhone, plan: row.plan, access: computeStoreAccess(row.s, now), counts, members,
    payments: payments.items,
    audit: audit.map((r) => ({ id: r.a.id, action: r.a.action, actor: r.actor, meta: r.a.meta, createdAt: r.a.createdAt.getTime() })),
  };
}
