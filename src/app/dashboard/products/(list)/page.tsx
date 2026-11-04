import type { Metadata } from "next";
import Link from "next/link";
import { FileUp, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { listCategories } from "@/server/catalog/categories";
import { listProducts, productQuota } from "@/server/catalog/products";
import { requireStoreContext } from "@/server/store-context";
import { ProductList } from "../product-list";

export const metadata: Metadata = { title: "المنتجات" };

type Search = { q?: string; category?: string; status?: string; page?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const ctx = await requireStoreContext("products");
  const status = sp.status === "visible" || sp.status === "hidden" || sp.status === "low" ? sp.status : undefined;

  const [list, categories, quota] = await Promise.all([
    listProducts(ctx.scope, {
      q: sp.q, categoryId: sp.category || undefined, page: Number(sp.page) || 1,
      visibility: status === "visible" || status === "hidden" ? status : undefined,
      lowStock: status === "low" ? 5 : undefined,
    }),
    listCategories(ctx.scope),
    productQuota(ctx.scope, ctx.limits),
  ]);
  const atLimit = quota.max !== null && quota.remaining === 0;
  const query = (page: number) => {
    const p = new URLSearchParams();
    if (sp.q) p.set("q", sp.q);
    if (sp.category) p.set("category", sp.category);
    if (status) p.set("status", status);
    if (page > 1) p.set("page", String(page));
    const s = p.toString();
    return `/dashboard/products${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">المنتجات</h1>
          <p className="text-muted">
            {quota.used} منتج{quota.max !== null && <> من {quota.max} <span className="text-xs">(حد باقتك)</span></>}
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/dashboard/products/import" variant="outline" aria-disabled={!ctx.access.writable}><FileUp className="size-4" /> استيراد</ButtonLink>
          {atLimit || !ctx.access.writable
            ? <span className="inline-flex h-11 cursor-not-allowed items-center gap-2 rounded-md bg-gold/40 px-5 text-[15px] font-semibold text-navy/60"><Plus className="size-4" /> منتج جديد</span>
            : <ButtonLink href="/dashboard/products/new"><Plus className="size-4" /> منتج جديد</ButtonLink>}
        </div>
      </div>

      {atLimit && <p role="status" className="rounded-md bg-gold/20 px-4 py-3 text-sm font-medium">وصلت للحد الأقصى من المنتجات في باقتك. رقّي باقتك لتضيف أكثر.</p>}

      <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" role="search">
        <input name="q" defaultValue={sp.q} placeholder="ابحث باسم المنتج…" aria-label="بحث" className="h-11 rounded-md border border-line bg-surface px-3.5 text-[15px] focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30" />
        <select name="category" defaultValue={sp.category ?? ""} aria-label="القسم" className="h-11 rounded-md border border-line bg-surface px-3 text-[15px]">
          <option value="">كل الأقسام</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ""} aria-label="الحالة" className="h-11 rounded-md border border-line bg-surface px-3 text-[15px]">
          <option value="">كل الحالات</option>
          <option value="visible">ظاهر</option>
          <option value="hidden">مخفي</option>
          <option value="low">مخزون منخفض</option>
        </select>
        <button className="h-11 rounded-md bg-fg px-5 text-[15px] font-semibold text-bg">بحث</button>
      </form>

      <ProductList items={list.items.map((i) => ({ ...i, createdAt: undefined }))} writable={ctx.access.writable} hasFilters={!!(sp.q || sp.category || status)} />

      {list.pageCount > 1 && (
        <nav aria-label="الصفحات" className="flex items-center justify-center gap-2 pt-2 text-sm">
          {list.page > 1 && <Link href={query(list.page - 1)} className="rounded-md border border-line px-3 py-2 hover:bg-surface-2">السابق</Link>}
          <span className="px-2 text-muted">صفحة {list.page} من {list.pageCount}</span>
          {list.page < list.pageCount && <Link href={query(list.page + 1)} className="rounded-md border border-line px-3 py-2 hover:bg-surface-2">التالي</Link>}
        </nav>
      )}
    </div>
  );
}
