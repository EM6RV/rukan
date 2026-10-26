import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { cities, plans, stores, storeDomains } from "@/db/schema/platform";
import { canUse } from "@/lib/entitlements";
import { loadStoreLimits } from "../entitlements";
import { priceRange, variantCompareAt, variantPrice } from "@/lib/pricing";
import { forStore, t, type StoreScope } from "../tenant";
import { withBundleStock } from "../catalog/bundles";
import type { CardProduct, CartLine, CatalogFacets, CatalogPage, CatalogQuery, DeliveryRate, ProductDetail, Storefront } from "./types";


const PAGE_SIZE = 24;
const ms = (d: Date | null | undefined) => (d ? d.getTime() : null);

// ===== المتجر نفسه =====

/** slug المتجر صاحب دومين خاص: متحقق منه وباقته تسمح بدومين خاص، وإلا null */
export async function resolveDomainSlug(db: Db, host: string): Promise<string | null> {
  const row = (
    await db
      .select({ store: stores, plan: plans })
      .from(storeDomains)
      .innerJoin(stores, eq(stores.id, storeDomains.storeId))
      .leftJoin(plans, eq(plans.id, stores.planId))
      .where(and(eq(storeDomains.domain, host.toLowerCase()), eq(storeDomains.status, "verified")))
      .limit(1)
  )[0];
  // الدومين الخاص ميزة باقة: لو نزلت الباقة، الدومين يتوقف (المتجر يبقى على الساب دومين)
  return row && canUse(await loadStoreLimits(db, row.store, row.plan), "customDomain") ? row.store.slug : null;
}

/** يحل مفتاح (slug أو دومين خاص متحقق منه) إلى بيانات المتجر العامة كاملة. */
export async function loadStorefront(db: Db, rawKey: string): Promise<Storefront | null> {
  let key = rawKey.toLowerCase();
  if (key.includes(".")) {
    const slug = await resolveDomainSlug(db, key);
    if (!slug) return null;
    key = slug;
  }
  const found = (await db.select({ store: stores, plan: plans }).from(stores).leftJoin(plans, eq(plans.id, stores.planId)).where(eq(stores.slug, key)).limit(1))[0];
  if (!found || !found.store.onboardedAt) return null;
  const { store, plan } = found;
  const scope = forStore(db, store.id);

  const [[s], pages, categories, sections, payments] = await Promise.all([
    scope.from(t.storeSettings).limit(1),
    scope.from(t.storePages, eq(t.storePages.isPublished, true)).orderBy(t.storePages.sortOrder),
    scope.from(t.categories, eq(t.categories.isVisible, true)).orderBy(t.categories.position, t.categories.createdAt),
    scope.from(t.storeHomeSections, eq(t.storeHomeSections.isVisible, true)).orderBy(t.storeHomeSections.position),
    scope.from(t.storePaymentMethods, eq(t.storePaymentMethods.isEnabled, true)).orderBy(t.storePaymentMethods.sortOrder),
  ]);

  // القسم بدون صورة ياخذ صورة أول منتج ظاهر فيه (بدل بلاطة بحرف)
  const fallbackImages = new Map<string, string>();
  const needImage = categories.filter((c) => !c.imageMediaId);
  if (needImage.length) {
    const links = await scope.from(t.productCategories, inArray(t.productCategories.categoryId, needImage.map((c) => c.id)));
    if (links.length) {
      const prods = await scope.from(t.products, and(inArray(t.products.id, links.map((l) => l.productId)), visible())!).orderBy(desc(t.products.createdAt));
      const images = prods.length ? await scope.from(t.productImages, inArray(t.productImages.productId, prods.map((p) => p.id))).orderBy(t.productImages.position) : [];
      for (const c of needImage) {
        const ids = new Set(links.filter((l) => l.categoryId === c.id).map((l) => l.productId));
        const first = prods.find((p) => ids.has(p.id) && images.some((i) => i.productId === p.id));
        const img = first && images.find((i) => i.productId === first.id);
        if (img) fallbackImages.set(c.id, img.mediaId);
      }
    }
  }

  return {
    id: store.id, slug: store.slug, name: store.name, template: store.template, businessType: store.businessType, status: store.status,
    trialEndsAt: ms(store.trialEndsAt), currentPeriodEnd: ms(store.currentPeriodEnd), logoMediaId: store.logoMediaId,
    settings: {
      primaryColor: s?.primaryColor ?? "#0D263E", accentColor: s?.accentColor ?? "#C19E58", fontKey: s?.fontKey ?? "ibm-plex",
      contactPhone: s?.contactPhone ?? null, whatsapp: s?.whatsapp ?? null, email: s?.email ?? null, address: s?.address ?? null,
      instagram: s?.instagram ?? null, tiktok: s?.tiktok ?? null, facebook: s?.facebook ?? null, snapchat: s?.snapchat ?? null,
      seoTitle: s?.seoTitle ?? null, seoDescription: s?.seoDescription ?? null, ogMediaId: s?.ogMediaId ?? null,
      metaPixelId: s?.metaPixelId ?? null, tiktokPixelId: s?.tiktokPixelId ?? null,
      thanksMessage: s?.thanksMessage ?? null, announcementBar: s?.announcementBar ?? null, footerText: s?.footerText ?? null,
      freeDeliveryOver: s?.freeDeliveryOver ?? null, cityId: s?.cityId ?? null,
    },
    limits: await loadStoreLimits(db, store, plan ?? null),
    pages: pages.map((p) => ({ slug: p.slug, title: p.title })),
    categories: categories.map((c) => ({ id: c.id, slug: c.slug, name: c.name, imageMediaId: c.imageMediaId ?? fallbackImages.get(c.id) ?? null })),
    homeSections: sections.map((x) => ({ id: x.id, type: x.type, config: x.config })),
    payments: payments.map((p) => ({ method: p.method, config: p.config })),
  };
}

export async function loadPage(scope: StoreScope, slug: string) {
  const [p] = await scope.from(t.storePages, and(eq(t.storePages.slug, slug), eq(t.storePages.isPublished, true))!).limit(1);
  return p ? { slug: p.slug, title: p.title, body: p.body } : null;
}

// ===== المنتجات =====

const visible = () => and(eq(t.products.isVisible, true), isNull(t.products.deletedAt))!;

/** يحوّل صفوف المنتجات لبطاقات (صورة، مدى السعر، توفر) */
async function toCards(scope: StoreScope, rows: (typeof t.products.$inferSelect)[]): Promise<CardProduct[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [rawVariants, images] = await Promise.all([
    scope.from(t.productVariants, and(inArray(t.productVariants.productId, ids), eq(t.productVariants.isActive, true))!),
    scope.from(t.productImages, inArray(t.productImages.productId, ids)).orderBy(t.productImages.position),
  ]);
  const variants = await withBundleStock(scope, rows, rawVariants);
  return rows.map((p) => {
    const vs = variants.filter((v) => v.productId === p.id);
    const imgs = images.filter((i) => i.productId === p.id);
    const range = priceRange(p, vs);
    return {
      id: p.id, slug: p.slug, name: p.name, price: range.min, maxPrice: range.max, compareAt: range.compareAt,
      thumb: imgs[0]?.mediaId ?? null, thumb2: imgs[1]?.mediaId ?? null,
      inStock: vs.some((v) => v.stock > 0), isFeatured: p.isFeatured, hasOptions: vs.length > 1,
    };
  });
}

const escapeLike = (q: string) => `%${q.trim().replace(/[\\%_]/g, "\\$&")}%`;

export async function queryProducts(scope: StoreScope, opts: CatalogQuery = {}): Promise<CatalogPage> {
  const conds = [visible()];
  if (opts.featured) conds.push(eq(t.products.isFeatured, true));
  if (opts.q?.trim()) {
    const term = escapeLike(opts.q.slice(0, 80));
    conds.push(sql`(${t.products.name} LIKE ${term} ESCAPE '\\' OR ${t.products.description} LIKE ${term} ESCAPE '\\')`);
  }
  if (opts.minPrice && opts.minPrice > 0) conds.push(sql`${t.products.price} >= ${Math.floor(opts.minPrice)}`);
  if (opts.maxPrice && opts.maxPrice > 0) conds.push(sql`${t.products.price} <= ${Math.floor(opts.maxPrice)}`);
  if (opts.inStock) {
    conds.push(sql`EXISTS (SELECT 1 FROM ${t.productVariants} v WHERE v.store_id = ${t.products.storeId} AND v.product_id = ${t.products.id} AND v.is_active = 1 AND v.stock > 0)`);
  }
  if (opts.optionValue?.trim()) {
    conds.push(sql`EXISTS (
      SELECT 1 FROM ${t.productVariants} v
      JOIN ${t.variantOptionValues} vov ON vov.store_id = v.store_id AND vov.variant_id = v.id
      JOIN ${t.productOptionValues} pov ON pov.store_id = vov.store_id AND pov.id = vov.option_value_id
      WHERE v.store_id = ${t.products.storeId} AND v.product_id = ${t.products.id} AND v.is_active = 1 AND pov.value = ${opts.optionValue.trim().slice(0, 40)}
    )`);
  }
  if (opts.brandSlug) {
    const [b] = await scope.from(t.brands, eq(t.brands.slug, opts.brandSlug.slice(0, 80))).limit(1);
    if (!b) return { items: [], total: 0, page: 1, pageCount: 1 };
    conds.push(eq(t.products.brandId, b.id));
  }
  if (opts.tag?.trim()) {
    conds.push(sql`EXISTS (SELECT 1 FROM ${t.productTags} pt WHERE pt.store_id = ${t.products.storeId} AND pt.product_id = ${t.products.id} AND pt.tag = ${opts.tag.trim().slice(0, 30)})`);
  }
  if (opts.categorySlug) {
    const [cat] = await scope.from(t.categories, and(eq(t.categories.slug, opts.categorySlug), eq(t.categories.isVisible, true))!).limit(1);
    if (!cat) return { items: [], total: 0, page: 1, pageCount: 1 };
    const links = await scope.from(t.productCategories, eq(t.productCategories.categoryId, cat.id));
    conds.push(inArray(t.products.id, links.length ? links.map((l) => l.productId) : ["__none__"]));
  }
  const where = and(...conds);
  const size = Math.min(opts.pageSize ?? PAGE_SIZE, 48);
  const total = await scope.count(t.products, where);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, opts.page ?? 1), pageCount);
  const order =
    opts.sort === "price_asc" ? [t.products.price, t.products.id]
    : opts.sort === "price_desc" ? [desc(t.products.price), t.products.id]
    : [desc(t.products.createdAt), t.products.id];
  const rows = await scope.from(t.products, where).orderBy(...order).limit(size).offset((page - 1) * size);
  return { items: await toCards(scope, rows), total, page, pageCount };
}

/** قيم الخيارات المستعملة في المتجر (للفلاتر): نفس اسم الخيار يتجمع (مقاس، لون…) */
export async function queryFacets(scope: StoreScope): Promise<CatalogFacets> {
  const [opts, values, brands, tagRows] = await Promise.all([scope.from(t.productOptions), scope.from(t.productOptionValues).orderBy(t.productOptionValues.position), scope.from(t.brands).orderBy(t.brands.name), scope.from(t.productTags)]);
  const tagCount = new Map<string, number>();
  for (const r of tagRows) tagCount.set(r.tag, (tagCount.get(r.tag) ?? 0) + 1);
  const byName = new Map<string, Set<string>>();
  for (const o of opts) {
    const set = byName.get(o.name) ?? new Set<string>();
    for (const v of values) if (v.optionId === o.id) set.add(v.value);
    byName.set(o.name, set);
  }
  return {
    options: [...byName].map(([name, set]) => ({ name, values: [...set].slice(0, 24) })).filter((o) => o.values.length > 0).slice(0, 4),
    brands: brands.map((b) => ({ slug: b.slug, name: b.name })),
    tags: [...tagCount].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tg]) => tg),
  };
}

export async function queryProductDetail(scope: StoreScope, slug: string): Promise<ProductDetail | null> {
  const [p] = await scope.from(t.products, and(eq(t.products.slug, slug), visible())!).limit(1);
  if (!p) return null;
  const [imgs, opts, rawVars, cats, brandRow, tagRows] = await Promise.all([
    scope.from(t.productImages, eq(t.productImages.productId, p.id)).orderBy(t.productImages.position),
    scope.from(t.productOptions, eq(t.productOptions.productId, p.id)).orderBy(t.productOptions.position),
    scope.from(t.productVariants, and(eq(t.productVariants.productId, p.id), eq(t.productVariants.isActive, true))!).orderBy(t.productVariants.position),
    scope.from(t.productCategories, eq(t.productCategories.productId, p.id)),
    p.brandId ? scope.from(t.brands, eq(t.brands.id, p.brandId)).limit(1) : [],
    scope.from(t.productTags, eq(t.productTags.productId, p.id)),
  ]);
  const vars = await withBundleStock(scope, [p], rawVars);
  const optIds = opts.map((o) => o.id);
  const varIds = vars.map((v) => v.id);
  const [values, links, catRows] = await Promise.all([
    optIds.length ? scope.from(t.productOptionValues, inArray(t.productOptionValues.optionId, optIds)).orderBy(t.productOptionValues.position) : [],
    varIds.length ? scope.from(t.variantOptionValues, inArray(t.variantOptionValues.variantId, varIds)) : [],
    cats.length ? scope.from(t.categories, and(inArray(t.categories.id, cats.map((c) => c.categoryId)), eq(t.categories.isVisible, true))!) : [],
  ]);
  const variants = vars.map((v) => ({
    id: v.id, valueIds: links.filter((l) => l.variantId === v.id).map((l) => l.optionValueId), sku: v.sku,
    price: variantPrice(p, v), compareAt: variantCompareAt(p, v), stock: v.stock,
  }));
  const range = priceRange(p, vars);
  return {
    id: p.id, slug: p.slug, name: p.name, description: p.description, price: range.min, compareAt: range.compareAt, isFeatured: p.isFeatured,
    images: imgs.map((i) => i.mediaId),
    options: opts.map((o) => ({ id: o.id, name: o.name, values: values.filter((v) => v.optionId === o.id).map((v) => ({ id: v.id, value: v.value, colorHex: v.colorHex })) })),
    variants,
    categories: catRows.map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
    brand: brandRow[0] ? { name: brandRow[0].name, slug: brandRow[0].slug } : null,
    tags: tagRows.map((x) => x.tag).sort(),
    isBundle: p.kind === "bundle",
    personalization: p.personalizationLabel ? { label: p.personalizationLabel, maxChars: p.personalizationMaxChars ?? 40, price: p.personalizationPrice } : null,
    updatedAt: p.updatedAt.getTime(),
  };
}

export async function queryRelated(scope: StoreScope, productId: string, categoryIds: string[], limit = 8): Promise<CardProduct[]> {
  if (!categoryIds.length) return [];
  const links = await scope.from(t.productCategories, inArray(t.productCategories.categoryId, categoryIds));
  const ids = [...new Set(links.map((l) => l.productId))].filter((id) => id !== productId);
  if (!ids.length) return [];
  const rows = await scope.from(t.products, and(visible(), inArray(t.products.id, ids), ne(t.products.id, productId))!).orderBy(desc(t.products.createdAt)).limit(limit);
  return toCards(scope, rows);
}

// ===== التوصيل =====

export async function queryDeliveryRates(db: Db, scope: StoreScope): Promise<DeliveryRate[]> {
  const rates = await scope.from(t.deliveryRates, eq(t.deliveryRates.isActive, true));
  if (!rates.length) return [];
  const cityRows = await db.select().from(cities).where(inArray(cities.id, rates.map((r) => r.cityId)));
  const byId = new Map(cityRows.map((c) => [c.id, c]));
  return rates
    .map((r) => ({ r, c: byId.get(r.cityId) }))
    .filter((x): x is { r: typeof x.r; c: NonNullable<typeof x.c> } => !!x.c)
    .sort((a, b) => a.c.sortOrder - b.c.sortOrder)
    .map(({ r, c }) => ({ cityId: c.id, city: c.nameAr, fee: r.fee, eta: r.etaText }));
}

// ===== السلة =====

/** يحل بنود السلة (variantId + كمية) لبيانات حقيقية. البنود غير المتاحة تنشال. الكمية تتقص على المخزون. */
export async function resolveCart(scope: StoreScope, items: { variantId: string; quantity: number; note?: string | null }[]): Promise<CartLine[]> {
  const wanted = items.filter((i) => i.variantId && Number.isInteger(i.quantity) && i.quantity > 0).slice(0, 50);
  if (!wanted.length) return [];
  const rawVariants = await scope.from(t.productVariants, and(inArray(t.productVariants.id, wanted.map((w) => w.variantId)), eq(t.productVariants.isActive, true))!);
  if (!rawVariants.length) return [];
  const products = await scope.from(t.products, and(inArray(t.products.id, [...new Set(rawVariants.map((v) => v.productId))]), visible())!);
  const variants = await withBundleStock(scope, products, rawVariants);
  const pById = new Map(products.map((p) => [p.id, p]));
  const labels = await variantLabels(scope, variants.map((v) => v.id));
  const images = products.length ? await scope.from(t.productImages, inArray(t.productImages.productId, products.map((p) => p.id))).orderBy(t.productImages.position) : [];

  const lines: CartLine[] = [];
  for (const w of wanted) {
    const v = variants.find((x) => x.id === w.variantId);
    const p = v ? pById.get(v.productId) : undefined;
    if (!v || !p || v.stock <= 0) continue;
    const merged = lines.find((l) => l.variantId === v.id);
    const qty = Math.min(w.quantity + (merged?.quantity ?? 0), v.stock, 20);
    if (merged) { merged.quantity = qty; continue; }
    const note = p.personalizationLabel && w.note ? w.note.trim().slice(0, p.personalizationMaxChars ?? 40) : null;
    lines.push({
      variantId: v.id, productId: p.id, slug: p.slug, name: p.name, variantLabel: labels.get(v.id) ?? null, note,
      price: variantPrice(p, v) + (note ? p.personalizationPrice : 0), compareAt: variantCompareAt(p, v), stock: v.stock, quantity: qty,
      image: images.find((i) => i.productId === p.id)?.mediaId ?? null,
    });
  }
  return lines;
}

/** "M / أسود" لكل متغير */
export async function variantLabels(scope: StoreScope, variantIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!variantIds.length) return out;
  const links = await scope.from(t.variantOptionValues, inArray(t.variantOptionValues.variantId, variantIds));
  if (!links.length) return out;
  const values = await scope.from(t.productOptionValues, inArray(t.productOptionValues.id, links.map((l) => l.optionValueId)));
  const vById = new Map(values.map((v) => [v.id, v]));
  for (const id of variantIds) {
    const parts = links.filter((l) => l.variantId === id).map((l) => vById.get(l.optionValueId)).filter(Boolean).sort((a, b) => a!.optionId.localeCompare(b!.optionId));
    if (parts.length) out.set(id, parts.map((p) => p!.value).join(" / "));
  }
  return out;
}

// ===== خريطة الموقع =====

export async function querySitemap(scope: StoreScope) {
  const [products, categories, pages] = await Promise.all([
    scope.from(t.products, visible()),
    scope.from(t.categories, eq(t.categories.isVisible, true)),
    scope.from(t.storePages, eq(t.storePages.isPublished, true)),
  ]);
  return {
    products: products.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt.getTime() })),
    categories: categories.map((c) => ({ slug: c.slug })),
    pages: pages.map((p) => ({ slug: p.slug })),
  };
}
