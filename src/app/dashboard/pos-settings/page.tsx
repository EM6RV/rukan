import type { Metadata } from "next";
import { posConfigOf } from "@/server/pos/sync";
import { requireStoreContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { PosSettingsForm } from "./form";

export const metadata: Metadata = { title: "إعدادات الكاشير" };

export default async function PosSettingsPage() {
  const ctx = await requireStoreContext("settings");
  const [s] = await ctx.scope.from(t.storeSettings).limit(1);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">إعدادات الكاشير</h1><p className="text-muted">الطابعة والفاتورة، حد الخصم بدون موافقة، نقاط الولاء، وحد الدين. رأس وذيل الفاتورة لكل فرع من «الفروع والأجهزة».</p></div>
      <PosSettingsForm initial={posConfigOf(s?.posConfig)} writable={ctx.access.writable} />
    </div>
  );
}
