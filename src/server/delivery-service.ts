import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { writeTransaction, type Db } from "@/db";
import { cities } from "@/db/schema/platform";
import { firstError } from "@/lib/validation";
import { fail, ok, type Result } from "./catalog/result";
import { forStore, t, type StoreScope } from "./tenant";

export type DeliveryRow = { cityId: string; cityName: string; region: string; fee: number; etaText: string; isActive: boolean };

/** كل مدن ليبيا مع سعر التوصيل الحالي للمتجر (المدينة اللي ما عندها سعر تظهر معطّلة) */
export async function getDeliveryConfig(db: Db, scope: StoreScope): Promise<{ rows: DeliveryRow[]; freeDeliveryOver: number | null }> {
  const [allCities, rates, [settings]] = await Promise.all([
    db.select().from(cities).orderBy(asc(cities.sortOrder), asc(cities.nameAr)),
    scope.from(t.deliveryRates),
    scope.from(t.storeSettings).limit(1),
  ]);
  const byCity = new Map(rates.map((r) => [r.cityId, r]));
  return {
    freeDeliveryOver: settings?.freeDeliveryOver ?? null,
    rows: allCities.map((c) => {
      const r = byCity.get(c.id);
      return { cityId: c.id, cityName: c.nameAr, region: c.region, fee: r?.fee ?? 0, etaText: r?.etaText ?? "", isActive: r?.isActive ?? false };
    }),
  };
}

const schema = z.object({
  freeDeliveryOver: z.number().int("المبلغ لازم يكون رقم صحيح").min(1, "حد التوصيل المجاني لازم يكون أكبر من صفر").max(100_000_000).nullable(),
  rates: z.array(z.object({
    cityId: z.string().min(1),
    fee: z.number().int("السعر لازم يكون رقم صحيح").min(0, "سعر التوصيل ما يكونش بالسالب").max(10_000_000, "سعر التوصيل كبير بزيادة"),
    etaText: z.string().trim().max(40, "مدة التوصيل طويلة").nullish().transform((v) => v || null),
    isActive: z.boolean(),
  })).min(1, "لازم مدينة وحدة على الأقل").max(200),
});

export async function saveDeliveryConfig(db: Db, storeId: string, input: unknown): Promise<Result> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const { rates, freeDeliveryOver } = parsed.data;
  if (new Set(rates.map((r) => r.cityId)).size !== rates.length) return fail("فيه مدينة مكررة.");
  if (!rates.some((r) => r.isActive)) return fail("فعّل مدينة وحدة على الأقل، وإلا الزباين ما يقدروش يطلبوا.");
  const valid = new Set((await db.select({ id: cities.id }).from(cities)).map((c) => c.id));
  if (rates.some((r) => !valid.has(r.cityId))) return fail("فيه مدينة غير صحيحة.");

  await writeTransaction(db, async (tx) => {
    const s = forStore(tx as unknown as Db, storeId);
    const existing = new Map((await s.from(t.deliveryRates)).map((r) => [r.cityId, r.id]));
    for (const r of rates) {
      const id = existing.get(r.cityId);
      if (id) await s.update(t.deliveryRates, { fee: r.fee, etaText: r.etaText, isActive: r.isActive }, eq(t.deliveryRates.id, id));
      else await s.insert(t.deliveryRates, { cityId: r.cityId, fee: r.fee, etaText: r.etaText, isActive: r.isActive });
    }
    await s.update(t.storeSettings, { freeDeliveryOver });
  });
  return ok(undefined);
}
