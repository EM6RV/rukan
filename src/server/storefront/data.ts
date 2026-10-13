import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { getDb } from "@/db";
import { forStore } from "../tenant";
import {
  loadPage, loadStorefront, queryDeliveryRates, queryProductDetail, queryProducts, queryRelated, querySitemap,
} from "./queries";
import type { CatalogQuery } from "./types";

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
}

export const getStorefront = (key: string) =>
  unstable_cache(async () => loadStorefront(getDb(), key), ["storefront", key.toLowerCase()], { tags: [keyTag(key)], revalidate: 120 })();

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
