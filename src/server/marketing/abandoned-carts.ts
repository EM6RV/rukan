import { and, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { phoneSchema } from "@/lib/validation";
import { fail, ok, type Result } from "../catalog/result";
import { resolveCart } from "../storefront/queries";
import { t, type StoreScope } from "../tenant";

/** السلة تعتبر «متروكة» لو ما تحدّثت من 30 دقيقة، وتتمسح بعد 30 يوم */
export const IDLE_MS = 30 * 60_000;
export const RETENTION_MS = 30 * 86_400_000;

const input = z.object({
  phone: phoneSchema,
  name: z.string().trim().max(80).nullish(),
  items: z.array(z.object({ variantId: z.string().min(1).max(40), quantity: z.number().int().min(1).max(20) })).min(1).max(50),
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

  const items = lines.map((l) => ({ name: l.name, variantLabel: l.variantLabel, quantity: l.quantity, price: l.price }));
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
  await scope.delete(t.abandonedCarts, lt(t.abandonedCarts.lastActivityAt, new Date(now - RETENTION_MS)));
  return ok({ saved: true });
}

/** لما الزبون يطلب: تنقفل سلته المفتوحة (من نفس الـ transaction بتاع الطلب) */
export async function markCartRecovered(scope: StoreScope, phone: string, now = Date.now()) {
  await scope.update(t.abandonedCarts, { recoveredAt: new Date(now) }, and(eq(t.abandonedCarts.phone, phone), isNull(t.abandonedCarts.recoveredAt))!);
}

export type AbandonedCartRow = {
  id: string; phone: string; name: string | null; items: { name: string; variantLabel: string | null; quantity: number; price: number }[];
  itemCount: number; total: number; updatedAt: number; remindedAt: number | null;
};

/** السلات المتروكة: ما تحدّثت من 30 دقيقة، ما اتحولت لطلب، وفي آخر 30 يوم */
export async function listAbandonedCarts(scope: StoreScope, now = Date.now()): Promise<AbandonedCartRow[]> {
  const rows = await scope
    .from(t.abandonedCarts, and(isNull(t.abandonedCarts.recoveredAt), lt(t.abandonedCarts.lastActivityAt, new Date(now - IDLE_MS)), gte(t.abandonedCarts.lastActivityAt, new Date(now - RETENTION_MS)))!)
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
