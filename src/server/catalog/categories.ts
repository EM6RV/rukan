import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { slugify, uniqueSlug } from "@/lib/slugify";
import { firstError } from "@/lib/validation";
import { isFkViolation } from "../db-errors";
import type { StoreScope } from "../tenant";
import { t } from "../tenant";
import { fail, ok, type Result } from "./result";

export const categoryInputSchema = z.object({
  id: z.string().optional(),
  name: z.string({ error: "اكتب اسم القسم" }).trim().min(1, "اكتب اسم القسم").max(60, "اسم القسم طويل بزيادة"),
  description: z.string().trim().max(300, "الوصف طويل بزيادة").nullish().transform((v) => v || null),
  imageMediaId: z.string().min(1).nullish().transform((v) => v ?? null),
  isVisible: z.boolean().default(true),
});
export type CategoryInput = z.input<typeof categoryInputSchema>;

export async function listCategories(scope: StoreScope) {
  const [cats, links] = await Promise.all([scope.from(t.categories).orderBy(t.categories.position, t.categories.createdAt), scope.from(t.productCategories)]);
  const counts = new Map<string, number>();
  for (const l of links) counts.set(l.categoryId, (counts.get(l.categoryId) ?? 0) + 1);
  return cats.map((c) => ({ ...c, productCount: counts.get(c.id) ?? 0 }));
}

export async function saveCategory(scope: StoreScope, input: unknown): Promise<Result<{ id: string }>> {
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { id, ...data } = parsed.data;

  try {
    if (id) {
      const [row] = await scope.update(t.categories, data, eq(t.categories.id, id));
      return row ? ok({ id: row.id }) : fail("القسم غير موجود.");
    }
    const existing = await scope.from(t.categories);
    const slug = uniqueSlug(slugify(data.name) || "category", new Set(existing.map((c) => c.slug)));
    const position = existing.reduce((m, c) => Math.max(m, c.position), -1) + 1;
    const [row] = await scope.insert(t.categories, { ...data, slug, position });
    return ok({ id: row!.id });
  } catch (e) {
    if (isFkViolation(e)) return fail("الصورة غير صحيحة، ارفعها من جديد.");
    throw e;
  }
}

export async function deleteCategory(scope: StoreScope, id: string): Promise<Result> {
  const rows = await scope.delete(t.categories, eq(t.categories.id, id)); // product_categories تتمسح بالـ cascade
  return rows.length ? ok(undefined) : fail("القسم غير موجود.");
}

export async function reorderCategories(scope: StoreScope, orderedIds: string[]): Promise<Result> {
  const existing = await scope.from(t.categories, inArray(t.categories.id, orderedIds));
  if (existing.length !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length) return fail("ترتيب غير صحيح.");
  await scope.transaction(async (tx) => {
    for (const [position, id] of orderedIds.entries()) {
      await tx.update(t.categories, { position }, and(eq(t.categories.id, id)));
    }
  });
  return ok(undefined);
}
