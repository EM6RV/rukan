import type { Metadata } from "next";
import { count } from "drizzle-orm";
import { getDb } from "@/db";
import { stores } from "@/db/schema/platform";
import { listAddons, listPlans } from "@/server/admin/plans";
import { PlanManager } from "./plan-manager";

export const metadata: Metadata = { title: "الباقات" };

export default async function AdminPlans() {
  const db = getDb();
  const [plans, addons, counts] = await Promise.all([
    listPlans(db), listAddons(db),
    db.select({ planId: stores.planId, n: count() }).from(stores).groupBy(stores.planId),
  ]);
  const n = new Map(counts.map((c) => [c.planId, c.n]));
  return (
    <>
      <div><h1 className="text-2xl">الباقات والإضافات</h1><p className="text-muted">سعر كل باقة لكل مدة (شهر، 3 شهور، 6 شهور، سنة) وحدودها ومميزاتها. التعديل يتطبق فوراً على المتاجر المشتركة.</p></div>
      <PlanManager
        plans={plans.filter((p) => !p.slug.startsWith("legacy-")).map((p) => ({ id: p.id, slug: p.slug, nameAr: p.nameAr, descriptionAr: p.descriptionAr, prices: p.prices, comparePrices: p.comparePrices, durationPerks: p.durationPerks, isFeatured: p.isFeatured, isFree: p.isFree, sortOrder: p.sortOrder, isActive: p.isActive, limits: p.limits, storeCount: n.get(p.id) ?? 0 }))}
        addons={addons.map((a) => ({ id: a.id, slug: a.slug, nameAr: a.nameAr, kind: a.kind, units: a.units, monthlyPrice: a.monthlyPrice, isActive: a.isActive, sortOrder: a.sortOrder }))}
      />
    </>
  );
}
