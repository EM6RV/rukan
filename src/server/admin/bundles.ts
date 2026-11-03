// حزم الدمج: خصم لما النشاط يجمع منظومتين أو أكثر. الخصم يتقترح في مبلغ الدفعة (الأدمن يقدر يعدّله).
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { lineBundles } from "@/db/schema/platform";
import { PRODUCT_LINES, type ProductLine } from "@/lib/product-lines";
import { firstError } from "@/lib/validation";
import { writeAudit } from "../audit";
import { fail, ok, type Result } from "../catalog/result";

export type LineBundle = typeof lineBundles.$inferSelect;

const schema = z.object({
  id: z.string().min(1).optional(),
  nameAr: z.string({ error: "اكتب اسم الحزمة" }).trim().min(2, "اسم الحزمة قصير").max(40, "اسم الحزمة طويل"),
  lines: z.array(z.enum(PRODUCT_LINES)).transform((l) => [...new Set(l)]).refine((l) => l.length >= 2, "الحزمة لازم تجمع منظومتين على الأقل"),
  discountPercent: z.number({ error: "اكتب نسبة الخصم" }).int("النسبة رقم صحيح").min(1, "الخصم 1% على الأقل").max(90, "الخصم كبير بزيادة (الحد 90%)"),
  isActive: z.boolean().default(true),
});

export const listBundles = (db: Db) => db.select().from(lineBundles).orderBy(asc(lineBundles.createdAt));

export async function saveBundle(db: Db, input: unknown, actorUserId: string): Promise<Result<{ id: string }>> {
  const p = schema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, ...d } = p.data;
  if (id) {
    const [row] = await db.update(lineBundles).set(d).where(eq(lineBundles.id, id)).returning({ id: lineBundles.id });
    if (!row) return fail("ما لقينا الحزمة. حدّث الصفحة.");
  }
  const rowId = id ?? (await db.insert(lineBundles).values(d).returning({ id: lineBundles.id }))[0]!.id;
  await writeAudit(db, { actorUserId, storeId: null, action: id ? "bundle.update" : "bundle.create", entityType: "line_bundle", entityId: rowId, meta: d });
  return ok({ id: rowId });
}

export async function deleteBundle(db: Db, id: string, actorUserId: string): Promise<Result> {
  const [row] = await db.delete(lineBundles).where(eq(lineBundles.id, id)).returning({ id: lineBundles.id });
  if (!row) return fail("ما لقينا الحزمة. حدّث الصفحة.");
  await writeAudit(db, { actorUserId, storeId: null, action: "bundle.delete", entityType: "line_bundle", entityId: id });
  return ok(undefined);
}

/** أحسن حزمة تنطبق على منظومات النشاط (كل منظومات الحزمة مشترك فيها، والمنظومة المدفوعة منها) */
export function bundleFor(bundles: Pick<LineBundle, "nameAr" | "lines" | "discountPercent" | "isActive">[], businessLines: readonly ProductLine[], paying: ProductLine) {
  return bundles
    .filter((b) => b.isActive && b.lines.includes(paying) && b.lines.every((l) => businessLines.includes(l)))
    .sort((a, b) => b.discountPercent - a.discountPercent)[0] ?? null;
}
