// العروض التلقائية للكاشير (اشتري X وخذ Y، الحبة الثانية، سعر بالوقت، سعر الباقة). المحرك نفسه في lib/promotions.
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { PROMO_CONFIG_SCHEMAS, PROMO_KINDS, type Promo, type PromoKind } from "@/lib/promotions";
import { firstError } from "@/lib/validation";
import { fail, ok, type Result } from "../catalog/result";
import { t, type StoreScope, type StoreScopeCore } from "../tenant";

const baseSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string({ error: "اكتب اسم العرض" }).trim().min(1, "اكتب اسم العرض").max(60, "اسم العرض طويل"),
  kind: z.enum(PROMO_KINDS, { error: "اختار نوع العرض" }),
  config: z.unknown(),
  startsAt: z.number().int().positive().nullish().transform((v) => v ?? null),
  endsAt: z.number().int().positive().nullish().transform((v) => v ?? null),
  isActive: z.boolean().default(true),
});

/** العروض بالترتيب اللي تتطبق بيه (الأقدم أول) — نفس الترتيب في الجهاز والسيرفر */
export async function loadPromotions(scope: Pick<StoreScopeCore, "from">): Promise<Promo[]> {
  const rows = await scope.from(t.promotions).orderBy(t.promotions.createdAt, t.promotions.id);
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, config: r.config, startsAt: r.startsAt?.getTime() ?? null, endsAt: r.endsAt?.getTime() ?? null, isActive: r.isActive }));
}

export async function listPromotions(scope: StoreScope) {
  const promos = await loadPromotions(scope);
  const ids = new Set<string>();
  for (const p of promos) {
    const c = p.config as { variantIds?: string[]; items?: { variantId: string }[] };
    for (const v of c.variantIds ?? []) ids.add(v);
    for (const i of c.items ?? []) ids.add(i.variantId);
  }
  const vs = ids.size ? await scope.from(t.productVariants, inArray(t.productVariants.id, [...ids])) : [];
  const ps = vs.length ? await scope.from(t.products, inArray(t.products.id, [...new Set(vs.map((v) => v.productId))])) : [];
  const names = new Map(vs.map((v) => [v.id, ps.find((p) => p.id === v.productId)?.name ?? "؟"]));
  return promos.map((p) => ({ ...p, productNames: Object.fromEntries(names) as Record<string, string> }));
}

export async function savePromotion(scope: StoreScope, input: unknown): Promise<Result<{ id: string }>> {
  const p = baseSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const cfg = PROMO_CONFIG_SCHEMAS[p.data.kind as PromoKind].safeParse(p.data.config);
  if (!cfg.success) return fail(firstError(cfg.error));
  if (p.data.startsAt && p.data.endsAt && p.data.endsAt <= p.data.startsAt) return fail("تاريخ النهاية لازم يكون بعد البداية.");
  const c = cfg.data as { variantIds?: string[]; items?: { variantId: string }[]; fromMinute?: number; toMinute?: number };
  if (c.fromMinute !== undefined && c.fromMinute === c.toMinute) return fail("وقت البداية والنهاية نفس الشي.");
  const ids = [...new Set([...(c.variantIds ?? []), ...(c.items ?? []).map((i) => i.variantId)])];
  if (ids.length && (await scope.count(t.productVariants, inArray(t.productVariants.id, ids))) !== ids.length) return fail("فيه صنف في العرض مش موجود.");
  const row = { name: p.data.name, kind: p.data.kind, config: cfg.data as Record<string, unknown>, startsAt: p.data.startsAt ? new Date(p.data.startsAt) : null, endsAt: p.data.endsAt ? new Date(p.data.endsAt) : null, isActive: p.data.isActive };
  if (p.data.id) {
    const [r] = await scope.update(t.promotions, row, eq(t.promotions.id, p.data.id));
    return r ? ok({ id: r.id }) : fail("ما لقينا العرض. حدّث الصفحة.");
  }
  const [r] = await scope.insert(t.promotions, row);
  return ok({ id: r!.id });
}

export async function setPromotionActive(scope: StoreScope, id: string, isActive: boolean): Promise<Result> {
  const rows = await scope.update(t.promotions, { isActive }, eq(t.promotions.id, id));
  return rows.length ? ok(undefined) : fail("ما لقينا العرض.");
}

export async function deletePromotion(scope: StoreScope, id: string): Promise<Result> {
  const rows = await scope.delete(t.promotions, eq(t.promotions.id, id));
  return rows.length ? ok(undefined) : fail("ما لقينا العرض.");
}
