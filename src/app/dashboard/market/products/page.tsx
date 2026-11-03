import type { Metadata } from "next";
import { listMarketProducts } from "@/server/market/catalog";
import { requireLineContext } from "@/server/store-context";
import { MarketProductList } from "./product-list";

export const metadata: Metadata = { title: "الباركود والوحدات" };

export default async function MarketProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireLineContext("market", "products");
  const { q } = await searchParams;
  const rows = await listMarketProducts(ctx.scope, q?.slice(0, 60));
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl">الباركود والوحدات</h1>
        <p className="text-muted">لكل صنف: باركودات متعددة، الكرتونة والحبة، أسعار الجملة، الموزون ورقم الميزان، الرف، والأزرار السريعة في الكاشير. واطبع ملصقات الرف والباركود.</p>
      </div>
      <MarketProductList rows={rows} q={q ?? ""} writable={ctx.lines.market.writable} />
    </div>
  );
}
