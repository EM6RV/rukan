import Link from "next/link";
import { getKit } from "@/components/store/templates";
import { safeJsonLd } from "@/lib/text";
import { mediaUrl } from "@/lib/media-url";
import { getCatalog } from "@/server/storefront/data";
import { getRequestContext, loadStore } from "@/server/storefront/request";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ key: string }> };

export default async function StoreHome({ params }: Props) {
  const { key } = await params;
  const sf = await loadStore(key);
  if (!sf) notFound();
  const { base, origin } = await getRequestContext(key);
  const kit = getKit(sf.limits.allTemplates ? sf.template : "simple");
  const href = (p: string) => `${base}${p}`;

  const [featured, newest] = await Promise.all([
    getCatalog(sf.id, { featured: true, pageSize: 8 }),
    getCatalog(sf.id, { sort: "newest", pageSize: 8 }),
  ]);
  const featuredIds = new Set(featured.items.map((p) => p.id));
  const latest = newest.items.filter((p) => !featuredIds.has(p.id));
  const hasProducts = newest.total > 0;

  const sections = sf.homeSections.length ? sf.homeSections : [{ id: "h", type: "hero", config: {} }, { id: "c", type: "categories", config: {} }, { id: "f", type: "featured", config: {} }];
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);

  return (
    <div className={`${kit.cls.container} space-y-14 pt-6 md:space-y-20 md:pt-10`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd({ "@context": "https://schema.org", "@type": "Store", name: sf.name, url: origin + (base || "/"), logo: sf.logoMediaId ? origin + mediaUrl(sf.logoMediaId, 640) : undefined, telephone: sf.settings.contactPhone ?? undefined, address: sf.settings.address ?? undefined }) }} />
      {sections.map((sec) => {
        if (sec.type === "hero") {
          return (
            <kit.Hero key={sec.id} title={str(sec.config.title) ?? sf.name} subtitle={str(sec.config.subtitle)} ctaHref={href("/search")} ctaLabel={str(sec.config.ctaLabel) ?? "تسوّق الآن"}
              imageMediaId={typeof sec.config.imageMediaId === "string" ? sec.config.imageMediaId : null} />
          );
        }
        if (sec.type === "categories" && sf.categories.length > 0) {
          return (
            <section key={sec.id} aria-label="الأقسام">
              <kit.SectionTitle title={str(sec.config.title) ?? "تسوّق حسب القسم"} />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {sf.categories.slice(0, 8).map((c) => <kit.CategoryTile key={c.id} name={c.name} href={href(`/category/${encodeURIComponent(c.slug)}`)} imageMediaId={c.imageMediaId} />)}
              </div>
            </section>
          );
        }
        if (sec.type === "featured" && featured.items.length > 0) {
          return (
            <section key={sec.id} aria-label="منتجات مميزة">
              <kit.SectionTitle title={str(sec.config.title) ?? "منتجات مميزة"} href={href("/search")} />
              <div className={kit.cls.productGrid}>{featured.items.map((p, i) => <kit.ProductCard key={p.id} product={p} priority={i < 2} />)}</div>
            </section>
          );
        }
        return null;
      })}

      {latest.length > 0 && (
        <section aria-label="وصل حديثاً">
          <kit.SectionTitle title={featured.items.length ? "وصل حديثاً" : "منتجاتنا"} href={href("/search")} />
          <div className={kit.cls.productGrid}>{latest.map((p) => <kit.ProductCard key={p.id} product={p} />)}</div>
        </section>
      )}

      {!hasProducts && (
        <div className={`${kit.cls.panel} mx-auto max-w-md text-center`}>
          <p className="text-lg font-semibold">المنتجات تنضاف قريب</p>
          <p className="mt-1 text-(--sp-muted)">ابقى قريب، حنضيفوا منتجات جديدة قريباً.</p>
          <Link href={href("/track")} className={`${kit.cls.btnOutline} mt-4`}>تتبع طلبيتك</Link>
        </div>
      )}
    </div>
  );
}
