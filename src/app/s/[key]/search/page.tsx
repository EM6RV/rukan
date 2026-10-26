import { BASE_TEMPLATE } from "@/lib/plan-limits";
import { canUse } from "@/lib/entitlements";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getKit } from "@/components/store/templates";
import { SearchBox } from "@/components/store/search-box";
import { FilterBar, parseFilters } from "@/components/store/filter-bar";
import { getCatalog, getFacets } from "@/server/storefront/data";
import { getRequestContext, loadStore } from "@/server/storefront/request";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<{ q?: string; page?: string; min?: string; max?: string; stock?: string; opt?: string; brand?: string; tag?: string }> };

export const metadata: Metadata = { title: "كل المنتجات", robots: { index: false, follow: true } };

export default async function SearchPage({ params, searchParams }: Props) {
  const { key } = await params;
  const sp = await searchParams;
  const sf = await loadStore(key);
  if (!sf) notFound();
  const { base } = await getRequestContext(key);
  const kit = getKit(canUse(sf.limits, "allTemplates") ? sf.template : BASE_TEMPLATE);
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number(sp.page) || 1);
  const f = parseFilters(sp);
  const [result, facets] = await Promise.all([getCatalog(sf.id, { q, page, sort: "newest", ...f.query }), getFacets(sf.id)]);
  const extra: Record<string, string> = { ...(f.active.min ? { min: f.active.min } : {}), ...(f.active.max ? { max: f.active.max } : {}), ...(f.active.stock ? { stock: "1" } : {}), ...(f.active.opt ? { opt: f.active.opt } : {}), ...(f.active.brand ? { brand: f.active.brand } : {}), ...(f.active.tag ? { tag: f.active.tag } : {}) };
  const url = (p: number) => `${base}/search?${new URLSearchParams({ ...(q ? { q } : {}), ...extra, ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className={`${kit.cls.container} space-y-8 py-8 md:py-12`}>
      <h1 className={kit.cls.heading}>{q ? `نتائج «${q}»` : "كل المنتجات"}</h1>
      <SearchBox defaultValue={q} />
      <FilterBar action={`${base}/search`} cls={kit.cls} facets={facets} active={f.active} keep={q ? { q } : {}} />
      <p className="text-sm text-(--sp-muted)">{result.total} منتج</p>
      {result.items.length === 0 ? (
        <div className={`${kit.cls.panel} text-center`}>{q ? "ما لقينا منتجات بهذا الاسم. جرّب كلمة ثانية." : "المنتجات تنضاف قريب."}</div>
      ) : (
        <>
        <h2 className="sr-only">المنتجات</h2>
        <div className={kit.cls.productGrid}>{result.items.map((p, i) => <kit.ProductCard key={p.id} product={p} priority={i < 4} />)}</div>
        </>
      )}
      {result.pageCount > 1 && (
        <nav aria-label="الصفحات" className="flex items-center justify-center gap-3 text-sm">
          {result.page > 1 && <Link href={url(result.page - 1)} className={kit.cls.chip}>السابق</Link>}
          <span className="text-(--sp-muted)">صفحة {result.page} من {result.pageCount}</span>
          {result.page < result.pageCount && <Link href={url(result.page + 1)} className={kit.cls.chip}>التالي</Link>}
        </nav>
      )}
    </div>
  );
}
