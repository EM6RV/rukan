import { and, desc, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { phoneSchema } from "@/lib/validation";
import { fail, ok, type Result } from "../catalog/result";
import { resolveCart } from "../storefront/queries";
import { t, type StoreScope } from "../tenant";

/** السلة تعتبر «متروكة» لو ما تحدّثت من 30 دقيقة، وتتمسح بعد 30 يوم */
export const IDLE_MS = 30 * 60_000;
export const RETENTION_MS = 30 * 86_400_000;
export const MIN_RETENTION_DAYS = 3;
export const MAX_RETENTION_DAYS = 90;
export const retentionMs = (days: number | null | undefined) => Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, days ?? 30)) * 86_400_000;

const input = z.object({
  phone: phoneSchema,
  name: z.string().trim().max(80).nullish(),
  items: z.array(z.object({ variantId: z.string().min(1).max(40), quantity: z.number().int().min(1).max(20), note: z.string().max(200).nullish() })).min(1).max(50),
});

/**
 * يحفظ/يحدّث سلة الزبون بعد ما يكتب رقمه. الأسعار والأسماء تتحسب من القاعدة (ما نصدّقش العميل)،
 * والبنود غير المتاحة تنشال. سلة فاضية = ما نحفظ شي.
 */
export async function captureCart(scope: StoreScope, raw: unknown, now = Date.now()): Promise<Result<{ saved: boolean }>> {
  const p = input.safeParse(raw);
  if (!p.success) return fail("فيه خانة ناقصة أو غلط. راجع الخانات وجرّب.");
  const lines = await resolveCart(scope, p.data.items);
  if (!lines.length) return ok({ saved: false });

  const items = lines.map((l) => ({ name: l.name, variantLabel: l.variantLabel, quantity: l.quantity, price: l.price, variantId: l.variantId, note: l.note }));
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  const name = p.data.name?.trim() || null;

  const [existing] = await scope.from(t.abandonedCarts, eq(t.abandonedCarts.phone, p.data.phone)).limit(1);
  if (existing) {
    await scope.update(t.abandonedCarts, { items, itemCount, total, name: name ?? existing.name, recoveredAt: null, lastActivityAt: new Date(now) }, eq(t.abandonedCarts.id, existing.id));
  } else {
    await scope.insert(t.abandonedCarts, { phone: p.data.phone, name, items, itemCount, total, lastActivityAt: new Date(now) });
  }
  // تنظيف القديم (حماية خصوصية: ما نحتفظش بأرقام الزباين بدون سبب)
  const [cfg] = await scope.from(t.storeSettings).limit(1);
  await scope.delete(t.abandonedCarts, lt(t.abandonedCarts.lastActivityAt, new Date(now - retentionMs(cfg?.abandonedRetentionDays))));
  return ok({ saved: true });
}

/** لما الزبون يطلب: تنقفل سلته المفتوحة (من نفس الـ transaction بتاع الطلب) */
export async function markCartRecovered(scope: StoreScope, phone: string, now = Date.now()) {
  await scope.update(t.abandonedCarts, { recoveredAt: new Date(now) }, and(eq(t.abandonedCarts.phone, phone), isNull(t.abandonedCarts.recoveredAt))!);
}

export type AbandonedCartRow = {
  id: string; phone: string; name: string | null; items: { name: string; variantLabel: string | null; quantity: number; price: number; variantId?: string; note?: string | null }[];
  itemCount: number; total: number; updatedAt: number; remindedAt: number | null;
};

/** السلات المتروكة: ما تحدّثت من 30 دقيقة، ما اتحولت لطلب، وفي آخر 30 يوم */
export async function listAbandonedCarts(scope: StoreScope, now = Date.now()): Promise<AbandonedCartRow[]> {
  const [cfg] = await scope.from(t.storeSettings).limit(1);
  const keep = retentionMs(cfg?.abandonedRetentionDays);
  const rows = await scope
    .from(t.abandonedCarts, and(isNull(t.abandonedCarts.recoveredAt), lt(t.abandonedCarts.lastActivityAt, new Date(now - IDLE_MS)), gte(t.abandonedCarts.lastActivityAt, new Date(now - keep)))!)
    .orderBy(desc(t.abandonedCarts.lastActivityAt))
    .limit(200);
  return rows.map((r) => ({ id: r.id, phone: r.phone, name: r.name, items: r.items, itemCount: r.itemCount, total: r.total, updatedAt: r.lastActivityAt.getTime(), remindedAt: r.remindedAt?.getTime() ?? null }));
}

export async function markReminded(scope: StoreScope, id: string, now = Date.now()): Promise<Result> {
  const r = await scope.update(t.abandonedCarts, { remindedAt: new Date(now) }, eq(t.abandonedCarts.id, id));
  return r.length ? ok(undefined) : fail("ما لقينا السلة. يمكن انحذفت، حدّث الصفحة.");
}

export async function dismissCart(scope: StoreScope, id: string): Promise<Result> {
  const r = await scope.delete(t.abandonedCarts, eq(t.abandonedCarts.id, id));
  return r.length ? ok(undefined) : fail("ما لقينا السلة. يمكن انحذفت، حدّث الصفحة.");
}

/** تقرير المبيعات المسترجعة: سلات اتذكّر أصحابها وبعدها أكملوا الطلب */
export async function recoveredSalesReport(scope: StoreScope): Promise<{ count: number; total: number; reminded: number; rate: number | null }> {
  const rows = await scope.from(t.abandonedCarts, isNotNull(t.abandonedCarts.remindedAt));
  const won = rows.filter((r) => r.recoveredAt && r.remindedAt && r.recoveredAt.getTime() >= r.remindedAt.getTime());
  return { count: won.length, total: won.reduce((s, r) => s + r.total, 0), reminded: rows.length, rate: rows.length ? won.length / rows.length : null };
}

export async function saveRetentionDays(scope: StoreScope, days: unknown): Promise<Result> {
  const p = z.number().int().min(MIN_RETENTION_DAYS, `الحد الأدنى ${MIN_RETENTION_DAYS} أيام`).max(MAX_RETENTION_DAYS, `الحد الأقصى ${MAX_RETENTION_DAYS} يوم`).safeParse(days);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "عدد الأيام غير صحيح");
  const rows = await scope.update(t.storeSettings, { abandonedRetentionDays: p.data });
  return rows.length ? ok(undefined) : fail("ما قدرنا نحفظ. حدّث الصفحة.");
}

/** سلة للاسترجاع برابط (id عشوائي طويل): بنودها اللي لها variantId فقط */
export async function getRecoverableCart(scope: StoreScope, id: string) {
  if (id.length < 10 || id.length > 40) return null;
  const [c] = await scope.from(t.abandonedCarts, eq(t.abandonedCarts.id, id)).limit(1);
  if (!c || c.recoveredAt) return null;
  return c.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity, note: i.note ?? undefined }));
}
