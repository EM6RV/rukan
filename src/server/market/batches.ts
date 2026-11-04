// الدفعات والصلاحية (FEFO) والإتلاف. المتبقي من كل دفعة يتحسب من المخزون الحالي (الأقرب انتهاءً يطلع أول)،
// فكل مسار يحرك المخزون (كاشير، طلبية أونلاين، جرد، تحويل) يشتغل بدون ما يلمس الدفعات.
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { batchRemaining, daysUntil, DEFAULT_EXPIRY_DISCOUNTS, suggestedExpiryDiscount } from "@/lib/market-pricing";
import { firstError } from "@/lib/validation";
import { fail, ok, type Result } from "../catalog/result";
import { applyWarehouseDelta, quantitiesIn, WarehouseError } from "../inventory/warehouses";
import { t, type StoreScope, type StoreScopeCore } from "../tenant";

type Core = Pick<StoreScopeCore, "from" | "insert" | "update" | "delete" | "count">;
const DAY = 86_400_000;

/** المتبقي من دفعات متغيرات (FEFO على مخزونها الحالي) */
export async function remainingByBatch(scope: Pick<StoreScopeCore, "from">, variantIds?: string[]) {
  const [batches, variants] = await Promise.all([
    scope.from(t.stockBatches, variantIds ? inArray(t.stockBatches.variantId, variantIds) : undefined),
    scope.from(t.productVariants, variantIds ? inArray(t.productVariants.id, variantIds) : undefined),
  ]);
  const out = new Map<string, { batch: (typeof batches)[number]; remaining: number }[]>();
  for (const v of variants) {
    const mine = batches.filter((b) => b.variantId === v.id);
    if (!mine.length) continue;
    const { remaining } = batchRemaining(mine.map((b) => ({ id: b.id, quantity: b.quantity, expiresAt: b.expiresAt?.getTime() ?? null, receivedAt: b.receivedAt.getTime() })), v.stock);
    out.set(v.id, mine.map((b) => ({ batch: b, remaining: remaining.get(b.id) ?? 0 })).sort((a, b) => (a.batch.expiresAt?.getTime() ?? Infinity) - (b.batch.expiresAt?.getTime() ?? Infinity)));
  }
  return out;
}

const batchSchema = z.object({
  variantId: z.string().min(1),
  batchNo: z.string().trim().max(40).nullish().transform((v) => v || null),
  expiresAt: z.number().int().positive().nullish().transform((v) => v ?? null),
  quantity: z.number().int("الكمية رقم صحيح").min(1, "الكمية 1 على الأقل").max(10_000_000),
  unitCost: z.number().int().min(0).max(1_000_000_000).nullish().transform((v) => v ?? null),
  note: z.string().trim().max(200).nullish().transform((v) => v || null),
});

/** تسجيل دفعة للمخزون الموجود (بدون ما يتغير المخزون): مثلاً أول مرة يفعّل الصلاحية */
export async function addBatch(scope: Core, input: unknown, opts: { purchaseItemId?: string | null; at?: number } = {}): Promise<Result<{ id: string }>> {
  const p = batchSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  if (!p.data.batchNo && !p.data.expiresAt) return fail("اكتب رقم الدفعة أو تاريخ الصلاحية.");
  const [v] = await scope.from(t.productVariants, eq(t.productVariants.id, p.data.variantId)).limit(1);
  if (!v) return fail("ما لقينا المنتج.");
  const [row] = await scope.insert(t.stockBatches, {
    variantId: v.id, batchNo: p.data.batchNo, expiresAt: p.data.expiresAt ? new Date(p.data.expiresAt) : null, quantity: p.data.quantity,
    unitCost: p.data.unitCost ?? v.costPrice ?? null, note: p.data.note, purchaseItemId: opts.purchaseItemId ?? null, receivedAt: new Date(opts.at ?? Date.now()),
  });
  return ok({ id: row!.id });
}

export async function deleteBatch(scope: StoreScope, id: string): Promise<Result> {
  if (await scope.count(t.writeoffs, eq(t.writeoffs.batchId, id))) return fail("الدفعة عليها إتلاف مسجّل: ما تنحذفش.");
  const rows = await scope.delete(t.stockBatches, eq(t.stockBatches.id, id));
  return rows.length ? ok(undefined) : fail("ما لقينا الدفعة.");
}

export type ExpiringRow = {
  variantId: string; productId: string; name: string; batchId: string | null; batchNo: string | null; expiresAt: number; daysLeft: number;
  quantity: number; costValue: number; retailValue: number; suggestedDiscount: number; expired: boolean;
};

/** الأصناف اللي صلاحيتها تخلص خلال days (والمنتهية)، بالمتبقي الفعلي من كل دفعة وخصم مقترح */
export async function expiringReport(scope: StoreScope, days: number, now = Date.now(), rules = DEFAULT_EXPIRY_DISCOUNTS): Promise<ExpiringRow[]> {
  const limit = now + days * DAY;
  const [batches, products] = await Promise.all([
    scope.from(t.stockBatches, lte(t.stockBatches.expiresAt, new Date(limit))),
    scope.from(t.products, isNull(t.products.deletedAt)),
  ]);
  const pById = new Map(products.map((p) => [p.id, p]));
  const vIds = [...new Set(batches.map((b) => b.variantId))];
  const remaining = await remainingByBatch(scope, vIds);
  const variants = vIds.length ? await scope.from(t.productVariants, inArray(t.productVariants.id, vIds)) : [];
  const out: ExpiringRow[] = [];
  for (const v of variants) {
    const p = pById.get(v.productId);
    if (!p) continue;
    for (const r of remaining.get(v.id) ?? []) {
      const exp = r.batch.expiresAt?.getTime();
      if (exp === undefined || exp > limit || r.remaining <= 0) continue;
      const d = daysUntil(exp, now);
      const price = v.price ?? p.price, cost = r.batch.unitCost ?? v.costPrice ?? p.costPrice ?? 0;
      const w = p.soldBy === "weight" ? 1000 : 1;
      out.push({
        variantId: v.id, productId: p.id, name: p.name, batchId: r.batch.id, batchNo: r.batch.batchNo, expiresAt: exp, daysLeft: d, quantity: r.remaining,
        costValue: Math.round((cost * r.remaining) / w), retailValue: Math.round((price * r.remaining) / w), suggestedDiscount: suggestedExpiryDiscount(d, rules), expired: exp <= now,
      });
    }
  }
  // المتغيرات اللي عندها تاريخ صلاحية مباشر (قبل الدفعات) وما عندهاش دفعات
  const legacy = await scope.from(t.productVariants, and(lte(t.productVariants.expiresAt, new Date(limit)), gte(t.productVariants.stock, 1))!);
  for (const v of legacy) {
    if (remaining.has(v.id) || vIds.includes(v.id)) continue;
    const p = pById.get(v.productId);
    if (!p || !v.expiresAt) continue;
    const exp = v.expiresAt.getTime(), d = daysUntil(exp, now), w = p.soldBy === "weight" ? 1000 : 1;
    out.push({
      variantId: v.id, productId: p.id, name: p.name, batchId: null, batchNo: null, expiresAt: exp, daysLeft: d, quantity: v.stock,
      costValue: Math.round(((v.costPrice ?? p.costPrice ?? 0) * v.stock) / w), retailValue: Math.round(((v.price ?? p.price) * v.stock) / w), suggestedDiscount: suggestedExpiryDiscount(d, rules), expired: exp <= now,
    });
  }
  return out.sort((a, b) => a.expiresAt - b.expiresAt);
}

// ===== الإتلاف =====

export const WRITEOFF_REASON_LABELS = { expired: "منتهي الصلاحية", damaged: "تالف", other: "سبب آخر" } as const;

const writeoffSchema = z.object({
  variantId: z.string().min(1),
  batchId: z.string().min(1).nullish().transform((v) => v ?? null),
  warehouseId: z.string().min(1).nullish().transform((v) => v ?? null),
  quantity: z.number({ error: "اكتب الكمية" }).int("الكمية رقم صحيح").min(1, "الكمية 1 على الأقل").max(10_000_000),
  reason: z.enum(["expired", "damaged", "other"], { error: "اختار السبب" }),
  note: z.string().trim().max(200).nullish().transform((v) => v || null),
});

/** إتلاف: ينقص المخزون (حركة «إتلاف») ويسجل التكلفة (تكلفة الدفعة أو متوسط التكلفة) */
export function writeOff(scope: StoreScope, input: unknown, actorUserId: string | null): Promise<Result<{ id: string; totalCost: number }>> {
  const p = writeoffSchema.safeParse(input);
  if (!p.success) return Promise.resolve(fail(firstError(p.error)));
  const d = p.data;
  return scope.transaction(async (tx) => {
    const [v] = await tx.from(t.productVariants, eq(t.productVariants.id, d.variantId)).limit(1);
    const [prod] = v ? await tx.from(t.products, eq(t.products.id, v.productId)).limit(1) : [];
    if (!v || !prod) return fail("ما لقينا المنتج.");
    const batch = d.batchId ? (await tx.from(t.stockBatches, and(eq(t.stockBatches.id, d.batchId), eq(t.stockBatches.variantId, v.id))!).limit(1))[0] : undefined;
    if (d.batchId && !batch) return fail("الدفعة مش من المنتج هذا.");
    const have = d.warehouseId ? (await quantitiesIn(tx, d.warehouseId, [v.id])).get(v.id) ?? 0 : v.stock;
    if (have < d.quantity) return fail(`المخزون (${have}) أقل من الكمية المتلفة.`);
    const unitCost = batch?.unitCost ?? v.costPrice ?? prod.costPrice ?? 0;
    const totalCost = Math.round((unitCost * d.quantity) / (prod.soldBy === "weight" ? 1000 : 1));
    try {
      await applyWarehouseDelta(tx, { warehouseId: d.warehouseId, variantId: v.id, delta: -d.quantity, reason: "writeoff", note: `إتلاف: ${WRITEOFF_REASON_LABELS[d.reason]}${batch?.batchNo ? ` (دفعة ${batch.batchNo})` : ""}`, actorUserId });
    } catch (e) {
      if (e instanceof WarehouseError) return fail(e.message);
      throw e;
    }
    const [row] = await tx.insert(t.writeoffs, { variantId: v.id, batchId: batch?.id ?? null, warehouseId: d.warehouseId, quantity: d.quantity, reason: d.reason, unitCost, totalCost, note: d.note, actorUserId });
    return ok({ id: row!.id, totalCost });
  });
}

export async function listWriteoffs(scope: StoreScope, range: { from: number; to: number }) {
  const rows = await scope.from(t.writeoffs, and(gte(t.writeoffs.createdAt, new Date(range.from)), lte(t.writeoffs.createdAt, new Date(range.to)))!).orderBy(t.writeoffs.createdAt);
  const vs = rows.length ? await scope.from(t.productVariants, inArray(t.productVariants.id, [...new Set(rows.map((r) => r.variantId))])) : [];
  const ps = vs.length ? await scope.from(t.products, inArray(t.products.id, [...new Set(vs.map((v) => v.productId))])) : [];
  const nameOf = (vid: string) => ps.find((p) => p.id === vs.find((v) => v.id === vid)?.productId)?.name ?? "؟";
  const items = rows.reverse().map((r) => ({ id: r.id, at: r.createdAt.getTime(), name: nameOf(r.variantId), quantity: r.quantity, reason: r.reason, totalCost: r.totalCost, note: r.note }));
  const byReason = { expired: 0, damaged: 0, other: 0 } as Record<keyof typeof WRITEOFF_REASON_LABELS, number>;
  for (const r of rows) byReason[r.reason] += r.totalCost;
  return { items, total: rows.reduce((s, r) => s + r.totalCost, 0), byReason };
}
