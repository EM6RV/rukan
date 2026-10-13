"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseDecimal } from "@/lib/validation";
import {
  bulkUpdatePrices, bulkUpdateStock, deleteProducts, duplicateProduct, saveProduct, setProductFeatured, setProductsVisibility,
} from "@/server/catalog/products";
import { ImportError, MAX_IMPORT_BYTES, importProducts, parseProductRows, readRows, type ImportReport, type RowError } from "@/server/catalog/import";
import { fail, ok, type Result } from "@/server/catalog/result";
import { hitRateLimit } from "@/server/ratelimit";
import { getDb } from "@/db";
import { actionContext, type StoreContext } from "@/server/store-context";

async function run<T>(fn: (ctx: StoreContext) => Promise<Result<T>>): Promise<Result<T>> {
  const auth = await actionContext("products", { write: true });
  if (!auth.ok) return auth;
  const result = await fn(auth.ctx);
  if (result.ok) {
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard");
  }
  return result;
}

const ids = z.array(z.string().min(1)).min(1, "ما اخترت أي منتج.").max(200, "اختر 200 منتج أو أقل في المرة الوحدة.");

export async function saveProductAction(input: unknown) {
  return run((ctx) => saveProduct(ctx.scope, input, { limits: ctx.limits, actorUserId: ctx.user.id }));
}

export async function duplicateProductAction(id: string) {
  return run((ctx) => duplicateProduct(ctx.scope, id, { limits: ctx.limits, actorUserId: ctx.user.id }));
}

export async function setFeaturedAction(id: string, featured: boolean) {
  return run((ctx) => setProductFeatured(ctx.scope, id, featured));
}

export async function setVisibilityAction(productIds: string[], visible: boolean) {
  return run((ctx) => {
    const p = ids.safeParse(productIds);
    return p.success ? setProductsVisibility(ctx.scope, p.data, visible) : Promise.resolve(fail(p.error.issues[0]!.message));
  });
}

export async function deleteProductsAction(productIds: string[]) {
  return run((ctx) => {
    const p = ids.safeParse(productIds);
    return p.success ? deleteProducts(ctx.scope, p.data) : Promise.resolve(fail(p.error.issues[0]!.message));
  });
}

const priceOp = z.object({ mode: z.enum(["set", "percent", "add"]), value: z.union([z.string(), z.number()]) });
const stockOp = z.object({ mode: z.enum(["set", "add"]), value: z.union([z.string(), z.number()]) });
const num = (v: string | number) => (typeof v === "number" ? v : parseDecimal(v));

/** value بالدينار لـ set/add، ونسبة مئوية لـ percent */
export async function bulkPriceAction(productIds: string[], op: unknown) {
  return run((ctx) => {
    const p = ids.safeParse(productIds);
    const o = priceOp.safeParse(op);
    if (!p.success) return Promise.resolve(fail(p.error.issues[0]!.message));
    const value = o.success ? num(o.data.value) : null;
    if (!o.success || value === null) return Promise.resolve(fail("اكتب قيمة صحيحة."));
    return bulkUpdatePrices(ctx.scope, p.data, { mode: o.data.mode, value: o.data.mode === "percent" ? value : Math.round(value * 1000) });
  });
}

export async function bulkStockAction(productIds: string[], op: unknown) {
  return run((ctx) => {
    const p = ids.safeParse(productIds);
    const o = stockOp.safeParse(op);
    if (!p.success) return Promise.resolve(fail(p.error.issues[0]!.message));
    const value = o.success ? num(o.data.value) : null;
    if (!o.success || value === null) return Promise.resolve(fail("اكتب قيمة صحيحة."));
    return bulkUpdateStock(ctx.scope, p.data, { mode: o.data.mode, value }, ctx.user.id);
  });
}

// ===== الاستيراد =====

export type ImportPreview = { total: number; valid: number; errors: RowError[]; sample: { name: string; price: number; stock: number; category: string | null }[] };

async function readUpload(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ImportError("اختار ملف.");
  if (file.size > MAX_IMPORT_BYTES) throw new ImportError("الملف كبير بزيادة (الحد الأقصى 2 ميغا).");
  return parseProductRows(await readRows(file.name, Buffer.from(await file.arrayBuffer())));
}

export async function previewImportAction(formData: FormData): Promise<Result<ImportPreview>> {
  const auth = await actionContext("products", { write: true });
  if (!auth.ok) return auth;
  try {
    const parsed = await readUpload(formData);
    return ok({
      total: parsed.rows.length + parsed.errors.length, valid: parsed.rows.length, errors: parsed.errors.slice(0, 50),
      sample: parsed.rows.slice(0, 5).map((r) => ({ name: r.name, price: r.price, stock: r.stock, category: r.category })),
    });
  } catch (e) {
    if (e instanceof ImportError) return fail(e.message);
    throw e;
  }
}

export async function runImportAction(formData: FormData): Promise<Result<ImportReport>> {
  const auth = await actionContext("products", { write: true });
  if (!auth.ok) return auth;
  const { ctx } = auth;
  const limit = await hitRateLimit(getDb(), `import:user:${ctx.user.id}`, { limit: 10, windowMs: 60 * 60_000 });
  if (!limit.allowed) return fail("استوردت كثير. جرّب بعد شوية.");
  try {
    const parsed = await readUpload(formData);
    const report = await importProducts(ctx.scope, parsed, { limits: ctx.limits, actorUserId: ctx.user.id });
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/categories");
    revalidatePath("/dashboard");
    return ok(report);
  } catch (e) {
    if (e instanceof ImportError) return fail(e.message);
    throw e;
  }
}
