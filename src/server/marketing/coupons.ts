import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { PlanLimits } from "@/db/schema/platform";
import { firstError } from "@/lib/validation";
import { isUniqueViolation } from "../db-errors";
import { fail, ok, type Result } from "../catalog/result";
import { t, type StoreScope } from "../tenant";

export type CouponState = "active" | "disabled" | "scheduled" | "expired" | "exhausted";

export type CouponRow = {
  id: string; code: string; type: "percent" | "fixed"; value: number; minOrder: number | null; maxUses: number | null; usedCount: number;
  startsAt: number | null; expiresAt: number | null; isActive: boolean; state: CouponState; createdAt: number;
};

const NO_PLAN = "الكوبونات متاحة في باقة «سنوية» وما فوق.";

export function couponState(c: { isActive: boolean; startsAt: Date | null; expiresAt: Date | null; maxUses: number | null; usedCount: number }, now = Date.now()): CouponState {
  if (!c.isActive) return "disabled";
  if (c.expiresAt && c.expiresAt.getTime() <= now) return "expired";
  if (c.maxUses !== null && c.usedCount >= c.maxUses) return "exhausted";
  if (c.startsAt && c.startsAt.getTime() > now) return "scheduled";
  return "active";
}

export async function listCoupons(scope: StoreScope, now = Date.now()): Promise<CouponRow[]> {
  const rows = await scope.from(t.coupons).orderBy(desc(t.coupons.createdAt), t.coupons.code);
  return rows.map((c) => ({
    id: c.id, code: c.code, type: c.type, value: c.value, minOrder: c.minOrder, maxUses: c.maxUses, usedCount: c.usedCount,
    startsAt: c.startsAt?.getTime() ?? null, expiresAt: c.expiresAt?.getTime() ?? null, isActive: c.isActive, state: couponState(c, now), createdAt: c.createdAt.getTime(),
  }));
}

const optInt = (label: string, min: number, max: number) =>
  z.number({ error: `${label} لازم يكون رقم` }).int(`${label} لازم يكون رقم صحيح`).min(min, `${label} لازم يكون ${min} أو أكثر`).max(max, `${label} كبير بزيادة`).nullish().transform((v) => v ?? null);
const optMs = z.number().int().min(0).max(4_102_444_800_000).nullish().transform((v) => v ?? null);

const schema = z.object({
  id: z.string().min(1).optional(),
  code: z.string({ error: "اكتب كود الخصم" }).trim().toUpperCase().regex(/^[A-Z0-9_-]{3,20}$/, "الكود من 3 إلى 20 حرف إنجليزي أو رقم (يسمح بـ - و _)"),
  type: z.enum(["percent", "fixed"], { error: "اختار نوع الخصم" }),
  value: z.number({ error: "قيمة الخصم لازم تكون رقم" }).int("قيمة الخصم لازم تكون رقم صحيح").min(1, "قيمة الخصم لازم تكون أكبر من صفر").max(1_000_000_000),
  minOrder: optInt("الحد الأدنى للطلبية", 1, 1_000_000_000),
  maxUses: optInt("عدد الاستخدامات", 1, 1_000_000),
  startsAt: optMs,
  expiresAt: optMs,
  isActive: z.boolean().default(true),
}).superRefine((c, ctx) => {
  if (c.type === "percent" && c.value > 100) ctx.addIssue({ code: "custom", message: "النسبة ما تزيدش عن 100%", path: ["value"] });
  if (c.startsAt && c.expiresAt && c.expiresAt <= c.startsAt) ctx.addIssue({ code: "custom", message: "تاريخ الانتهاء لازم يكون بعد تاريخ البداية", path: ["expiresAt"] });
});

export async function saveCoupon(scope: StoreScope, input: unknown, limits: Pick<PlanLimits, "coupons">, now = Date.now()): Promise<Result<{ id: string }>> {
  if (!limits.coupons) return fail(NO_PLAN);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { id, ...d } = parsed.data;
  if (d.expiresAt !== null && d.expiresAt <= now && d.isActive && !id) return fail("تاريخ الانتهاء فات. اختار تاريخ قادم.");

  const [dup] = await scope.from(t.coupons, eq(t.coupons.code, d.code)).limit(1);
  if (dup && dup.id !== id) return fail("هذا الكود موجود. اختار كود ثاني.");

  const data = { ...d, startsAt: d.startsAt === null ? null : new Date(d.startsAt), expiresAt: d.expiresAt === null ? null : new Date(d.expiresAt) };
  try {
    if (id) {
      const [cur] = await scope.from(t.coupons, eq(t.coupons.id, id)).limit(1);
      if (!cur) return fail("ما لقينا الكوبون. يمكن انحذف، حدّث الصفحة.");
      if (cur.usedCount > 0 && cur.code !== d.code) return fail("ما ينفعش تغيّر كود كوبون استُخدم. أنشئ كوبون جديد.");
      if (d.maxUses !== null && d.maxUses < cur.usedCount) return fail(`الكوبون استُخدم ${cur.usedCount} مرة، فعدد الاستخدامات ما يكونش أقل منها.`);
      await scope.update(t.coupons, data, eq(t.coupons.id, id));
      return ok({ id });
    }
    const [row] = await scope.insert(t.coupons, data);
    return ok({ id: row!.id });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("هذا الكود موجود. اختار كود ثاني.");
    throw e;
  }
}

export async function setCouponActive(scope: StoreScope, id: string, isActive: boolean): Promise<Result> {
  const [row] = await scope.update(t.coupons, { isActive }, eq(t.coupons.id, id));
  return row ? ok(undefined) : fail("ما لقينا الكوبون. يمكن انحذف، حدّث الصفحة.");
}

export async function deleteCoupon(scope: StoreScope, id: string): Promise<Result> {
  const [cur] = await scope.from(t.coupons, eq(t.coupons.id, id)).limit(1);
  if (!cur) return fail("ما لقينا الكوبون. يمكن انحذف، حدّث الصفحة.");
  const used = await scope.count(t.couponRedemptions, eq(t.couponRedemptions.couponId, id));
  const orders = await scope.count(t.orders, eq(t.orders.couponId, id));
  if (cur.usedCount > 0 || used > 0 || orders > 0) return fail("هذا الكوبون استُخدم في طلبيات. عطّله بدل الحذف.");
  await scope.delete(t.coupons, and(eq(t.coupons.id, id), sql`${t.coupons.usedCount} = 0`)!);
  return ok(undefined);
}
