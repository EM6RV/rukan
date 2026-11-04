"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Feature } from "@/lib/entitlements";
import type { Permission } from "@/server/permissions";
import { hasPermission } from "@/server/permissions";
import { fail, type Result } from "@/server/catalog/result";
import { closeStocktake, openStocktake } from "@/server/inventory/warehouses";
import { isModuleOn } from "@/server/modules";
import { marketCan } from "@/server/market/access";
import { addBatch, deleteBatch, writeOff } from "@/server/market/batches";
import { addGroceryCategories, generateInternalBarcode, generateMissingBarcodes, saveMarketProduct } from "@/server/market/catalog";
import { applySubstitute, markPrepared, pickByScan, proposeSubstitute, setPicked } from "@/server/market/prep";
import { deletePromotion, savePromotion, setPromotionActive } from "@/server/market/promotions";
import { cancelPurchaseOrder, createPurchaseOrder, markPurchaseOrderSent, purchaseOrderToInvoice } from "@/server/market/purchase-orders";
import { addStocktakeCount, type CountResult } from "@/server/market/stocktake";
import { posConfigOf } from "@/server/pos/sync";
import { auditStore } from "@/server/store-audit";
import { lineActionContext, type StoreContext } from "@/server/store-context";
import { t } from "@/server/tenant";

const LOCKED: Partial<Record<Feature, string>> = {
  wholesale: "أسعار الجملة مش في باقة رُكن ماركت الحالية.",
  batches: "الصلاحية والدفعات مش في باقة رُكن ماركت الحالية.",
  promotions: "العروض التلقائية مش في باقة رُكن ماركت الحالية.",
  onlineOrders: "تجهيز الطلبيات الأونلاين مش في باقة رُكن ماركت الحالية.",
};

/** أكشن ماركت: اشتراك المنظومة ساري + الصلاحية + الميزة في الباقة (لو محددة) + سجل النشاط */
async function run<T>(perm: Permission, action: string, fn: (ctx: StoreContext) => Promise<Result<T>>, o: { feature?: Feature; path?: string; meta?: Record<string, unknown> } = {}): Promise<Result<T>> {
  const auth = await lineActionContext("market", perm, { write: true });
  if (!auth.ok) return auth;
  if (o.feature && !marketCan(auth.ctx.lines, o.feature)) return fail(LOCKED[o.feature] ?? "الميزة هذي مش في باقتك.");
  const r = await fn(auth.ctx);
  if (r.ok) {
    void auditStore(auth.ctx, action, { meta: o.meta });
    revalidatePath(o.path ?? "/dashboard/market", "layout");
  }
  return r;
}

const scaleOf = async (ctx: StoreContext) => posConfigOf((await ctx.scope.from(t.storeSettings).limit(1))[0]?.posConfig).scale;

// ===== المنتجات والباركود =====
export async function saveMarketProductAction(input: unknown) {
  return run("products", "market.product", (c) => saveMarketProduct(c.scope, input, { wholesale: marketCan(c.lines, "wholesale") }));
}
export async function generateBarcodeAction(variantId: string, unitId: string | null) {
  return run("products", "market.barcode", (c) => generateInternalBarcode(c.scope, String(variantId), unitId ? String(unitId) : null));
}
export async function generateMissingBarcodesAction(productIds: string[]) {
  const ids = Array.isArray(productIds) ? productIds.map(String).slice(0, 300) : [];
  return run("products", "market.barcode", (c) => generateMissingBarcodes(c.scope, ids));
}
export async function groceryCategoriesAction() {
  return run("categories", "categories.write", (c) => addGroceryCategories(c.scope));
}

// ===== الدفعات والإتلاف =====
export async function addBatchAction(input: unknown) {
  return run("products", "market.batch", (c) => addBatch(c.scope, input), { feature: "batches" });
}
export async function deleteBatchAction(id: string) {
  return run("products", "market.batch_delete", (c) => deleteBatch(c.scope, String(id)), { feature: "batches" });
}
export async function writeOffAction(input: unknown) {
  return run("products", "market.writeoff", (c) => writeOff(c.scope, input, c.user.id), { meta: input as Record<string, unknown> });
}

// ===== العروض =====
export async function savePromotionAction(input: unknown) {
  return run("marketing", "market.promotion", (c) => savePromotion(c.scope, input), { feature: "promotions" });
}
export async function togglePromotionAction(id: string, active: boolean) {
  return run("marketing", "market.promotion", (c) => setPromotionActive(c.scope, String(id), !!active), { feature: "promotions" });
}
export async function deletePromotionAction(id: string) {
  return run("marketing", "market.promotion_delete", (c) => deletePromotion(c.scope, String(id)), { feature: "promotions" });
}

// ===== طلبات الشراء =====
const purchasingOn = (c: StoreContext) => isModuleOn(c.store, c.limits, "purchasing");
export async function createPurchaseOrderAction(input: unknown) {
  return run("products", "market.po", async (c) => (purchasingOn(c) ? createPurchaseOrder(c.scope, input, c.user.id) : fail("فعّل وحدة المشتريات أول.")));
}
export async function sentPurchaseOrderAction(id: string) {
  return run("products", "market.po_sent", (c) => markPurchaseOrderSent(c.scope, String(id)));
}
export async function cancelPurchaseOrderAction(id: string) {
  return run("products", "market.po_cancel", (c) => cancelPurchaseOrder(c.scope, String(id)));
}
export async function purchaseOrderToInvoiceAction(id: string) {
  return run("products", "market.po_invoice", async (c) => (purchasingOn(c) ? purchaseOrderToInvoice(c.scope, String(id)) : fail("فعّل وحدة المشتريات أول.")));
}

// ===== الجرد بالمسح =====
const openSchema = z.object({ warehouseId: z.string().min(1), categoryId: z.string().min(1).nullish(), shelf: z.string().trim().max(30).nullish(), lock: z.boolean().default(false) });
export async function openScanStocktakeAction(input: unknown) {
  const p = openSchema.safeParse(input);
  if (!p.success) return fail("اختار المخزن.");
  return run("products", "market.stocktake_open", (c) => openStocktake(c.scope, { warehouseId: p.data.warehouseId, categoryId: p.data.categoryId ?? null, shelf: p.data.shelf ?? null, lock: p.data.lock }));
}
export async function stocktakeCountAction(stocktakeId: string, input: unknown): Promise<Result<CountResult>> {
  const auth = await lineActionContext("market", "products", { write: true });
  if (!auth.ok) return auth;
  return addStocktakeCount(auth.ctx.scope, String(stocktakeId), input, auth.ctx.user.id, await scaleOf(auth.ctx));
}
/** تسوية الجرد (اعتماد الفروقات): تحتاج صلاحية موافقة المشرف زيادة على المنتجات */
export async function settleStocktakeAction(stocktakeId: string) {
  return run("products", "market.stocktake_settle", async (c) => {
    if (!hasPermission({ role: c.role, customPermissions: c.customPermissions }, "pos_approve")) return fail("اعتماد فروقات الجرد يحتاج صلاحية موافقة المشرف.");
    return closeStocktake(c.scope, String(stocktakeId), c.user.id);
  });
}

// ===== تجهيز الطلبيات =====
const PREP = { feature: "onlineOrders" as const };
export async function pickScanAction(orderId: string, code: string) {
  const auth = await lineActionContext("market", "orders", { write: true });
  if (!auth.ok) return auth;
  if (!marketCan(auth.ctx.lines, "onlineOrders")) return fail(LOCKED.onlineOrders!);
  return pickByScan(auth.ctx.scope, String(orderId), String(code).slice(0, 40), auth.ctx.user.id, await scaleOf(auth.ctx));
}
export async function setPickedAction(orderId: string, itemId: string, picked: number) {
  return run("orders", "market.prep", (c) => setPicked(c.scope, String(orderId), String(itemId), Number(picked)), PREP);
}
export async function markPreparedAction(orderId: string, force: boolean) {
  return run("orders", "market.prep_ready", (c) => markPrepared(c.scope, String(orderId), c.user.id, !!force), PREP);
}
export async function proposeSubstituteAction(itemId: string, variantId: string | null, note: string | null) {
  return run("orders", "market.substitute", (c) => proposeSubstitute(c.scope, String(itemId), variantId ? String(variantId) : null, note ? String(note) : null, c.store.name), PREP);
}
export async function applySubstituteAction(itemId: string) {
  return run("orders", "market.substitute_apply", (c) => applySubstitute(c.scope, String(itemId), c.user.id), PREP);
}
