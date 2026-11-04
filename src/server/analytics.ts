// تحليلات المتجر بدون كوكيز ولا بيانات شخصية: عدّادات مجمّعة (يوم × نوع الصفحة × المصدر).
import { and, eq, gte, sql } from "drizzle-orm";
import { isUniqueViolation } from "./db-errors";
import { t, type StoreScope } from "./tenant";

export const VISIT_KINDS = ["home", "category", "product", "cart", "checkout", "other"] as const;
export type VisitKind = (typeof VISIT_KINDS)[number];
export const SOURCES = ["instagram", "tiktok", "whatsapp", "facebook", "snapchat", "google", "direct", "other"] as const;
export type VisitSource = (typeof SOURCES)[number];
export const SOURCE_LABELS: Record<VisitSource, string> = { instagram: "إنستغرام", tiktok: "تيك توك", whatsapp: "واتساب", facebook: "فيسبوك", snapchat: "سناب شات", google: "قوقل", direct: "مباشر", other: "أخرى" };

const TZ = 2 * 3_600_000;
export const dayKey = (ms: number) => new Date(ms + TZ).toISOString().slice(0, 10);

/** يحوّل مصدر الزيارة (utm_source أو مضيف الـ referrer) لأحد المصادر المعروفة */
export function normalizeSource(raw: string | null | undefined): VisitSource {
  const s = (raw ?? "").toLowerCase().trim();
  if (!s) return "direct";
  if (/(^|\.)(instagram|ig)\b|l\.instagram/.test(s) || s === "ig") return "instagram";
  if (/tiktok/.test(s)) return "tiktok";
  if (/whatsapp|wa\.me/.test(s)) return "whatsapp";
  if (/facebook|fb\.com|fb\b|messenger/.test(s)) return "facebook";
  if (/snapchat/.test(s)) return "snapchat";
  if (/google/.test(s)) return "google";
  return "other";
}

export async function recordVisit(scope: StoreScope, v: { kind: VisitKind; source: VisitSource; productId?: string | null; session: boolean }, now = Date.now()): Promise<void> {
  const key = { day: dayKey(now), kind: v.kind, source: v.source, productId: v.kind === "product" ? (v.productId ?? "").slice(0, 40) : "" };
  const where = and(eq(t.storeVisits.day, key.day), eq(t.storeVisits.kind, key.kind), eq(t.storeVisits.source, key.source), eq(t.storeVisits.productId, key.productId));
  const inc = { views: sql`${t.storeVisits.views} + 1` as unknown as number, sessions: sql`${t.storeVisits.sessions} + ${v.session ? 1 : 0}` as unknown as number };
  if ((await scope.update(t.storeVisits, inc, where)).length) return;
  try {
    await scope.insert(t.storeVisits, { ...key, views: 1, sessions: v.session ? 1 : 0 });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    await scope.update(t.storeVisits, inc, where); // سباق: تسجّل غيرنا للتو
  }
}

export type AnalyticsReport = {
  days: number; visits: number; pageViews: number; orders: number; conversion: number | null;
  sources: { source: VisitSource; visits: number }[];
  topProducts: { productId: string; name: string; views: number }[];
};

export async function getAnalytics(scope: StoreScope, days = 30, now = Date.now()): Promise<AnalyticsReport> {
  const from = dayKey(now - (days - 1) * 86_400_000);
  const rows = await scope.from(t.storeVisits, gte(t.storeVisits.day, from));
  const visits = rows.reduce((s, r) => s + r.sessions, 0);
  const pageViews = rows.reduce((s, r) => s + r.views, 0);
  const bySource = new Map<string, number>();
  for (const r of rows) bySource.set(r.source, (bySource.get(r.source) ?? 0) + r.sessions);
  const prodViews = new Map<string, number>();
  for (const r of rows) if (r.kind === "product" && r.productId) prodViews.set(r.productId, (prodViews.get(r.productId) ?? 0) + r.views);
  const top = [...prodViews].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const products = top.length ? await scope.from(t.products) : [];
  const names = new Map(products.map((p) => [p.id, p.name]));
  const since = new Date(now - days * 86_400_000);
  const orders = await scope.count(t.orders, and(gte(t.orders.createdAt, since), sql`${t.orders.status} != 'cancelled'`));
  return {
    days, visits, pageViews, orders, conversion: visits > 0 ? Math.min(1, orders / visits) : null,
    sources: [...bySource].map(([source, n]) => ({ source: source as VisitSource, visits: n })).sort((a, b) => b.visits - a.visits),
    topProducts: top.map(([productId, views]) => ({ productId, name: names.get(productId) ?? "منتج محذوف", views })),
  };
}
