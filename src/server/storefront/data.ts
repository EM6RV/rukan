import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { getDb } from "@/db";
import { forStore } from "../tenant";
import { listApprovedReviews } from "../reviews";
import {
  loadPage, loadStorefront, queryDeliveryRates, resolveDomainSlug, queryFacets, queryProductDetail, queryProducts, queryRelated, querySitemap,
} from "./queries";
import type { CatalogQuery, Storefront } from "./types";

/**
 * كاش واجهات المتاجر (Next data cache). كل الدوال تتوسم بـ store:<id> وتتفرغ لما البياع يعدل شي.
 * revalidate احتياطي (5 دقايق) لو فاتنا invalidation.
 */
const REVALIDATE = 300;

export const storeTag = (storeId: string) => `store:${storeId}`;
export const keyTag = (key: string) => `key:${key.toLowerCase()}`;

/** تفريغ كاش المتجر فوراً (يُنادى من أي تعديل في اللوحة أو بعد طلبية تغير المخزون) */
export function invalidateStore(store: { id: string; slug: string }) {
  revalidateTag(storeTag(store.id), { expire: 0 });
  revalidateTag(keyTag(store.slug), { expire: 0 });
  revalidateTag(DOMAINS_TAG, { expire: 0 }); // خريطة الدومينات الخاصة (تحقق/حذف/نزول باقة)
}

const DOMAINS_TAG = "domains";

/** الدومين الخاص يتحول لـ slug أول (كاش قصير يتفرغ مع أي تعديل متجر)، فكاش المتجر نفسه واحد ويتفرغ بوسم slug. */
const domainSlug = (host: string) =>
  unstable_cache(async () => resolveDomainSlug(getDb(), host), ["domain-slug", host], { tags: [DOMAINS_TAG], revalidate: 60 })();

export async function getStorefront(key: string): Promise<Storefront | null> {
  const k = key.toLowerCase();
  if (k.includes(".")) {
    const slug = await domainSlug(k);
    return slug ? getStorefront(slug) : null;
  }
  return unstable_cache(async () => loadStorefront(getDb(), k), ["storefront", k], { tags: [keyTag(k)], revalidate: 120 })();
}

// الدوال التالية تاخذ storeId وتوسم نفسها بـ storeTag

export const getPage = (storeId: string, slug: string) =>
  unstable_cache(async () => loadPage(forStore(getDb(), storeId), slug), ["page", storeId, slug], { tags: [storeTag(storeId)], revalidate: REVALIDATE })();

export const getCatalog = (storeId: string, q: CatalogQuery) =>
  unstable_cache(async () => queryProducts(forStore(getDb(), storeId), q), ["catalog", storeId, JSON.stringify(q)], { tags: [storeTag(storeId)], revalidate: REVALIDATE })();

export const getProduct = (storeId: string, slug: string) =>
  unstable_cache(async () => queryProductDetail(forStore(getDb(), storeId), slug), ["product", storeId, slug], { tags: [storeTag(storeId)], revalidate: REVALIDATE })();

export const getRelated = (storeId: string, productId: string, categoryIds: string[]) =>
  unstable_cache(async () => queryRelated(forStore(getDb(), storeId), productId, categoryIds), ["related", storeId, productId, categoryIds.join(",")], { tags: [storeTag(storeId)], revalidate: REVALIDATE })();

export const getDeliveryRates = (storeId: string) =>
  unstable_cache(async () => queryDeliveryRates(getDb(), forStore(getDb(), storeId)), ["rates", storeId], { tags: [storeTag(storeId)], revalidate: REVALIDATE })();

export const getSitemap = (storeId: string) =>
  unstable_cache(async () => querySitemap(forStore(getDb(), storeId)), ["sitemap", storeId], { tags: [storeTag(storeId)], revalidate: REVALIDATE })();

export const getFacets = (storeId: string) =>
  unstable_cache(async () => queryFacets(forStore(getDb(), storeId)), ["facets", storeId], { tags: [storeTag(storeId)], revalidate: REVALIDATE })();

export const getReviews = (storeId: string, productId: string) =>
  unstable_cache(async () => listApprovedReviews(forStore(getDb(), storeId), productId), ["reviews", storeId, productId], { tags: [storeTag(storeId)], revalidate: REVALIDATE })();
