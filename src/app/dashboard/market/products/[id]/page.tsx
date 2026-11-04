import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marketCan } from "@/server/market/access";
import { getMarketProduct } from "@/server/market/catalog";
import { requireLineContext } from "@/server/store-context";
import { MarketProductEditor } from "./editor";

export const metadata: Metadata = { title: "بيانات الصنف" };

export default async function MarketProductPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireLineContext("market", "products");
  const data = await getMarketProduct(ctx.scope, (await params).id);
  if (!data) notFound();
  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard/market/products" className="text-sm text-link-strong hover:underline">← الباركود والوحدات</Link>
        <h1 className="mt-1 text-2xl">{data.product.name}</h1>
        <p className="text-muted">الاسم والسعر الأساسي والمخزون والصور من <Link href={`/dashboard/products/${data.product.id}`} className="text-link-strong underline">صفحة المنتج</Link>.</p>
      </div>
      <MarketProductEditor data={data} wholesale={marketCan(ctx.lines, "wholesale")} writable={ctx.lines.market.writable} />
    </div>
  );
}
