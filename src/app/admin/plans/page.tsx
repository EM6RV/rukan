import type { Metadata } from "next";
import { count } from "drizzle-orm";
import { getDb } from "@/db";
import { lineSubscriptions } from "@/db/schema/platform";
import { listBundles } from "@/server/admin/bundles";
import { listAddons, listPlans } from "@/server/admin/plans";
import { PlanManager } from "./plan-manager";

export const metadata: Metadata = { title: "الباقات" };

export default async function AdminPlans() {
  const db = getDb();
  const [plans, addons, counts, bundles] = await Promise.all([
    listPlans(db), listAddons(db),
    db.select({ planId: lineSubscriptions.planId, n: count() }).from(lineSubscriptions).groupBy(lineSubscriptions.planId),
    listBundles(db),
  ]);
  const n = new Map(counts.map((c) => [c.planId, c.n]));
  return (
    <>
      <div><h1 className="text-2xl">الباقات والإضافات</h1><p className="text-muted">باقات كل منظومة (المتجر، ماركت، بلاي، فِت): سعر كل مدة وحدودها ومميزاتها. التعديل يتطبق فوراً على النشاطات المشتركة.</p></div>
      <PlanManager
        plans={plans.filter((p) => !p.slug.startsWith("legacy-")).map((p) => ({ id: p.id, slug: p.slug, line: p.line, nameAr: p.nameAr, descriptionAr: p.descriptionAr, prices: p.prices, comparePrices: p.comparePrices, durationPerks: p.durationPerks, isFeatured: p.isFeatured, isFree: p.isFree, sortOrder: p.sortOrder, isActive: p.isActive, limits: p.limits, storeCount: n.get(p.id) ?? 0 }))}
        addons={addons.map((a) => ({ id: a.id, slug: a.slug, nameAr: a.nameAr, kind: a.kind, units: a.units, monthlyPrice: a.monthlyPrice, isActive: a.isActive, sortOrder: a.sortOrder }))}
        bundles={bundles.map((b) => ({ id: b.id, nameAr: b.nameAr, lines: b.lines, discountPercent: b.discountPercent, isActive: b.isActive }))}
      />
    </>
  );
}
