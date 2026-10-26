import { BASE_TEMPLATE } from "@/lib/plan-limits";
import { canUse } from "@/lib/entitlements";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewsSection } from "@/components/store/reviews";
import { RecentlyViewed } from "@/components/store/recently-viewed";
import { ProductView } from "@/components/store/product-view";
import { getKit } from "@/components/store/templates";
import { mediaUrl } from "@/lib/media-url";
import { excerpt, safeJsonLd } from "@/lib/text";
import { getProduct, getRelated, getReviews } from "@/server/storefront/data";
import { decodeKey, getRequestContext, loadStore } from "@/server/storefront/request";

type Props = { params: Promise<{ key: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key, slug } = await params;
  const sf = await loadStore(key);
  const p = sf ? await getProduct(sf.id, decodeKey(slug)) : null;
  if (!p) return { title: "المنتج غير موجود", robots: { index: false } };
  const description = excerpt(p.description) ?? `${p.name} من ${sf!.name}`;
  return {
    title: p.name, description,
    openGraph: { title: p.name, description, type: "website", images: p.images[0] ? [mediaUrl(p.images[0], 960)] : undefined },
  };
}

export default async function ProductPage({ params }: Props) {
  const { key, slug } = await params;
  const sf = await loadStore(key);
  if (!sf) notFound();
  const product = await getProduct(sf.id, decodeKey(slug));
  if (!product) notFound();

  const { base, origin } = await getRequestContext(key);
  const kit = getKit(canUse(sf.limits, "allTemplates") ? sf.template : BASE_TEMPLATE);
  const [related, reviews] = await Promise.all([getRelated(sf.id, product.id, product.categories.map((c) => c.id)), getReviews(sf.id, product.id)]);
  const inStock = product.variants.some((v) => v.stock > 0);

  const jsonLd = {
    "@context": "https://schema.org", "@type": "Product", name: product.name,
    description: excerpt(product.description, 300), image: product.images.map((i) => origin + mediaUrl(i, 960)),
    sku: product.variants[0]?.sku ?? undefined,
    offers: {
      "@type": "AggregateOffer", priceCurrency: "LYD", lowPrice: (product.price / 1000).toFixed(3),
      highPrice: (Math.max(...product.variants.map((v) => v.price), product.price) / 1000).toFixed(3), offerCount: product.variants.length,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
    ...(reviews.count > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: reviews.average, reviewCount: reviews.count } } : {}),
  };

  return (
    <div className={`${kit.cls.container} space-y-14 py-6 pb-28 md:py-10 lg:pb-12`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <nav aria-label="مسار التنقل" className="text-sm text-(--sp-muted)">
        <Link href={base || "/"} className="hover:underline">الرئيسية</Link>
        {product.categories[0] && <> / <Link href={`${base}/category/${encodeURIComponent(product.categories[0].slug)}`} className="hover:underline">{product.categories[0].name}</Link></>}
        {" / "}<span className="text-(--sp)">{product.name}</span>
      </nav>
      <ProductView product={product} />
      <ReviewsSection productId={product.id} summary={reviews} storeKey={key} />
      <RecentlyViewed current={{ id: product.id, slug: product.slug, name: product.name, price: product.price, compareAt: product.compareAt, thumb: product.images[0] ?? null }} />
      {related.length > 0 && (
        <section aria-label="منتجات مشابهة">
          <kit.SectionTitle title="منتجات مشابهة" />
          <div className={kit.cls.productGrid}>{related.slice(0, 4).map((p) => <kit.ProductCard key={p.id} product={p} />)}</div>
        </section>
      )}
    </div>
  );
}
