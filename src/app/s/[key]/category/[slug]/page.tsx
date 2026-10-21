import { BASE_TEMPLATE } from "@/lib/plan-limits";
import { canUse } from "@/lib/entitlements";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getKit } from "@/components/store/templates";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/media-url";
import { getCatalog } from "@/server/storefront/data";
import { decodeKey, getRequestContext, loadStore } from "@/server/storefront/request";
import type { CatalogSort } from "@/server/storefront/types";

type Props = { params: Promise<{ key: string; slug: string }>; searchParams: Promise<{ sort?: string; page?: string }> };

const SORTS: { key: CatalogSort; label: string }[] = [
  { key: "newest", label: "الأحدث" }, { key: "price_asc", label: "الأقل سعراً" }, { key: "price_desc", label: "الأعلى سعراً" },
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key, slug } = await params;
  const sf = await loadStore(key);
  const cat = sf?.categories.find((c) => c.slug === decodeKey(slug));
  if (!cat) return { title: "القسم غير موجود", robots: { index: false } };
  return { title: cat.name, openGraph: { title: cat.name, images: cat.imageMediaId ? [mediaUrl(cat.imageMediaId, 960)] : undefined } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { key, slug: rawSlug } = await params;
  const sp = await searchParams;
  const slug = decodeKey(rawSlug);
  const sf = await loadStore(key);
  const cat = sf?.categories.find((c) => c.slug === slug);
  if (!sf || !cat) notFound();

  const { base } = await getRequestContext(key);
  const kit = getKit(canUse(sf.limits, "allTemplates") ? sf.template : BASE_TEMPLATE);
  const sort = SORTS.some((s) => s.key === sp.sort) ? (sp.sort as CatalogSort) : "newest";
  const page = Math.max(1, Number(sp.page) || 1);
  const result = await getCatalog(sf.id, { categorySlug: slug, sort, page });
  const url = (over: { sort?: CatalogSort; page?: number }) => {
    const q = new URLSearchParams();
    const s = over.sort ?? sort;
    if (s !== "newest") q.set("sort", s);
    if ((over.page ?? 1) > 1) q.set("page", String(over.page));
    return `${base}/category/${encodeURIComponent(slug)}${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className={`${kit.cls.container} space-y-8 py-8 md:py-12`}>
      <header className="space-y-4">
        <nav aria-label="مسار التنقل" className="text-sm text-(--sp-muted)"><Link href={base || "/"} className="hover:underline">الرئيسية</Link> / <span className="text-(--sp)">{cat.name}</span></nav>
        <h1 className={kit.cls.heading}>{cat.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-(--sp-muted)">{result.total} منتج</span>
          <span className="flex-1" />
          {SORTS.map((s) => <Link key={s.key} href={url({ sort: s.key })} scroll={false} className={cn(kit.cls.chip, sort === s.key && kit.cls.chipOn)}>{s.label}</Link>)}
        </div>
      </header>

      {result.items.length === 0 ? (
        <div className={`${kit.cls.panel} text-center`}>ما فيه منتجات في هذا القسم حالياً.</div>
      ) : (
        <>
        <h2 className="sr-only">المنتجات</h2>
        <div className={kit.cls.productGrid}>{result.items.map((p, i) => <kit.ProductCard key={p.id} product={p} priority={i < 4} />)}</div>
        </>
      )}

      {result.pageCount > 1 && (
        <nav aria-label="الصفحات" className="flex items-center justify-center gap-3 pt-4 text-sm">
          {result.page > 1 && <Link href={url({ page: result.page - 1 })} className={kit.cls.chip}>السابق</Link>}
          <span className="text-(--sp-muted)">صفحة {result.page} من {result.pageCount}</span>
          {result.page < result.pageCount && <Link href={url({ page: result.page + 1 })} className={kit.cls.chip}>التالي</Link>}
        </nav>
      )}
    </div>
  );
}
