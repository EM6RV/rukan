import type { Metadata } from "next";
import { LockedPage } from "@/components/dashboard/locked-page";
import { marketCan } from "@/server/market/access";
import { variantOptions } from "@/server/market/catalog";
import { listPromotions } from "@/server/market/promotions";
import { requireLineContext } from "@/server/store-context";
import { PromotionManager } from "./manager";

export const metadata: Metadata = { title: "العروض" };

const serverNow = async () => Date.now();

export default async function PromotionsPage() {
  const ctx = await requireLineContext("market", "marketing");
  if (!marketCan(ctx.lines, "promotions")) return <LockedPage feature="promotions" line="market" title="العروض" />;
  const [promos, options, now] = await Promise.all([listPromotions(ctx.scope), variantOptions(ctx.scope), serverNow()]);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">العروض</h1><p className="text-muted">تتطبق وحدها في الكاشير على سعر التجزئة (حتى بدون نت)، وما تحتاجش موافقة مشرف. كل صنف ياخذ عرض واحد (الأقدم أول).</p></div>
      <PromotionManager promos={promos} options={options.map((o) => ({ variantId: o.variantId, name: o.name, price: o.price }))} writable={ctx.lines.market.writable} now={now} />
    </div>
  );
}
