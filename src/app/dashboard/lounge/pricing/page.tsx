import type { Metadata } from "next";
import { canUse } from "@/lib/entitlements";
import { listPacks, listRates } from "@/server/lounge/service";
import { posConfigOf } from "@/server/pos/sync";
import { requireLineContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { PricingManager } from "./manager";

export const metadata: Metadata = { title: "الأسعار والباقات" };

export default async function PricingPage() {
  const ctx = await requireLineContext("lounge", "settings");
  const [rates, packs, settings] = await Promise.all([listRates(ctx.scope), listPacks(ctx.scope), ctx.scope.from(t.storeSettings).limit(1)]);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الأسعار والباقات</h1><p className="text-muted">لكل لحظة يتطبق أخص سعر: نوع الجهاز، الغرفة، عدد اليدات، الوقت والأيام. لو زادوا يد في نص الجلسة كل جزء يتحسب بسعره.</p></div>
      <PricingManager rates={rates.map((r) => ({ ...r, createdAt: undefined }))} packs={packs.map((p) => ({ id: p.id, name: p.name, minutes: p.minutes, price: p.price, isActive: p.isActive }))}
        rules={posConfigOf(settings[0]?.posConfig).lounge} hourPacks={canUse(ctx.lines.lounge.limits ?? {}, "hourPacks")} writable={ctx.lines.lounge.writable} />
    </div>
  );
}
