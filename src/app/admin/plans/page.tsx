import type { Metadata } from "next";
import { getDb } from "@/db";
import { listPlans } from "@/server/admin/plans";
import { PlanManager } from "./plan-manager";

export const metadata: Metadata = { title: "الباقات" };

export default async function AdminPlans() {
  const db = getDb();
  const plans = await listPlans(db);
  return (
    <>
      <div><h1 className="text-2xl">الباقات</h1><p className="text-muted">الاسم والمدة والسعر والحدود والمميزات. التعديل يتطبق فوراً على كل المتاجر المشتركة في الباقة.</p></div>
      <PlanManager plans={plans.map((p) => ({ id: p.id, slug: p.slug, nameAr: p.nameAr, descriptionAr: p.descriptionAr, billingPeriod: p.billingPeriod, price: p.price, isFeatured: p.isFeatured, sortOrder: p.sortOrder, isActive: p.isActive, limits: p.limits }))} />
    </>
  );
}
