import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/datetime";
import { ensureDefaultWarehouse, listStocktakes } from "@/server/inventory/warehouses";
import { requireLineContext } from "@/server/store-context";
import { t } from "@/server/tenant";
import { OpenStocktake } from "./open-form";

export const metadata: Metadata = { title: "الجرد بالمسح" };

export default async function StocktakeListPage() {
  const ctx = await requireLineContext("market", "products");
  await ensureDefaultWarehouse(ctx.scope);
  const [list, warehouses, categories, products] = await Promise.all([listStocktakes(ctx.scope), ctx.scope.from(t.warehouses), ctx.scope.from(t.categories), ctx.scope.from(t.products)]);
  const shelves = [...new Set(products.map((p) => p.shelf).filter((s): s is string => !!s))].sort();
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الجرد بالمسح</h1><p className="text-muted">جرد كامل أو جزئي (قسم أو رف). كل واحد يمسح من جهازه (قارئ أو كاميرا) والعدّ يتجمع، وبعدها تراجع الفروقات وتعتمدها.</p></div>
      {ctx.lines.market.writable && <OpenStocktake warehouses={warehouses.filter((w) => w.isActive).map((w) => ({ id: w.id, name: w.name, isDefault: w.isDefault }))} categories={categories.map((c) => ({ id: c.id, name: c.name }))} shelves={shelves} />}
      <Card>
        <CardHeader title="الجرد" />
        {list.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">ما فيش جرد لسه.</p> : (
          <ul className="divide-y divide-line text-sm">{list.map((s) => (
            <li key={s.id}><Link href={`/dashboard/market/stocktake/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-surface-2/60"><span><b>{s.warehouse}</b> <span className="text-muted">· {formatDate(s.at)}</span></span><Badge tone={s.status === "open" ? "gold" : "success"}>{s.status === "open" ? "مفتوح" : "معتمد"}</Badge></Link></li>
          ))}</ul>
        )}
      </Card>
    </div>
  );
}
