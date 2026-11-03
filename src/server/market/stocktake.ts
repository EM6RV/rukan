// الجرد بالمسح (قارئ أو كاميرا): أكثر من عدّاد في نفس الوقت، كل مسح يتسجل سطر (clientId يمنع التكرار)،
// والمعدود لكل صنف = مجموع مسحاته. تقرير الفروقات والتسوية (اعتماد الفروقات) بصلاحية.
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { ScaleConfig } from "@/lib/barcode";
import { firstError } from "@/lib/validation";
import { fail, ok, type Result } from "../catalog/result";
import { isUniqueViolation } from "../db-errors";
import { quantitiesIn } from "../inventory/warehouses";
import { t, type StoreScope } from "../tenant";
import { lookupBarcode } from "./catalog";

const countSchema = z.object({
  clientId: z.string().regex(/^[\w-]{8,64}$/, "معرّف غير صحيح"),
  code: z.string().trim().min(1).max(40).nullish(),
  variantId: z.string().min(1).nullish(),
  /** الكمية (بالوحدة اللي اتمسحت: كرتونة = المعامل × الكمية). للموزون بالجرام */
  quantity: z.number().int("الكمية رقم صحيح").min(-100_000, "الكمية غير صحيحة").max(1_000_000).refine((n) => n !== 0, "الكمية ما تكونش صفر"),
});

export type CountResult = { variantId: string; name: string; added: number; counted: number; duplicate: boolean };

/** يسجل مسحة في الجرد (سالب = تصحيح). المعدود الجديد يتحدث في سطر الجرد */
export async function addStocktakeCount(scope: StoreScope, stocktakeId: string, input: unknown, userId: string | null, scale?: ScaleConfig): Promise<Result<CountResult>> {
  const p = countSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  if (!p.data.code && !p.data.variantId) return fail("امسح الباركود أو اختار الصنف.");
  const [st] = await scope.from(t.stocktakes, eq(t.stocktakes.id, stocktakeId)).limit(1);
  if (!st || st.status !== "open") return fail("الجرد مقفول أو غير موجود.");
  let variantId = p.data.variantId ?? null, qty = p.data.quantity;
  if (p.data.code) {
    const hit = await lookupBarcode(scope, p.data.code, scale);
    if (!hit) return fail(`الباركود ${p.data.code} مش مسجّل على أي منتج.`);
    variantId = hit.variantId;
    qty = hit.grams ?? qty * hit.factor;
  }
  const [v] = await scope.from(t.productVariants, eq(t.productVariants.id, variantId!)).limit(1);
  const [prod] = v ? await scope.from(t.products, eq(t.products.id, v.productId)).limit(1) : [];
  if (!v || !prod) return fail("ما لقينا الصنف.");
  try {
    return await scope.transaction(async (tx) => {
      await tx.insert(t.stocktakeCounts, { stocktakeId, variantId: v.id, quantity: qty, userId, clientId: p.data.clientId });
      const rows = await tx.from(t.stocktakeCounts, and(eq(t.stocktakeCounts.stocktakeId, stocktakeId), eq(t.stocktakeCounts.variantId, v.id))!);
      const counted = Math.max(0, rows.reduce((s, r) => s + r.quantity, 0));
      const cond = and(eq(t.stocktakeItems.stocktakeId, stocktakeId), eq(t.stocktakeItems.variantId, v.id))!;
      const [item] = await tx.from(t.stocktakeItems, cond).limit(1);
      if (item) await tx.update(t.stocktakeItems, { counted }, cond);
      else {
        // صنف برّا نطاق الجرد الجزئي (لقيناه على الرف): يدخل الجرد برصيده الحالي
        const expected = (await quantitiesIn(tx, st.warehouseId, [v.id])).get(v.id) ?? 0;
        await tx.insert(t.stocktakeItems, { stocktakeId, variantId: v.id, expected, counted });
      }
      return ok({ variantId: v.id, name: prod.name, added: qty, counted, duplicate: false });
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // نفس المسحة وصلت مرتين (النت قطع): نرجعوا الحالة بدون ما نزيدوا
    const [item] = await scope.from(t.stocktakeItems, and(eq(t.stocktakeItems.stocktakeId, stocktakeId), eq(t.stocktakeItems.variantId, v.id))!).limit(1);
    return ok({ variantId: v.id, name: prod.name, added: 0, counted: item?.counted ?? 0, duplicate: true });
  }
}

export type VarianceRow = { variantId: string; name: string; shelf: string | null; expected: number; counted: number | null; current: number; diff: number | null; diffValue: number | null; isWeighed: boolean; counters: number };

/** تقرير الفروقات: المعدود مقابل الرصيد الحالي (اللي يتسوى عند الاعتماد) وقيمته بالتكلفة */
export async function stocktakeVariance(scope: StoreScope, stocktakeId: string) {
  const [st] = await scope.from(t.stocktakes, eq(t.stocktakes.id, stocktakeId)).limit(1);
  if (!st) return null;
  const [items, counts] = await Promise.all([
    scope.from(t.stocktakeItems, eq(t.stocktakeItems.stocktakeId, stocktakeId)),
    scope.from(t.stocktakeCounts, eq(t.stocktakeCounts.stocktakeId, stocktakeId)),
  ]);
  const ids = items.map((i) => i.variantId);
  const [vs, now] = await Promise.all([
    ids.length ? scope.from(t.productVariants, inArray(t.productVariants.id, ids)) : Promise.resolve([]),
    st.status === "open" ? quantitiesIn(scope, st.warehouseId, ids) : Promise.resolve(new Map<string, number>()),
  ]);
  const ps = vs.length ? await scope.from(t.products, inArray(t.products.id, [...new Set(vs.map((v) => v.productId))])) : [];
  const rows: VarianceRow[] = items.map((i) => {
    const v = vs.find((x) => x.id === i.variantId), p = ps.find((x) => x.id === v?.productId);
    const current = st.status === "open" ? now.get(i.variantId) ?? 0 : i.expected;
    const diff = i.counted === null ? null : i.counted - current;
    const w = p?.soldBy === "weight" ? 1000 : 1;
    return {
      variantId: i.variantId, name: p?.name ?? "؟", shelf: p?.shelf ?? null, expected: i.expected, counted: i.counted, current, diff,
      diffValue: diff === null ? null : Math.round((diff * (v?.costPrice ?? p?.costPrice ?? 0)) / w), isWeighed: p?.soldBy === "weight",
      counters: new Set(counts.filter((c) => c.variantId === i.variantId).map((c) => c.userId)).size,
    };
  }).sort((a, b) => Math.abs(b.diffValue ?? 0) - Math.abs(a.diffValue ?? 0) || a.name.localeCompare(b.name, "ar"));
  const counted = rows.filter((r) => r.counted !== null);
  return {
    stocktake: { id: st.id, status: st.status, warehouseId: st.warehouseId, categoryId: st.categoryId, shelf: st.shelf, at: st.createdAt.getTime(), closedAt: st.closedAt?.getTime() ?? null, locked: st.lockWarehouse },
    rows,
    summary: {
      items: rows.length, counted: counted.length, withDiff: counted.filter((r) => r.diff !== 0).length,
      shortage: counted.filter((r) => (r.diffValue ?? 0) < 0).reduce((s, r) => s + r.diffValue!, 0),
      surplus: counted.filter((r) => (r.diffValue ?? 0) > 0).reduce((s, r) => s + r.diffValue!, 0),
      counters: new Set(counts.map((c) => c.userId)).size,
    },
  };
}
