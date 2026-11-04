import { and, count, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { designRequests, stores, users, type PlanLimits } from "@/db/schema/platform";
import { addMonths, cycleMonths, type BillingPeriod } from "@/lib/billing";
import { DESIGN_SERVICES, DESIGN_SERVICE_LABELS, FREE_DESIGN_SERVICES, type DesignService } from "@/lib/constants";
import { firstError } from "@/lib/validation";
import { fail, ok, type Result } from "./catalog/result";

type StoreLike = { id: string; status: string; currentPeriodEnd: Date | null };

export type DesignAllowance = { total: number; used: number; remaining: number };

/**
 * التصاميم المجانية ضمن الباقة (مثلاً السنوية: 1). تتجدد مع كل فترة اشتراك،
 * ولازم الاشتراك يكون فعّال (مش تجربة) وفيه تاريخ انتهاء نحسب منه بداية الفترة.
 */
export async function getDesignAllowance(db: Db, store: StoreLike, limits: Pick<PlanLimits, "freeDesigns">, period: BillingPeriod | null): Promise<DesignAllowance> {
  const total = store.status === "active" && store.currentPeriodEnd && period ? Math.max(0, limits.freeDesigns ?? 0) : 0;
  if (total === 0) return { total: 0, used: 0, remaining: 0 };
  const periodStart = addMonths(store.currentPeriodEnd!.getTime(), -cycleMonths(period!));
  const [row] = await db.select({ n: count() }).from(designRequests)
    .where(and(eq(designRequests.storeId, store.id), eq(designRequests.isFree, true), gte(designRequests.createdAt, new Date(periodStart))));
  const used = row?.n ?? 0;
  return { total, used, remaining: Math.max(0, total - used) };
}

const schema = z.object({
  service: z.enum(DESIGN_SERVICES, { error: "اختار نوع التصميم" }),
  note: z.string().trim().max(600, "الوصف طويل بزيادة (الحد 600 حرف)").nullish().transform((v) => v || null),
  useFree: z.boolean().optional().default(false),
});

/** يسجل الطلب (والتفاصيل والملفات تكمل على واتساب). الطلب المجاني يتحقق من الرصيد داخل نفس العملية. */
export async function createDesignRequest(
  db: Db, store: StoreLike, limits: Pick<PlanLimits, "freeDesigns">, period: BillingPeriod | null, userId: string, input: unknown,
): Promise<Result<{ id: string; service: DesignService; note: string | null; isFree: boolean }>> {
  const p = schema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const d = p.data;
  if (d.useFree) {
    if (!FREE_DESIGN_SERVICES.includes(d.service)) return fail("التصميم المجاني للريل أو اللوجو بس.");
    const a = await getDesignAllowance(db, store, limits, period);
    if (a.remaining <= 0) return fail(a.total === 0 ? "باقتك ما فيها تصميم مجاني." : "استعملت التصميم المجاني في فترة اشتراكك الحالية.");
  }
  const [row] = await db.insert(designRequests).values({ storeId: store.id, userId, service: d.service, note: d.note, isFree: d.useFree }).returning({ id: designRequests.id });
  return ok({ id: row!.id, service: d.service, note: d.note, isFree: d.useFree });
}

/** رسالة الواتساب الجاهزة. السعر «حسب الطلب» يتحدد في المحادثة. */
export function designRequestMessage(o: { storeName: string; slug: string; planName?: string | null; service: DesignService; note?: string | null; isFree?: boolean }): string {
  const lines = [
    `السلام عليكم، أنا صاحب متجر «${o.storeName}» (${o.slug}) في رُكن${o.planName ? ` وباقتي ${o.planName}` : ""}.`,
    `نبي طلب تصميم: ${DESIGN_SERVICE_LABELS[o.service]}${o.isFree ? " (التصميم المجاني ضمن باقتي)" : ""}.`,
  ];
  if (o.note) lines.push(`الوصف: ${o.note}`);
  lines.push("بنبعث لك اللوجو وتفاصيل الطلب هنا في المحادثة.");
  return lines.join("\n");
}

export type DesignRequestRow = { id: string; storeName: string; storeSlug: string; ownerPhone: string | null; service: DesignService; note: string | null; isFree: boolean; createdAt: Date };

/** آخر الطلبات للأدمن */
export async function listDesignRequests(db: Db, limit = 100): Promise<DesignRequestRow[]> {
  const rows = await db
    .select({ r: designRequests, storeName: stores.name, storeSlug: stores.slug, phone: users.phone })
    .from(designRequests)
    .innerJoin(stores, eq(stores.id, designRequests.storeId))
    .leftJoin(users, eq(users.id, designRequests.userId))
    .orderBy(desc(designRequests.createdAt))
    .limit(limit);
  return rows.map((x) => ({ id: x.r.id, storeName: x.storeName, storeSlug: x.storeSlug, ownerPhone: x.phone, service: x.r.service, note: x.r.note, isFree: x.r.isFree, createdAt: x.r.createdAt }));
}
