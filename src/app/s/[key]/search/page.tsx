import { canUse } from "@/lib/entitlements";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { getKit } from "@/components/store/templates";
import { getCatalog } from "@/server/storefront/data";
import { getRequestContext, loadStore } from "@/server/storefront/request";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<{ q?: string; page?: string }> };

export const metadata: Metadata = { title: "كل المنتجات", robots: { index: false, follow: true } };

export default async function SearchPage({ params, searchParams }: Props) {
  const { key } = await params;
  const sp = await searchParams;
  const sf = await loadStore(key);
  if (!sf) notFound();
  const { base } = await getRequestContext(key);
  const kit = getKit(canUse(sf.limits, "allTemplates") ? sf.template : "simple");
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number(sp.page) || 1);
  const result = await getCatalog(sf.id, { q, page, sort: "newest" });
  const url = (p: number) => `${base}/search?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className={`${kit.cls.container} space-y-8 py-8 md:py-12`}>
      <h1 className={kit.cls.heading}>{q ? `نتائج «${q}»` : "كل المنتجات"}</h1>
      <form action={`${base}/search`} role="search" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="ابحث عن منتج…" aria-label="بحث" className={kit.cls.input} />
        <button className={kit.cls.btn} aria-label="بحث"><Search className="size-5" /></button>
      </form>
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
