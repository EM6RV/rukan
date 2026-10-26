// مكتبة الكتالوج: البراندات، مكتبة الخيارات (مقاسات/ألوان جاهزة)، والوسوم.
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { slugify, uniqueSlug } from "@/lib/slugify";
import { firstError } from "@/lib/validation";
import { isUniqueViolation } from "../db-errors";
import { t, type StoreScope } from "../tenant";
import { fail, ok, type Result } from "./result";

const nameField = (what: string) => z.string({ error: `اكتب اسم ${what}` }).trim().min(1, `اكتب اسم ${what}`).max(60, `اسم ${what} طويل بزيادة`);

// ===== البراندات =====

export async function listBrands(scope: StoreScope) {
  const [brands, products] = await Promise.all([
    scope.from(t.brands).orderBy(t.brands.name),
    scope.from(t.products, isNull(t.products.deletedAt)),
  ]);
  return brands.map((b) => ({ id: b.id, name: b.name, slug: b.slug, productCount: products.filter((p) => p.brandId === b.id).length }));
}

export async function saveBrand(scope: StoreScope, input: unknown): Promise<Result<{ id: string }>> {
  const p = z.object({ id: z.string().optional(), name: nameField("البراند") }).safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const existing = await scope.from(t.brands);
  if (existing.some((b) => b.name.toLowerCase() === p.data.name.toLowerCase() && b.id !== p.data.id)) return fail("عندك براند بنفس الاسم.");
  try {
    if (p.data.id) {
      const [row] = await scope.update(t.brands, { name: p.data.name }, eq(t.brands.id, p.data.id));
      return row ? ok({ id: row.id }) : fail("ما لقينا البراند. حدّث الصفحة.");
    }
    const slug = uniqueSlug(slugify(p.data.name) || "brand", new Set(existing.map((b) => b.slug)));
    const [row] = await scope.insert(t.brands, { name: p.data.name, slug });
    return ok({ id: row!.id });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("عندك براند بنفس الاسم.");
    throw e;
  }
}

export async function deleteBrand(scope: StoreScope, id: string): Promise<Result> {
  const rows = await scope.transaction(async (tx) => {
    await tx.update(t.products, { brandId: null }, eq(t.products.brandId, id)); // المنتجات تبقى بدون براند
    return tx.delete(t.brands, eq(t.brands.id, id));
  });
  return rows.length ? ok(undefined) : fail("ما لقينا البراند. حدّث الصفحة.");
}

// ===== مكتبة الخيارات =====

const presetSchema = z.object({
  id: z.string().optional(),
  name: nameField("الخيار"),
  values: z.array(z.object({
    value: z.string().trim().min(1, "اكتب قيمة الخيار").max(40, "قيمة الخيار طويلة"),
    colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "لون غير صحيح").nullish().transform((v) => v ?? null),
  })).min(1, "أضف قيمة وحدة على الأقل").max(30, "قيم كثيرة"),
}).superRefine((p, ctx) => {
  if (new Set(p.values.map((v) => v.value.toLowerCase())).size !== p.values.length) ctx.addIssue({ code: "custom", message: "قيم مكررة" });
});

export async function listOptionPresets(scope: StoreScope) {
  return (await scope.from(t.optionPresets).orderBy(t.optionPresets.name)).map((p) => ({ id: p.id, name: p.name, values: p.values }));
}

export async function saveOptionPreset(scope: StoreScope, input: unknown): Promise<Result<{ id: string }>> {
  const p = presetSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, ...data } = p.data;
  try {
    if (id) {
      const [row] = await scope.update(t.optionPresets, data, eq(t.optionPresets.id, id));
      return row ? ok({ id: row.id }) : fail("ما لقينا الخيار. حدّث الصفحة.");
    }
    const [row] = await scope.insert(t.optionPresets, data);
    return ok({ id: row!.id });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("عندك خيار بنفس الاسم في المكتبة.");
    throw e;
  }
}

export async function deleteOptionPreset(scope: StoreScope, id: string): Promise<Result> {
  const rows = await scope.delete(t.optionPresets, eq(t.optionPresets.id, id));
  return rows.length ? ok(undefined) : fail("ما لقينا الخيار. حدّث الصفحة.");
}

// ===== الوسوم =====

export const tagsSchema = z.array(z.string().trim().min(1).max(30, "الوسم طويل (30 حرف)")).max(10, "الحد الأقصى 10 وسوم").default([])
  .transform((tags) => [...new Set(tags.map((x) => x.replace(/^#/, "").trim()).filter(Boolean))]);

export async function listTags(scope: StoreScope): Promise<{ tag: string; count: number }[]> {
  const rows = await scope.from(t.productTags);
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.tag, (counts.get(r.tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** وسوم منتجات محددة */
export async function tagsOf(scope: StoreScope, productIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!productIds.length) return out;
  for (const r of await scope.from(t.productTags, inArray(t.productTags.productId, productIds))) out.set(r.productId, [...(out.get(r.productId) ?? []), r.tag]);
  return out;
}

export async function brandBelongs(scope: StoreScope, brandId: string): Promise<boolean> {
  return (await scope.count(t.brands, and(eq(t.brands.id, brandId))!)) > 0;
}
