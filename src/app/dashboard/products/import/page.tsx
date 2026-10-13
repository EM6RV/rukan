import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { productQuota } from "@/server/catalog/products";
import { requireStoreContext } from "@/server/store-context";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "استيراد منتجات" };

export default async function ImportPage() {
  const ctx = await requireStoreContext("products");
  const quota = await productQuota(ctx.scope, ctx.limits);
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/products" aria-label="رجوع للمنتجات" className="flex size-9 items-center justify-center rounded-md hover:bg-surface-2"><ChevronRight className="size-5" /></Link>
        <h1 className="text-2xl">استيراد منتجات</h1>
      </div>
      <ImportWizard writable={ctx.access.writable} remaining={quota.remaining === Infinity ? null : quota.remaining} />
    </div>
  );
}
