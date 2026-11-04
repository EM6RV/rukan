import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marketCan } from "@/server/market/access";
import { variantOptions } from "@/server/market/catalog";
import { stocktakeVariance } from "@/server/market/stocktake";
import { hasPermission } from "@/server/permissions";
import { requireLineContext } from "@/server/store-context";
import { ScanCounter } from "./scan";

export const metadata: Metadata = { title: "الجرد بالمسح" };

export default async function StocktakePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireLineContext("market", "products");
  const [v, options] = await Promise.all([stocktakeVariance(ctx.scope, (await params).id), variantOptions(ctx.scope)]);
  if (!v) notFound();
  const canSettle = hasPermission({ role: ctx.role, customPermissions: ctx.customPermissions }, "pos_approve");
  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard/market/stocktake" className="text-sm text-link-strong hover:underline">← الجرد</Link>
        <h1 className="mt-1 text-2xl">{v.stocktake.status === "open" ? "جرد مفتوح" : "جرد معتمد"}{v.stocktake.shelf ? ` · رف ${v.stocktake.shelf}` : ""}</h1>
        <p className="text-muted">{v.summary.counted} من {v.summary.items} صنف اتعدّ · {v.summary.counters} عدّاد · الفروقات في الجدول تحت.</p>
      </div>
      <ScanCounter stocktakeId={v.stocktake.id} open={v.stocktake.status === "open" && ctx.lines.market.writable} camera={marketCan(ctx.lines, "cameraScan")} canSettle={canSettle}
        rows={v.rows} summary={v.summary} options={options.map((o) => ({ variantId: o.variantId, name: o.name, stock: o.stock, isWeighed: o.isWeighed }))} />
    </div>
  );
}
