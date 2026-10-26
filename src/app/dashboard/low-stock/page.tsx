import type { Metadata } from "next";
import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { DEFAULT_MIN_STOCK, listLowStock } from "@/server/catalog/low-stock";
import { requireStoreContext } from "@/server/store-context";

export const metadata: Metadata = { title: "قرب يخلص" };

export default async function LowStockPage() {
  const ctx = await requireStoreContext("products");
  const items = await listLowStock(ctx.scope);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl">قرب يخلص</h1><p className="text-muted">متغيرات وصل مخزونها لحد التنبيه (الافتراضي {DEFAULT_MIN_STOCK}). غيّر الحد لكل متغير من «التعديل السريع».</p></div>
        <ButtonLink href="/dashboard/products/grid" variant="outline" size="sm">تعديل الحدود والمخزون</ButtonLink>
      </div>
      {items.length === 0 ? <EmptyState icon={<PackageCheck className="size-6" />} title="كل المخزون تمام" description="ما فيه منتج وصل لحد التنبيه." /> : (
        <ul className="grid gap-2">
          {items.map((i) => (
            <li key={i.variantId}>
              <Card className="flex items-center gap-3 p-4">
                <Link href={`/dashboard/products/${i.productId}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{i.name}{i.label ? ` — ${i.label}` : ""}</Link>
                <span className="text-xs text-muted">الحد {i.min}</span>
                <Badge tone={i.stock === 0 ? "danger" : "gold"}>{i.stock === 0 ? "خلص" : `باقي ${i.stock}`}</Badge>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
