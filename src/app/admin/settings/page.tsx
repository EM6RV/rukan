import type { Metadata } from "next";
import { getDb } from "@/db";
import { listPlans } from "@/server/admin/plans";
import { getPlatformConfig } from "@/server/admin/settings";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "إعدادات المنصة" };

export default async function AdminSettings() {
  const db = getDb();
  const [config, plans] = await Promise.all([getPlatformConfig(db), listPlans(db)]);
  return (
    <>
      <div><h1 className="text-2xl">إعدادات المنصة</h1><p className="text-muted">التجربة المجانية ووسيلة التواصل للدعم.</p></div>
      <SettingsForm config={config} plans={plans.filter((p) => p.isActive).map((p) => ({ slug: p.slug, name: p.nameAr }))} />
    </>
  );
}
