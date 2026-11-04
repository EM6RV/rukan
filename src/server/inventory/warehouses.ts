// وحدة المخازن. المخزون الكلي للمتغير = product_variants.stock (كل الكود القديم يشتغل عليه).
// كمية المخزن الرئيسي = الكلي − مجموع كميات باقي المخازن (المخزّنة في warehouse_stock).
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { PlanLimits } from "@/db/schema/platform";
import { firstError } from "@/lib/validation";
import { fail, ok, type Result } from "../catalog/result";
import { isUniqueViolation } from "../db-errors";
import { t, type StoreScope, type StoreScopeCore } from "../tenant";

export const MAIN_WAREHOUSE_NAME = "المخزن الرئيسي";
type Core = Pick<StoreScopeCore, "from" | "insert" | "update" | "delete" | "count">;
export class WarehouseError extends Error {}

export async function ensureDefaultWarehouse(scope: Core): Promise<typeof t.warehouses.$inferSelect> {
  const [existing] = await scope.from(t.warehouses, eq(t.warehouses.isDefault, true)).limit(1);
  if (existing) return existing;
  const [any] = await scope.from(t.warehouses).orderBy(t.warehouses.createdAt).limit(1);
  if (any) { const [row] = await scope.update(t.warehouses, { isDefault: true }, eq(t.warehouses.id, any.id)); return row!; }
  const [row] = await scope.insert(t.warehouses, { name: MAIN_WAREHOUSE_NAME, isDefault: true });
  return row!;
}

export async function listWarehouses(scope: StoreScope) {
  const [ws, rows, variants] = await Promise.all([scope.from(t.warehouses).orderBy(t.warehouses.createdAt), scope.from(t.warehouseStock), scope.from(t.productVariants)]);
  const total = variants.reduce((s, v) => s + v.stock, 0);
  const other = new Map<string, number>();
  for (const r of rows) other.set(r.warehouseId, (other.get(r.warehouseId) ?? 0) + r.quantity);
  const othersSum = [...other.values()].reduce((s, n) => s + n, 0);
  return ws.map((w) => ({ id: w.id, name: w.name, address: w.address, isDefault: w.isDefault, isActive: w.isActive, isLocked: w.isLocked, units: w.isDefault ? Math.max(0, total - othersSum) : other.get(w.id) ?? 0 }));
}

const warehouseSchema = z.object({
  id: z.string().optional(),
  name: z.string({ error: "اكتب اسم المخزن" }).trim().min(1, "اكتب اسم المخزن").max(60, "اسم المخزن طويل"),
  address: z.string().trim().max(200, "العنوان طويل").nullish().transform((v) => v || null),
  isActive: z.boolean().default(true),
});

export async function saveWarehouse(scope: StoreScope, limits: Pick<PlanLimits, "maxWarehouses">, input: unknown): Promise<Result<{ id: string }>> {
  const p = warehouseSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, ...data } = p.data;
  try {
    return await scope.transaction(async (tx) => {
      await ensureDefaultWarehouse(tx);
      if (id) {
        const [w] = await tx.from(t.warehouses, eq(t.warehouses.id, id)).limit(1);
        if (!w) return fail("ما لقينا المخزن. حدّث الصفحة.");
        if (w.isDefault && !data.isActive) return fail("ما ينفعش توقف المخزن الرئيسي.");
        const [row] = await tx.update(t.warehouses, data, eq(t.warehouses.id, id));
        return ok({ id: row!.id });
      }
      const active = await tx.count(t.warehouses, eq(t.warehouses.isActive, true));
      if (typeof limits.maxWarehouses === "number" && active >= limits.maxWarehouses) return fail(`باقتك تسمح بـ ${limits.maxWarehouses} ${limits.maxWarehouses === 1 ? "مخزن" : "مخازن"} فقط. رقّي الباقة أو اشترِ مخزن إضافي.`);
      const [row] = await tx.insert(t.warehouses, data);
      return ok({ id: row!.id });
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("عندك مخزن بنفس الاسم.");
    throw e;
  }
}

/** المخزن الرئيسي يتغير: كميات الرئيسي القديم تنتقل لصفوف مخزّنة والجديد يصير الباقي (الإجمالي ما يتغيرش) */
export async function setDefaultWarehouse(scope: StoreScope, id: string): Promise<Result> {
  return scope.transaction(async (tx) => {
    const oldDefault = await ensureDefaultWarehouse(tx);
    const [target] = await tx.from(t.warehouses, eq(t.warehouses.id, id)).limit(1);
    if (!target || !target.isActive) return fail("المخزن غير موجود أو موقوف.");
    if (target.id === oldDefault.id) return ok(undefined);
    const variants = await tx.from(t.productVariants);
    const rows = await tx.from(t.warehouseStock);
    for (const v of variants) {
      const mine = rows.filter((r) => r.variantId === v.id);
      const oldDefaultQty = Math.max(0, v.stock - mine.reduce((s, r) => s + r.quantity, 0));
      if (oldDefaultQty > 0) await tx.insert(t.warehouseStock, { warehouseId: oldDefault.id, variantId: v.id, quantity: oldDefaultQty });
      if (mine.some((r) => r.warehouseId === target.id)) await tx.delete(t.warehouseStock, and(eq(t.warehouseStock.warehouseId, target.id), eq(t.warehouseStock.variantId, v.id)));
    }
    await tx.update(t.warehouses, { isDefault: false }, eq(t.warehouses.id, oldDefault.id));
    await tx.update(t.warehouses, { isDefault: true }, eq(t.warehouses.id, target.id));
    return ok(undefined);
  });
}

/** كمية متغيرات في مخزن (الرئيسي محسوب) */
export async function quantitiesIn(scope: Core, warehouseId: string, variantIds?: string[]): Promise<Map<string, number>> {
  const w = (await scope.from(t.warehouses, eq(t.warehouses.id, warehouseId)).limit(1))[0];
  if (!w) throw new WarehouseError("المخزن غير موجود.");
  const variants = await scope.from(t.productVariants, variantIds ? inArray(t.productVariants.id, variantIds) : undefined);
  const rows = await scope.from(t.warehouseStock, variantIds ? inArray(t.warehouseStock.variantId, variantIds) : undefined);
  const out = new Map<string, number>();
  for (const v of variants) {
    const mine = rows.filter((r) => r.variantId === v.id);
    out.set(v.id, w.isDefault ? Math.max(0, v.stock - mine.reduce((s, r) => s + r.quantity, 0)) : mine.find((r) => r.warehouseId === warehouseId)?.quantity ?? 0);
  }
  return out;
}

/** يغير صف مخزن غير رئيسي (الإجمالي يتغير بره). يرفض السالب. */
export async function bumpRow(tx: Core, warehouseId: string, variantId: string, delta: number) {
  const [row] = await tx.from(t.warehouseStock, and(eq(t.warehouseStock.warehouseId, warehouseId), eq(t.warehouseStock.variantId, variantId))!).limit(1);
  const next = (row?.quantity ?? 0) + delta;
  if (next < 0) throw new WarehouseError("الكمية في المخزن أقل من المطلوب.");
  if (row) await tx.update(t.warehouseStock, { quantity: next }, and(eq(t.warehouseStock.warehouseId, warehouseId), eq(t.warehouseStock.variantId, variantId))!);
  else if (next > 0) await tx.insert(t.warehouseStock, { warehouseId, variantId, quantity: next });
}

/** يطبق تغيير كمية على مخزن (يغير الإجمالي أيضاً) مع حركة مخزون. delta موجب/سالب. */
export async function applyWarehouseDelta(tx: Core, o: { warehouseId: string | null; variantId: string; delta: number; reason: "transfer" | "stocktake" | "purchase" | "purchase_return" | "order" | "return" | "cancel" | "manual" | "writeoff" | "substitute"; note: string; actorUserId?: string | null; orderId?: string | null }) {
  const def = o.warehouseId ? (await tx.from(t.warehouses, eq(t.warehouses.id, o.warehouseId)).limit(1))[0] : null;
  const nonDefault = def && !def.isDefault ? def.id : null;
  if (nonDefault) await bumpRow(tx, nonDefault, o.variantId, o.delta);
  const [v] = await tx.from(t.productVariants, eq(t.productVariants.id, o.variantId)).limit(1);
  if (!v) throw new WarehouseError("متغير غير موجود.");
  if (v.stock + o.delta < 0) throw new WarehouseError("المخزون أقل من المطلوب.");
  await tx.update(t.productVariants, { stock: v.stock + o.delta }, eq(t.productVariants.id, o.variantId));
  await tx.insert(t.stockMovements, { variantId: o.variantId, delta: o.delta, reason: o.reason, orderId: o.orderId ?? null, warehouseId: o.warehouseId, note: o.note, actorUserId: o.actorUserId ?? null });
}

const attempt = async <T>(fn: () => Promise<Result<T>>): Promise<Result<T>> => {
  try { return await fn(); } catch (e) { if (e instanceof WarehouseError) return fail(e.message); throw e; }
};
const assertOpen = (w: { name: string; isLocked: boolean; isActive: boolean } | undefined) => {
  if (!w || !w.isActive) throw new WarehouseError("المخزن غير موجود أو موقوف.");
  if (w.isLocked) throw new WarehouseError(`المخزن «${w.name}» مقفول أثناء الجرد.`);
  return w;
};

// ===== التحويل بين المخازن =====

const transferSchema = z.object({
  fromWarehouseId: z.string().min(1, "اختار مخزن المصدر"), toWarehouseId: z.string().min(1, "اختار مخزن الوجهة"),
  note: z.string().trim().max(300).nullish().transform((v) => v || null),
  items: z.array(z.object({ variantId: z.string().min(1), quantity: z.number().int("الكمية رقم صحيح").min(1, "الكمية 1 على الأقل").max(1_000_000) })).min(1, "أضف منتج واحد على الأقل").max(100),
}).refine((v) => v.fromWarehouseId !== v.toWarehouseId, { message: "المصدر والوجهة لازم يكونوا مخزنين مختلفين", path: ["toWarehouseId"] });

export async function createTransfer(scope: StoreScope, input: unknown): Promise<Result<{ id: string; number: number }>> {
  const p = transferSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  return attempt(() => scope.transaction(async (tx) => {
    const ws = await tx.from(t.warehouses, inArray(t.warehouses.id, [p.data.fromWarehouseId, p.data.toWarehouseId]));
    if (ws.length !== 2 || ws.some((w) => !w.isActive)) throw new WarehouseError("المخزن غير موجود أو موقوف.");
    const vs = await tx.from(t.productVariants, inArray(t.productVariants.id, p.data.items.map((i) => i.variantId)));
    if (vs.length !== new Set(p.data.items.map((i) => i.variantId)).size) throw new WarehouseError("أحد المنتجات غير موجود.");
    const last = (await tx.from(t.stockTransfers).orderBy(t.stockTransfers.number)).at(-1);
    const [tr] = await tx.insert(t.stockTransfers, { number: (last?.number ?? 0) + 1, fromWarehouseId: p.data.fromWarehouseId, toWarehouseId: p.data.toWarehouseId, note: p.data.note });
    await tx.insert(t.stockTransferItems, p.data.items.map((i) => ({ transferId: tr!.id, variantId: i.variantId, quantity: i.quantity })));
    return ok({ id: tr!.id, number: tr!.number });
  }));
}

async function loadTransfer(tx: Core, id: string) {
  const [tr] = await tx.from(t.stockTransfers, eq(t.stockTransfers.id, id)).limit(1);
  if (!tr) throw new WarehouseError("ما لقينا التحويل. حدّث الصفحة.");
  const items = await tx.from(t.stockTransferItems, eq(t.stockTransferItems.transferId, id));
  return { tr, items };
}

/** إرسال: البضاعة تطلع من المصدر فوراً (تبقى «في الطريق» لين الاستلام) */
export function sendTransfer(scope: StoreScope, id: string, actorUserId?: string | null): Promise<Result> {
  return attempt(() => scope.transaction(async (tx) => {
    const { tr, items } = await loadTransfer(tx, id);
    if (tr.status !== "draft") throw new WarehouseError("التحويل اتبعت قبل كذا.");
    const [from] = await tx.from(t.warehouses, eq(t.warehouses.id, tr.fromWarehouseId)).limit(1);
    assertOpen(from);
    const avail = await quantitiesIn(tx, tr.fromWarehouseId, items.map((i) => i.variantId));
    for (const i of items) if ((avail.get(i.variantId) ?? 0) < i.quantity) throw new WarehouseError("الكمية في مخزن المصدر أقل من المطلوب.");
    for (const i of items) await applyWarehouseDelta(tx, { warehouseId: tr.fromWarehouseId, variantId: i.variantId, delta: -i.quantity, reason: "transfer", note: `تحويل #${tr.number} (إرسال)`, actorUserId });
    await tx.update(t.stockTransfers, { status: "in_transit" }, eq(t.stockTransfers.id, id));
    return ok(undefined);
  }));
}

export function receiveTransfer(scope: StoreScope, id: string, actorUserId?: string | null): Promise<Result> {
  return attempt(() => scope.transaction(async (tx) => {
    const { tr, items } = await loadTransfer(tx, id);
    if (tr.status !== "in_transit") throw new WarehouseError("التحويل مش في الطريق.");
    const [to] = await tx.from(t.warehouses, eq(t.warehouses.id, tr.toWarehouseId)).limit(1);
    assertOpen(to);
    for (const i of items) await applyWarehouseDelta(tx, { warehouseId: tr.toWarehouseId, variantId: i.variantId, delta: i.quantity, reason: "transfer", note: `تحويل #${tr.number} (استلام)`, actorUserId });
    await tx.update(t.stockTransfers, { status: "received" }, eq(t.stockTransfers.id, id));
    return ok(undefined);
  }));
}

export function cancelTransfer(scope: StoreScope, id: string, actorUserId?: string | null): Promise<Result> {
  return attempt(() => scope.transaction(async (tx) => {
    const { tr, items } = await loadTransfer(tx, id);
    if (tr.status === "received" || tr.status === "cancelled") throw new WarehouseError("ما ينفعش تلغي هذا التحويل.");
    if (tr.status === "in_transit") for (const i of items) await applyWarehouseDelta(tx, { warehouseId: tr.fromWarehouseId, variantId: i.variantId, delta: i.quantity, reason: "transfer", note: `تحويل #${tr.number} (إلغاء ورجوع)`, actorUserId });
    await tx.update(t.stockTransfers, { status: "cancelled" }, eq(t.stockTransfers.id, id));
    return ok(undefined);
  }));
}

export async function listTransfers(scope: StoreScope) {
  const [trs, items, ws] = await Promise.all([scope.from(t.stockTransfers).orderBy(t.stockTransfers.number), scope.from(t.stockTransferItems), scope.from(t.warehouses)]);
  const name = new Map(ws.map((w) => [w.id, w.name]));
  return trs.reverse().map((x) => ({ id: x.id, number: x.number, status: x.status, from: name.get(x.fromWarehouseId) ?? "؟", to: name.get(x.toWarehouseId) ?? "؟", units: items.filter((i) => i.transferId === x.id).reduce((s, i) => s + i.quantity, 0), at: x.createdAt.getTime(), note: x.note }));
}

// ===== الجرد =====

/** فتح جرد: كامل، أو جزئي بقسم (categoryId) أو رف (shelf) */
export function openStocktake(scope: StoreScope, input: { warehouseId: string; lock?: boolean; note?: string | null; categoryId?: string | null; shelf?: string | null }): Promise<Result<{ id: string }>> {
  return attempt(() => scope.transaction(async (tx) => {
    const [w] = await tx.from(t.warehouses, eq(t.warehouses.id, input.warehouseId)).limit(1);
    assertOpen(w);
    if ((await tx.count(t.stocktakes, and(eq(t.stocktakes.warehouseId, input.warehouseId), eq(t.stocktakes.status, "open"))!)) > 0) throw new WarehouseError("فيه جرد مفتوح لهذا المخزن. كمّله أو أغلقه أول.");
    let products = await tx.from(t.products, and(isNull(t.products.deletedAt), eq(t.products.kind, "simple"))!);
    const shelf = input.shelf?.trim() || null;
    if (input.categoryId) {
      const links = await tx.from(t.productCategories, eq(t.productCategories.categoryId, input.categoryId));
      const ids = new Set(links.map((l) => l.productId));
      products = products.filter((p) => ids.has(p.id));
    }
    if (shelf) products = products.filter((p) => p.shelf === shelf);
    if ((input.categoryId || shelf) && !products.length) throw new WarehouseError("ما فيه منتجات في القسم أو الرف هذا.");
    const variants = products.length ? await tx.from(t.productVariants, inArray(t.productVariants.productId, products.map((p) => p.id))) : [];
    const qty = await quantitiesIn(tx, input.warehouseId, variants.map((v) => v.id));
    const [st] = await tx.insert(t.stocktakes, { warehouseId: input.warehouseId, lockWarehouse: !!input.lock, note: input.note?.trim() || null, categoryId: input.categoryId ?? null, shelf });
    if (variants.length) await tx.insert(t.stocktakeItems, variants.map((v) => ({ stocktakeId: st!.id, variantId: v.id, expected: qty.get(v.id) ?? 0 })));
    if (input.lock) await tx.update(t.warehouses, { isLocked: true }, eq(t.warehouses.id, input.warehouseId));
    return ok({ id: st!.id });
  }));
}

export function saveCounts(scope: StoreScope, stocktakeId: string, counts: unknown): Promise<Result<{ saved: number }>> {
  const p = z.array(z.object({ variantId: z.string().min(1), counted: z.number().int("الكمية رقم صحيح").min(0, "الكمية 0 أو أكثر").max(1_000_000).nullable() })).max(2000).safeParse(counts);
  if (!p.success) return Promise.resolve(fail(firstError(p.error)));
  return attempt(() => scope.transaction(async (tx) => {
    const [st] = await tx.from(t.stocktakes, eq(t.stocktakes.id, stocktakeId)).limit(1);
    if (!st || st.status !== "open") throw new WarehouseError("الجرد مقفول أو غير موجود.");
    let saved = 0;
    for (const c of p.data) {
      const rows = await tx.update(t.stocktakeItems, { counted: c.counted }, and(eq(t.stocktakeItems.stocktakeId, stocktakeId), eq(t.stocktakeItems.variantId, c.variantId))!);
      saved += rows.length;
    }
    return ok({ saved });
  }));
}

/** إقفال الجرد: الفرق بين المعدود والرصيد الحالي يتسجل كحركة بسبب «جرد» */
export function closeStocktake(scope: StoreScope, stocktakeId: string, actorUserId?: string | null): Promise<Result<{ adjusted: number; value: number }>> {
  return attempt(() => scope.transaction(async (tx) => {
    const [st] = await tx.from(t.stocktakes, eq(t.stocktakes.id, stocktakeId)).limit(1);
    if (!st || st.status !== "open") throw new WarehouseError("الجرد مقفول أو غير موجود.");
    const items = await tx.from(t.stocktakeItems, eq(t.stocktakeItems.stocktakeId, stocktakeId));
    const counted = items.filter((i) => i.counted !== null);
    const now = await quantitiesIn(tx, st.warehouseId, counted.map((i) => i.variantId));
    let adjusted = 0, value = 0;
    const vs = counted.length ? await tx.from(t.productVariants, inArray(t.productVariants.id, counted.map((i) => i.variantId))) : [];
    const ps = vs.length ? await tx.from(t.products, inArray(t.products.id, [...new Set(vs.map((v) => v.productId))])) : [];
    for (const i of counted) {
      const diff = i.counted! - (now.get(i.variantId) ?? 0);
      if (diff === 0) continue;
      await applyWarehouseDelta(tx, { warehouseId: st.warehouseId, variantId: i.variantId, delta: diff, reason: "stocktake", note: `جرد: متوقع ${i.expected}، فعلي ${i.counted}`, actorUserId });
      const v = vs.find((x) => x.id === i.variantId), p = ps.find((x) => x.id === v?.productId);
      value += Math.round((diff * (v?.costPrice ?? p?.costPrice ?? 0)) / (p?.soldBy === "weight" ? 1000 : 1));
      adjusted++;
    }
    await tx.update(t.stocktakes, { status: "closed", closedAt: new Date(), settledBy: actorUserId ?? null }, eq(t.stocktakes.id, stocktakeId));
    if (st.lockWarehouse) await tx.update(t.warehouses, { isLocked: false }, eq(t.warehouses.id, st.warehouseId));
    return ok({ adjusted, value });
  }));
}

export async function getStocktake(scope: StoreScope, id: string) {
  const [st] = await scope.from(t.stocktakes, eq(t.stocktakes.id, id)).limit(1);
  if (!st) return null;
  const items = await scope.from(t.stocktakeItems, eq(t.stocktakeItems.stocktakeId, id));
  const variants = items.length ? await scope.from(t.productVariants, inArray(t.productVariants.id, items.map((i) => i.variantId))) : [];
  const products = variants.length ? await scope.from(t.products, inArray(t.products.id, [...new Set(variants.map((v) => v.productId))])) : [];
  const pName = new Map(products.map((p) => [p.id, p.name]));
  return { ...st, items: items.map((i) => ({ variantId: i.variantId, name: pName.get(variants.find((v) => v.id === i.variantId)?.productId ?? "") ?? "؟", expected: i.expected, counted: i.counted })) };
}

export async function listStocktakes(scope: StoreScope) {
  const [sts, ws] = await Promise.all([scope.from(t.stocktakes).orderBy(t.stocktakes.createdAt), scope.from(t.warehouses)]);
  const name = new Map(ws.map((w) => [w.id, w.name]));
  return sts.reverse().map((s) => ({ id: s.id, warehouse: name.get(s.warehouseId) ?? "؟", status: s.status, at: s.createdAt.getTime(), locked: s.lockWarehouse }));
}

// ===== قيمة المخزون =====

export async function inventoryValue(scope: StoreScope) {
  const [ws, variants, products, rows] = await Promise.all([
    scope.from(t.warehouses).orderBy(t.warehouses.createdAt), scope.from(t.productVariants), scope.from(t.products, isNull(t.products.deletedAt)), scope.from(t.warehouseStock),
  ]);
  const pById = new Map(products.map((p) => [p.id, p]));
  const value = (v: (typeof variants)[number], qty: number) => {
    const p = pById.get(v.productId);
    if (!p || p.kind === "bundle") return { cost: 0, retail: 0, units: 0 };
    return { cost: qty * (v.costPrice ?? p.costPrice ?? 0), retail: qty * (v.price ?? p.price), units: qty };
  };
  return ws.map((w) => {
    let cost = 0, retail = 0, units = 0;
    for (const v of variants) {
      const mine = rows.filter((r) => r.variantId === v.id);
      const qty = w.isDefault ? Math.max(0, v.stock - mine.reduce((s, r) => s + r.quantity, 0)) : mine.find((r) => r.warehouseId === w.id)?.quantity ?? 0;
      const x = value(v, qty); cost += x.cost; retail += x.retail; units += x.units;
    }
    return { warehouseId: w.id, name: w.name, isDefault: w.isDefault, units, cost, retail };
  });
}

/** فحص سلامة: كمية الرئيسي ما تكونش سالبة (إجمالي أقل من مجموع باقي المخازن) */
export async function findStockInconsistencies(scope: StoreScope) {
  const [variants, rows] = await Promise.all([scope.from(t.productVariants), scope.from(t.warehouseStock)]);
  return variants.filter((v) => rows.filter((r) => r.variantId === v.id).reduce((s, r) => s + r.quantity, 0) > v.stock).map((v) => v.id);
}
