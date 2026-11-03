import { and, asc, desc, eq, exists, gt, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Db } from "@/db";
import { auditLogs, lineSubscriptions, plans, storeMembers, stores, users } from "@/db/schema/platform";
import { PRODUCT_LINES, type ProductLine } from "@/lib/product-lines";
import { businessAccess, computeLineState, type LineState } from "../line-access";
import { loadLines } from "../lines";
import { computeStoreAccess } from "../store-access";
import { platformStoreCounts } from "../tenant";
import { listPayments } from "./subscriptions";

export const STORE_STATE_FILTERS = ["trial", "active", "expired", "suspended"] as const;
export type StoreStateFilter = (typeof STORE_STATE_FILTERS)[number];

const like = (q: string) => `%${q.trim().replace(/[\\%_]/g, "\\$&")}%`;

const ls = alias(lineSubscriptions, "ls");

/** حالة اشتراك المنظومة الفعلية (نفس منطق computeLineState) كشرط SQL علشان الفلترة والصفحات تكون صحيحة */
function stateCondition(state: StoreStateFilter, now: number): SQL {
  const end = sql`(CASE WHEN ${ls.status} = 'trial' THEN ${ls.trialEndsAt} ELSE ${ls.currentPeriodEnd} END)`;
  const expired = or(eq(ls.status, "expired"), and(sql`${end} IS NOT NULL`, lte(end, now)))!;
  switch (state) {
    case "suspended": return eq(ls.status, "suspended");
    case "expired": return and(ne(ls.status, "suspended"), expired)!;
    case "trial": return and(eq(ls.status, "trial"), or(isNull(ls.trialEndsAt), gt(ls.trialEndsAt, new Date(now))))!;
    case "active": return and(eq(ls.status, "active"), or(isNull(ls.currentPeriodEnd), gt(ls.currentPeriodEnd, new Date(now))))!;
  }
}

export type AdminLineBadge = { line: ProductLine; state: LineState; daysLeft: number | null; planName: string | null };
export type AdminStoreRow = {
  id: string; slug: string; name: string; ownerName: string; ownerPhone: string; planName: string | null; billingCycle: string;
  state: "trial" | "active" | "expired" | "suspended"; daysLeft: number | null; onboarded: boolean; createdAt: number;
  /** منظومات النشاط بحالتها */
  lines: AdminLineBadge[];
};

/**
 * المتاجر/النشاطات مع فلترة حسب المنظومة: الحالة والباقة تنطبق على اشتراك المنظومة المختارة
 * (ولو ما فيش منظومة مختارة: أي منظومة عند النشاط في الحالة/الباقة هذي).
 */
export async function listStores(db: Db, f: { q?: string; state?: StoreStateFilter; planId?: string; line?: ProductLine; page?: number; pageSize?: number } = {}, now = Date.now()) {
  const c: SQL[] = [];
  const q = f.q?.trim();
  if (q) {
    const t = like(q);
    const digits = q.replace(/\D/g, "");
    c.push(or(sql`${stores.name} LIKE ${t} ESCAPE '\\'`, sql`${stores.slug} LIKE ${t} ESCAPE '\\'`, sql`${users.phone} LIKE ${like(digits || q)} ESCAPE '\\'`, sql`${users.name} LIKE ${t} ESCAPE '\\'`)!);
  }
  const lineConds = [eq(ls.storeId, stores.id), f.line ? eq(ls.line, f.line) : undefined, f.state ? stateCondition(f.state, now) : undefined, f.planId ? eq(ls.planId, f.planId) : undefined].filter((x): x is SQL => !!x);
  if (f.line || f.state || f.planId) c.push(exists(db.select({ one: sql`1` }).from(ls).where(and(...lineConds))));
  const where = c.length ? and(...c) : undefined;
  const size = Math.min(f.pageSize ?? 25, 100);

  const base = () => db.select({ n: sql<number>`count(*)` }).from(stores).innerJoin(users, eq(users.id, stores.ownerUserId)).where(where);
  const [{ n } = { n: 0 }] = await base();
  const pageCount = Math.max(1, Math.ceil(n / size));
  const page = Math.min(Math.max(1, f.page ?? 1), pageCount);
  const rows = await db
    .select({ s: stores, ownerName: users.name, ownerPhone: users.phone })
    .from(stores).innerJoin(users, eq(users.id, stores.ownerUserId))
    .where(where).orderBy(desc(stores.createdAt), asc(stores.id)).limit(size).offset((page - 1) * size);
  const subs = rows.length
    ? await db.select({ sub: lineSubscriptions, planName: plans.nameAr }).from(lineSubscriptions).leftJoin(plans, eq(plans.id, lineSubscriptions.planId)).where(inArray(lineSubscriptions.storeId, rows.map((r) => r.s.id)))
    : [];

  const items: AdminStoreRow[] = rows.map((r) => {
    const mine = subs.filter((x) => x.sub.storeId === r.s.id);
    const lines: AdminLineBadge[] = PRODUCT_LINES.flatMap((l) => {
      const x = mine.find((m) => m.sub.line === l);
      if (!x) return [];
      const st = computeLineState(x.sub, now);
      return [{ line: l, state: st.state as LineState, daysLeft: st.daysLeft, planName: x.planName }];
    });
    // الحالة المعروضة: المنظومة المفلترة، وإلا المتجر الأونلاين، وإلا أول منظومة (نشاط قديم بدون سطور: أعمدة stores)
    const pick = lines.find((l) => l.line === f.line) ?? lines.find((l) => l.line === "store") ?? lines[0];
    const legacy = computeStoreAccess(r.s, now);
    return {
      id: r.s.id, slug: r.s.slug, name: r.s.name, ownerName: r.ownerName, ownerPhone: r.ownerPhone,
      planName: pick?.planName ?? null, billingCycle: r.s.billingCycle,
      state: pick?.state ?? legacy.state, daysLeft: pick ? pick.daysLeft : legacy.daysLeft,
      onboarded: !!r.s.onboardedAt, createdAt: r.s.createdAt.getTime(), lines,
    };
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
  const lines = await loadLines(db, row.s, now);
  return {
    store: row.s, ownerName: row.ownerName, ownerPhone: row.ownerPhone, plan: row.plan, access: businessAccess(lines), lines, counts, members,
    payments: payments.items,
    audit: audit.map((r) => ({ id: r.a.id, action: r.a.action, actor: r.actor, meta: r.a.meta, createdAt: r.a.createdAt.getTime() })),
  };
}
