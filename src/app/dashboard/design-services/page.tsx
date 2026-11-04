import type { Metadata } from "next";
import { getDb } from "@/db";
import { getPlatformConfig } from "@/server/admin/settings";
import { getDesignAllowance } from "@/server/design-services";
import { requireStoreContext } from "@/server/store-context";
import { DesignServices } from "./design-services";

export const metadata: Metadata = { title: "خدمات التصميم" };
export const dynamic = "force-dynamic";

export default async function DesignServicesPage() {
  const ctx = await requireStoreContext("settings");
  const db = getDb();
  const [allowance, config] = await Promise.all([getDesignAllowance(db, ctx.store, ctx.limits, ctx.store.billingCycle), getPlatformConfig(db)]);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">خدمات التصميم</h1><p className="text-muted">نصمم لك ريلز ولوجو وهوية لمتجرك. السعر حسب الطلب، ونتفق عليه ونكمل التفاصيل في واتساب.</p></div>
      <DesignServices writable={ctx.access.writable} supportReady={!!config.supportWhatsapp} free={allowance} />
    </div>
  );
}
