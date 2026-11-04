import type { Metadata } from "next";
import { getDb } from "@/db";
import { listPlans } from "@/server/admin/plans";
import { getLineConfig, getPlatformConfig } from "@/server/admin/settings";
import { LinesForm } from "./lines-form";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "إعدادات المنصة" };

export default async function AdminSettings() {
  const db = getDb();
  const [config, plans, lines] = await Promise.all([getPlatformConfig(db), listPlans(db), getLineConfig(db)]);
  return (
    <>
      <div><h1 className="text-2xl">إعدادات المنصة</h1><p className="text-muted">بداية المتاجر الجديدة، الباقة المجانية، العرض الترويجي، الدعم، وإطلاق المنظومات.</p></div>
      <SettingsForm
        config={config}
        plans={plans.filter((p) => p.line === "store" && p.isActive && !p.isFree && !p.slug.startsWith("legacy-")).map((p) => ({ slug: p.slug, name: p.nameAr }))}
        freePlan={(() => { const f = plans.find((p) => p.isFree); return f ? { name: f.nameAr, isActive: f.isActive } : null; })()}
      />
      <LinesForm config={lines} plans={plans.filter((p) => p.line !== "store" && p.isActive).map((p) => ({ slug: p.slug, name: p.nameAr, line: p.line }))} />
    </>
  );
}
