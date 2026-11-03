// كل جدول هنا خاص بمتجر ولازم يحمل store_id. الوصول له فقط عبر forStore(storeId) في src/server/tenant.
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, pk, scopedFk, updatedAt } from "./_helpers";
import { cities, media, stores, users } from "./platform";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/constants";
import { PAY_METHODS } from "@/lib/constants";
import type { PosConfig } from "@/lib/pos-config";

const storeIdCol = () =>
  text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" });

// ===== إعدادات ومحتوى المتجر =====

export const storeSettings = sqliteTable("store_settings", {
  storeId: text("store_id").primaryKey().references(() => stores.id, { onDelete: "cascade" }),
  cityId: text("city_id").references(() => cities.id), // مدينة البياع الرئيسية
  contactPhone: text("contact_phone"),
  whatsapp: text("whatsapp"),
  email: text("email"),
  address: text("address"),
  instagram: text("instagram"),
  tiktok: text("tiktok"),
  facebook: text("facebook"),
  snapchat: text("snapchat"),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  ogMediaId: text("og_media_id"),
  metaPixelId: text("meta_pixel_id"),
  tiktokPixelId: text("tiktok_pixel_id"),
  thanksMessage: text("thanks_message"),
  announcementBar: text("announcement_bar"),
  footerText: text("footer_text"),
  primaryColor: text("primary_color").notNull().default("#0D263E"),
  accentColor: text("accent_color").notNull().default("#C19E58"),
  fontKey: text("font_key").notNull().default("ibm-plex"),
  freeDeliveryOver: integer("free_delivery_over"), // بالدرهم، null = بدون
  abandonedRetentionDays: integer("abandoned_retention_days").notNull().default(30), // مدة الاحتفاظ بالسلات المتروكة
  /** قوالب روابط تتبع الشحنة لكل شركة: {vanex: "https://…/{n}"} — {n} = رقم الشحنة. يحددها البياع (ما نخترعش روابط). */
  shippingTrackingUrls: text("shipping_tracking_urls", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
  /** إعدادات الكاشير (الفاتورة، الموافقات، الولاء، الدين) */
  posConfig: text("pos_config", { mode: "json" }).$type<PosConfig>().notNull().default({}),
  updatedAt: updatedAt(),
});


export const storePages = sqliteTable(
  "store_pages",
  {
    id: pk(),
    storeId: storeIdCol(),
    slug: text("slug").notNull(), // about, shipping, returns, privacy, contact…
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    isPublished: integer("is_published", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("store_pages_slug_uq").on(t.storeId, t.slug)],
);

export const storeHomeSections = sqliteTable(
  "store_home_sections",
  {
    id: pk(),
    storeId: storeIdCol(),
    type: text("type").notNull(), // hero, categories, featured, banner, text…
    position: integer("position").notNull().default(0),
    config: text("config", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("home_sections_idx").on(t.storeId, t.position)],
);

export const storePaymentMethods = sqliteTable(
  "store_payment_methods",
  {
    id: pk(),
    storeId: storeIdCol(),
    method: text("method").$type<PaymentMethod>().notNull(),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
    config: text("config", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("store_payment_methods_uq").on(t.storeId, t.method)],
);

/**
 * سلات متروكة: الزبون كتب رقم هاتفه في صفحة إتمام الطلب وما كمّل. سلة مفتوحة وحدة لكل رقم (تتحدّث).
 * تتمسح بعد 30 يوم. البياع يذكّر الزبون على واتساب، وتنقفل (recoveredAt) لما الزبون يطلب.
 */
export const abandonedCarts = sqliteTable(
  "abandoned_carts",
  {
    id: pk(),
    storeId: storeIdCol(),
    phone: text("phone").notNull(),
    name: text("name"),
    items: text("items", { mode: "json" }).$type<{ name: string; variantLabel: string | null; quantity: number; price: number; variantId?: string; note?: string | null }[]>().notNull(),
    itemCount: integer("item_count").notNull(),
    total: integer("total").notNull(), // بالدرهم (1 د.ل = 1000)
    remindedAt: integer("reminded_at", { mode: "timestamp_ms" }),
    recoveredAt: integer("recovered_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    // آخر نشاط للزبون (ما نستعملش updatedAt التلقائي: التذكير والإغلاق ما يلزم يصفّروا مؤقت الخمول)
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("abandoned_carts_phone_uq").on(t.storeId, t.phone), index("abandoned_carts_activity_idx").on(t.storeId, t.lastActivityAt)],
);

/** اشتراكات Web Push لأجهزة البياع والموظفين (إشعار الطلبية الجديدة). المفتاح (store_id, endpoint). */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: pk(),
    storeId: storeIdCol(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("push_subscriptions_uq").on(t.storeId, t.endpoint), index("push_subscriptions_user_idx").on(t.storeId, t.userId)],
);

export const whatsappTemplates = sqliteTable(
  "whatsapp_templates",
  {
    id: pk(),
    storeId: storeIdCol(),
    key: text("key").notNull(), // حالة الطلبية أو new_order_confirm
    body: text("body").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("whatsapp_templates_uq").on(t.storeId, t.key)],
);

// ===== الكتالوج =====

export const categories = sqliteTable(
  "categories",
  {
    id: pk(),
    storeId: storeIdCol(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    imageMediaId: text("image_media_id"),
    position: integer("position").notNull().default(0),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("categories_store_id_uq").on(t.storeId, t.id),
    uniqueIndex("categories_slug_uq").on(t.storeId, t.slug),
    scopedFk("categories_image_fk", [t.storeId, t.imageMediaId], [media.storeId, media.id]),
  ],
);

export const products = sqliteTable(
  "products",
  {
    id: pk(),
    storeId: storeIdCol(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    // السعر الأساسي. المتغيرات (variants) ممكن يكون لها سعر خاص يغلبه.
    price: integer("price").notNull(),
    compareAtPrice: integer("compare_at_price"),
    costPrice: integer("cost_price"),
    isFeatured: integer("is_featured", { mode: "boolean" }).notNull().default(false),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
    position: integer("position").notNull().default(0),
    brandId: text("brand_id"), // البراند من نفس المتجر (يتأكد في الخدمة)
    kind: text("kind", { enum: ["simple", "bundle"] }).notNull().default("simple"), // bundle: مخزونه من مكوناته
    // تخصيص (نقش / إهداء): label موجود = مفعّل
    personalizationLabel: text("personalization_label"),
    personalizationMaxChars: integer("personalization_max_chars"),
    personalizationPrice: integer("personalization_price").notNull().default(0),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }), // حذف ناعم علشان الطلبيات القديمة
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("products_store_id_uq").on(t.storeId, t.id),
    uniqueIndex("products_slug_uq").on(t.storeId, t.slug),
    index("products_list_idx").on(t.storeId, t.isVisible, t.position),
  ],
);

export const productCategories = sqliteTable(
  "product_categories",
  {
    storeId: storeIdCol(),
    productId: text("product_id").notNull(),
    categoryId: text("category_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.categoryId] }),
    scopedFk("pc_product_fk", [t.storeId, t.productId], [products.storeId, products.id], "cascade"),
    scopedFk("pc_category_fk", [t.storeId, t.categoryId], [categories.storeId, categories.id], "cascade"),
  ],
);

export const productImages = sqliteTable(
  "product_images",
  {
    id: pk(),
    storeId: storeIdCol(),
    productId: text("product_id").notNull(),
    mediaId: text("media_id").notNull(),
    position: integer("position").notNull().default(0),
    alt: text("alt"),
  },
  (t) => [
    index("product_images_idx").on(t.storeId, t.productId, t.position),
    scopedFk("pi_product_fk", [t.storeId, t.productId], [products.storeId, products.id], "cascade"),
    scopedFk("pi_media_fk", [t.storeId, t.mediaId], [media.storeId, media.id]),
  ],
);

export const productOptions = sqliteTable(
  "product_options",
  {
    id: pk(),
    storeId: storeIdCol(),
    productId: text("product_id").notNull(),
    name: text("name").notNull(), // مقاس، لون…
    position: integer("position").notNull().default(0),
  },
  (t) => [
    uniqueIndex("product_options_store_id_uq").on(t.storeId, t.id),
    scopedFk("po_product_fk", [t.storeId, t.productId], [products.storeId, products.id], "cascade"),
  ],
);

export const productOptionValues = sqliteTable(
  "product_option_values",
  {
    id: pk(),
    storeId: storeIdCol(),
    optionId: text("option_id").notNull(),
    value: text("value").notNull(),
    colorHex: text("color_hex"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    uniqueIndex("product_option_values_store_id_uq").on(t.storeId, t.id),
    scopedFk("pov_option_fk", [t.storeId, t.optionId], [productOptions.storeId, productOptions.id], "cascade"),
  ],
);

// كل منتج له متغير واحد على الأقل (متغير افتراضي لو بدون خيارات) علشان المخزون يكون دايماً على المتغير.
export const productVariants = sqliteTable(
  "product_variants",
  {
    id: pk(),
    storeId: storeIdCol(),
    productId: text("product_id").notNull(),
    sku: text("sku"),
    price: integer("price"), // null = يستعمل سعر المنتج
    compareAtPrice: integer("compare_at_price"),
    costPrice: integer("cost_price"),
    stock: integer("stock").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    imageMediaId: text("image_media_id"),
    position: integer("position").notNull().default(0),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }), // تاريخ انتهاء اختياري
    minStock: integer("min_stock"), // حد التنبيه «قرب يخلص» (null = الافتراضي)
  },
  (t) => [
    uniqueIndex("product_variants_store_id_uq").on(t.storeId, t.id),
    index("product_variants_product_idx").on(t.storeId, t.productId),
    scopedFk("pv_product_fk", [t.storeId, t.productId], [products.storeId, products.id], "cascade"),
    scopedFk("pv_image_fk", [t.storeId, t.imageMediaId], [media.storeId, media.id]),
  ],
);

export const variantOptionValues = sqliteTable(
  "variant_option_values",
  {
    storeId: storeIdCol(),
    variantId: text("variant_id").notNull(),
    optionValueId: text("option_value_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.variantId, t.optionValueId] }),
    scopedFk("vov_variant_fk", [t.storeId, t.variantId], [productVariants.storeId, productVariants.id], "cascade"),
    scopedFk("vov_value_fk", [t.storeId, t.optionValueId], [productOptionValues.storeId, productOptionValues.id], "cascade"),
  ],
);

// ===== التوصيل والزبائن والمندوبين =====

export const deliveryRates = sqliteTable(
  "delivery_rates",
  {
    id: pk(),
    storeId: storeIdCol(),
    cityId: text("city_id").notNull().references(() => cities.id),
    fee: integer("fee").notNull().default(0),
    etaText: text("eta_text"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [uniqueIndex("delivery_rates_uq").on(t.storeId, t.cityId)],
);

export const couriers = sqliteTable(
  "couriers",
  {
    id: pk(),
    storeId: storeIdCol(),
    name: text("name").notNull(),
    phone: text("phone"),
    kind: text("kind", { enum: ["person", "company"] }).notNull().default("person"),
    userId: text("user_id"), // لو المندوب عنده حساب يشوف طلبياته
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("couriers_store_id_uq").on(t.storeId, t.id)],
);

export const customers = sqliteTable(
  "customers",
  {
    id: pk(),
    storeId: storeIdCol(),
    phone: text("phone").notNull(),
    name: text("name").notNull(),
    ordersCount: integer("orders_count").notNull().default(0),
    deliveredCount: integer("delivered_count").notNull().default(0),
    returnedCount: integer("returned_count").notNull().default(0),
    totalSpent: integer("total_spent").notNull().default(0),
    flag: text("flag", { enum: ["none", "problematic"] }).notNull().default("none"),
    notes: text("notes"),
    /** حد الدين (null = حسب الإعداد العام، 0 = ممنوع الدين) */
    creditLimit: integer("credit_limit"),
    /** مستوى السعر للزبون (جملة/نص جملة) */
    priceLevel: text("price_level", { enum: ["retail", "semi", "wholesale"] }).notNull().default("retail"),
    birthDate: text("birth_date"), // YYYY-MM-DD
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("customers_store_id_uq").on(t.storeId, t.id),
    uniqueIndex("customers_phone_uq").on(t.storeId, t.phone),
  ],
);

// ===== الكوبونات =====

export const coupons = sqliteTable(
  "coupons",
  {
    id: pk(),
    storeId: storeIdCol(),
    code: text("code").notNull(),
    type: text("type", { enum: ["percent", "fixed"] }).notNull(),
    value: integer("value").notNull(), // نسبة (1-100) أو مبلغ بالدرهم
    minOrder: integer("min_order"),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("coupons_store_id_uq").on(t.storeId, t.id),
    uniqueIndex("coupons_code_uq").on(t.storeId, t.code),
  ],
);

// ===== الكتالوج: براندات، وسوم، مكتبة خيارات، باقات مجمعة =====

export const brands = sqliteTable(
  "brands",
  {
    id: pk(),
    storeId: storeIdCol(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("brands_store_id_uq").on(t.storeId, t.id),
    uniqueIndex("brands_slug_uq").on(t.storeId, t.slug),
  ],
);

export const productTags = sqliteTable(
  "product_tags",
  {
    storeId: storeIdCol(),
    productId: text("product_id").notNull(),
    tag: text("tag").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.tag] }),
    index("product_tags_tag_idx").on(t.storeId, t.tag),
    scopedFk("ptag_product_fk", [t.storeId, t.productId], [products.storeId, products.id], "cascade"),
  ],
);

/** مكتبة الخيارات: «المقاسات: S, M, L» تتعرف مرة وتتحط في أي منتج */
export const optionPresets = sqliteTable(
  "option_presets",
  {
    id: pk(),
    storeId: storeIdCol(),
    name: text("name").notNull(),
    values: text("values", { mode: "json" }).$type<{ value: string; colorHex: string | null }[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("option_presets_store_id_uq").on(t.storeId, t.id),
    uniqueIndex("option_presets_name_uq").on(t.storeId, t.name),
  ],
);

/** مكونات الباقة المجمعة: المنتج من نوع bundle يتكون من متغيرات بكميات */
export const bundleItems = sqliteTable(
  "bundle_items",
  {
    storeId: storeIdCol(),
    bundleProductId: text("bundle_product_id").notNull(),
    variantId: text("variant_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.bundleProductId, t.variantId] }),
    scopedFk("bi_bundle_fk", [t.storeId, t.bundleProductId], [products.storeId, products.id], "cascade"),
    scopedFk("bi_variant_fk", [t.storeId, t.variantId], [productVariants.storeId, productVariants.id], "cascade"),
  ],
);

// ===== أدوار مخصصة وتحليلات =====

export const storeRoles = sqliteTable(
  "store_roles",
  {
    id: pk(),
    storeId: storeIdCol(),
    name: text("name").notNull(),
    permissions: text("permissions", { mode: "json" }).$type<string[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("store_roles_store_id_uq").on(t.storeId, t.id),
    uniqueIndex("store_roles_name_uq").on(t.storeId, t.name),
  ],
);

/** زيارات المتجر مجمّعة باليوم (بدون كوكيز ولا بيانات شخصية): يوم × نوع الصفحة × المصدر */
export const storeVisits = sqliteTable(
  "store_visits",
  {
    storeId: storeIdCol(),
    day: text("day").notNull(), // yyyy-mm-dd بتوقيت ليبيا
    kind: text("kind", { enum: ["home", "category", "product", "cart", "checkout", "other"] }).notNull(),
    source: text("source").notNull(), // instagram | tiktok | whatsapp | facebook | google | direct | other
    productId: text("product_id").notNull().default(""),
    views: integer("views").notNull().default(0),
    sessions: integer("sessions").notNull().default(0), // عدد الزيارات (أول صفحة في الجلسة)
  },
  (t) => [primaryKey({ columns: [t.storeId, t.day, t.kind, t.source, t.productId] })],
);

// ===== وحدة المخازن =====
// المخزون الكلي لكل متغير يبقى في product_variants.stock. المخزن الرئيسي (isDefault) كميته = الكلي − مجموع باقي المخازن،
// وباقي المخازن كمياتها مخزّنة هنا. فكل مسار قديم (طلبية، مرتجع، تعديل) يشتغل على الرئيسي تلقائياً.

export const warehouses = sqliteTable(
  "warehouses",
  {
    id: pk(),
    storeId: storeIdCol(),
    name: text("name").notNull(),
    address: text("address"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    isLocked: integer("is_locked", { mode: "boolean" }).notNull().default(false), // مقفول أثناء الجرد
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("warehouses_store_id_uq").on(t.storeId, t.id), uniqueIndex("warehouses_name_uq").on(t.storeId, t.name)],
);

export const warehouseStock = sqliteTable(
  "warehouse_stock",
  {
    storeId: storeIdCol(),
    warehouseId: text("warehouse_id").notNull(),
    variantId: text("variant_id").notNull(),
    quantity: integer("quantity").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.warehouseId, t.variantId] }),
    scopedFk("ws_warehouse_fk", [t.storeId, t.warehouseId], [warehouses.storeId, warehouses.id], "cascade"),
    scopedFk("ws_variant_fk", [t.storeId, t.variantId], [productVariants.storeId, productVariants.id], "cascade"),
  ],
);

export const stockTransfers = sqliteTable(
  "stock_transfers",
  {
    id: pk(),
    storeId: storeIdCol(),
    number: integer("number").notNull(),
    fromWarehouseId: text("from_warehouse_id").notNull(),
    toWarehouseId: text("to_warehouse_id").notNull(),
    status: text("status", { enum: ["draft", "in_transit", "received", "cancelled"] }).notNull().default("draft"),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("stock_transfers_store_id_uq").on(t.storeId, t.id),
    uniqueIndex("stock_transfers_number_uq").on(t.storeId, t.number),
    scopedFk("st_from_fk", [t.storeId, t.fromWarehouseId], [warehouses.storeId, warehouses.id]),
    scopedFk("st_to_fk", [t.storeId, t.toWarehouseId], [warehouses.storeId, warehouses.id]),
  ],
);

export const stockTransferItems = sqliteTable(
  "stock_transfer_items",
  {
    storeId: storeIdCol(),
    transferId: text("transfer_id").notNull(),
    variantId: text("variant_id").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.transferId, t.variantId] }),
    scopedFk("sti_transfer_fk", [t.storeId, t.transferId], [stockTransfers.storeId, stockTransfers.id], "cascade"),
    scopedFk("sti_variant_fk", [t.storeId, t.variantId], [productVariants.storeId, productVariants.id]),
  ],
);

export const stocktakes = sqliteTable(
  "stocktakes",
  {
    id: pk(),
    storeId: storeIdCol(),
    warehouseId: text("warehouse_id").notNull(),
    status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
    lockWarehouse: integer("lock_warehouse", { mode: "boolean" }).notNull().default(false),
    note: text("note"),
    createdAt: createdAt(),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("stocktakes_store_id_uq").on(t.storeId, t.id),
    scopedFk("stk_warehouse_fk", [t.storeId, t.warehouseId], [warehouses.storeId, warehouses.id]),
  ],
);

export const stocktakeItems = sqliteTable(
  "stocktake_items",
  {
    storeId: storeIdCol(),
    stocktakeId: text("stocktake_id").notNull(),
    variantId: text("variant_id").notNull(),
    expected: integer("expected").notNull(), // الرصيد وقت فتح الجرد
    counted: integer("counted"), // null = لسا ما اتعدّ
  },
  (t) => [
    primaryKey({ columns: [t.stocktakeId, t.variantId] }),
    scopedFk("stki_stocktake_fk", [t.storeId, t.stocktakeId], [stocktakes.storeId, stocktakes.id], "cascade"),
    scopedFk("stki_variant_fk", [t.storeId, t.variantId], [productVariants.storeId, productVariants.id]),
  ],
);

// ===== وحدة المشتريات والموردين =====

export const suppliers = sqliteTable(
  "suppliers",
  {
    id: pk(),
    storeId: storeIdCol(),
    name: text("name").notNull(),
    phone: text("phone"),
    city: text("city"),
    notes: text("notes"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("suppliers_store_id_uq").on(t.storeId, t.id)],
);

export const purchaseInvoices = sqliteTable(
  "purchase_invoices",
  {
    id: pk(),
    storeId: storeIdCol(),
    number: integer("number").notNull(),
    supplierId: text("supplier_id").notNull(),
    warehouseId: text("warehouse_id"), // null = الرئيسي
    status: text("status", { enum: ["draft", "partial", "received", "cancelled"] }).notNull().default("draft"),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("purchase_invoices_store_id_uq").on(t.storeId, t.id),
    uniqueIndex("purchase_invoices_number_uq").on(t.storeId, t.number),
    scopedFk("pi_supplier_fk", [t.storeId, t.supplierId], [suppliers.storeId, suppliers.id]),
  ],
);

export const purchaseItems = sqliteTable(
  "purchase_items",
  {
    id: pk(),
    storeId: storeIdCol(),
    invoiceId: text("invoice_id").notNull(),
    variantId: text("variant_id").notNull(),
    quantity: integer("quantity").notNull(),
    receivedQuantity: integer("received_quantity").notNull().default(0),
    unitCost: integer("unit_cost").notNull(),
  },
  (t) => [
    uniqueIndex("purchase_items_store_id_uq").on(t.storeId, t.id),
    index("purchase_items_invoice_idx").on(t.storeId, t.invoiceId),
    scopedFk("pit_invoice_fk", [t.storeId, t.invoiceId], [purchaseInvoices.storeId, purchaseInvoices.id], "cascade"),
    scopedFk("pit_variant_fk", [t.storeId, t.variantId], [productVariants.storeId, productVariants.id]),
  ],
);

export const supplierReturns = sqliteTable(
  "supplier_returns",
  {
    id: pk(),
    storeId: storeIdCol(),
    supplierId: text("supplier_id").notNull(),
    variantId: text("variant_id").notNull(),
    warehouseId: text("warehouse_id"),
    quantity: integer("quantity").notNull(),
    unitCost: integer("unit_cost").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    scopedFk("sr_supplier_fk", [t.storeId, t.supplierId], [suppliers.storeId, suppliers.id]),
    scopedFk("sr_variant_fk", [t.storeId, t.variantId], [productVariants.storeId, productVariants.id]),
  ],
);

// ===== وحدة الحسابات =====

export const finAccounts = sqliteTable(
  "fin_accounts",
  {
    id: pk(),
    storeId: storeIdCol(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["cash", "bank", "wallet"] }).notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false), // الافتراضي لكل نوع (خزنة/بنك)
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("fin_accounts_store_id_uq").on(t.storeId, t.id), uniqueIndex("fin_accounts_name_uq").on(t.storeId, t.name)],
);

/** دفتر الحركات: غير قابل للتعديل ولا الحذف. التصحيح بحركة عكسية (reversesId). المبلغ موجب = دخل، سالب = خرج. */
export const ledgerEntries = sqliteTable(
  "ledger_entries",
  {
    id: pk(),
    storeId: storeIdCol(),
    accountId: text("account_id").notNull(),
    amount: integer("amount").notNull(),
    kind: text("kind", {
      enum: ["courier_settlement", "bank_transfer", "supplier_payment", "expense", "customer_refund", "deposit", "withdrawal", "transfer_in", "transfer_out", "receivable_payment", "closing_adjustment", "opening", "reversal",
        "pos_sale", "pos_refund", "cash_in", "cash_out", "debt_payment", "wallet_topup", "shift_difference"],
    }).notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    groupId: text("group_id"), // يربط طرفي التحويل
    reversesId: text("reverses_id"),
    memo: text("memo"),
    actorUserId: text("actor_user_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("ledger_store_id_uq").on(t.storeId, t.id),
    uniqueIndex("ledger_reverses_uq").on(t.storeId, t.reversesId), // الحركة تتعكس مرة وحدة بس
    index("ledger_account_idx").on(t.storeId, t.accountId, t.createdAt),
    scopedFk("le_account_fk", [t.storeId, t.accountId], [finAccounts.storeId, finAccounts.id]),
  ],
);

export const expenseCategories = sqliteTable(
  "expense_categories",
  {
    id: pk(),
    storeId: storeIdCol(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("expense_categories_store_id_uq").on(t.storeId, t.id), uniqueIndex("expense_categories_name_uq").on(t.storeId, t.name)],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: pk(),
    storeId: storeIdCol(),
    categoryId: text("category_id"),
    accountId: text("account_id").notNull(),
    amount: integer("amount").notNull(), // موجب
    note: text("note"),
    receiptMediaId: text("receipt_media_id"),
    spentAt: integer("spent_at", { mode: "timestamp_ms" }).notNull(),
    ledgerEntryId: text("ledger_entry_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("expenses_store_id_uq").on(t.storeId, t.id),
    index("expenses_date_idx").on(t.storeId, t.spentAt),
    scopedFk("ex_category_fk", [t.storeId, t.categoryId], [expenseCategories.storeId, expenseCategories.id]),
    scopedFk("ex_account_fk", [t.storeId, t.accountId], [finAccounts.storeId, finAccounts.id]),
    scopedFk("ex_receipt_fk", [t.storeId, t.receiptMediaId], [media.storeId, media.id]),
  ],
);

export const supplierPayments = sqliteTable(
  "supplier_payments",
  {
    id: pk(),
    storeId: storeIdCol(),
    supplierId: text("supplier_id").notNull(),
    accountId: text("account_id"), // null لو الحسابات مطفية
    amount: integer("amount").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    scopedFk("sp_supplier_fk", [t.storeId, t.supplierId], [suppliers.storeId, suppliers.id]),
    scopedFk("sp_account_fk", [t.storeId, t.accountId], [finAccounts.storeId, finAccounts.id]),
  ],
);

/** ديون الزباين: زبون عليه فلوس بتاريخ استحقاق */
export const receivables = sqliteTable(
  "receivables",
  {
    id: pk(),
    storeId: storeIdCol(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone"),
    amount: integer("amount").notNull(),
    paid: integer("paid").notNull().default(0),
    dueDate: integer("due_date", { mode: "timestamp_ms" }),
    note: text("note"),
    orderId: text("order_id"),
    createdAt: createdAt(),
    remindedAt: integer("reminded_at", { mode: "timestamp_ms" }),
  },
  (t) => [uniqueIndex("receivables_store_id_uq").on(t.storeId, t.id), scopedFk("rc_order_fk", [t.storeId, t.orderId], [orders.storeId, orders.id])],
);

/** إقفال الخزنة: الرصيد المتوقع (من الدفتر) مقابل الفعلي (جرد النقد) */
export const cashClosings = sqliteTable(
  "cash_closings",
  {
    id: pk(),
    storeId: storeIdCol(),
    accountId: text("account_id").notNull(),
    expected: integer("expected").notNull(),
    actual: integer("actual").notNull(),
    difference: integer("difference").notNull(),
    note: text("note"),
    actorUserId: text("actor_user_id"),
    createdAt: createdAt(),
  },
  (t) => [scopedFk("cc_account_fk", [t.storeId, t.accountId], [finAccounts.storeId, finAccounts.id])],
);

// ===== صندوق الرسائل (هيكل فقط — «قريباً»: ما فيه ربط حقيقي مع أي قناة) =====

export const inboxChannels = sqliteTable(
  "inbox_channels",
  {
    id: pk(),
    storeId: storeIdCol(),
    kind: text("kind", { enum: ["instagram", "facebook", "whatsapp", "site"] }).notNull(),
    label: text("label").notNull(),
    status: text("status", { enum: ["disconnected", "connected", "error"] }).notNull().default("disconnected"),
    externalId: text("external_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("inbox_channels_store_id_uq").on(t.storeId, t.id), uniqueIndex("inbox_channels_kind_uq").on(t.storeId, t.kind)],
);

export const inboxConversations = sqliteTable(
  "inbox_conversations",
  {
    id: pk(),
    storeId: storeIdCol(),
    channelId: text("channel_id").notNull(),
    customerId: text("customer_id"), // ربط بالزبون لو عرفناه
    orderId: text("order_id"), // بعد التحويل لطلبية
    externalThreadId: text("external_thread_id"),
    participantName: text("participant_name").notNull(),
    participantHandle: text("participant_handle"),
    status: text("status", { enum: ["open", "closed", "converted"] }).notNull().default("open"),
    unreadCount: integer("unread_count").notNull().default(0),
    lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("inbox_conv_store_id_uq").on(t.storeId, t.id),
    index("inbox_conv_last_idx").on(t.storeId, t.lastMessageAt),
    scopedFk("ic_channel_fk", [t.storeId, t.channelId], [inboxChannels.storeId, inboxChannels.id], "cascade"),
    scopedFk("ic_customer_fk", [t.storeId, t.customerId], [customers.storeId, customers.id]),
    scopedFk("ic_order_fk", [t.storeId, t.orderId], [orders.storeId, orders.id]),
  ],
);

export const inboxMessages = sqliteTable(
  "inbox_messages",
  {
    id: pk(),
    storeId: storeIdCol(),
    conversationId: text("conversation_id").notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    body: text("body").notNull(),
    externalId: text("external_id"),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index("inbox_msg_conv_idx").on(t.storeId, t.conversationId, t.sentAt),
    scopedFk("im_conv_fk", [t.storeId, t.conversationId], [inboxConversations.storeId, inboxConversations.id], "cascade"),
  ],
);

// ===== تقييمات المنتجات =====

export const productReviews = sqliteTable(
  "product_reviews",
  {
    id: pk(),
    storeId: storeIdCol(),
    productId: text("product_id").notNull(),
    orderId: text("order_id"), // مشترٍ موثّق = طلبية مسلّمة فيها المنتج
    customerName: text("customer_name").notNull(),
    rating: integer("rating").notNull(), // 1-5
    body: text("body"),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
    isVerified: integer("is_verified", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("product_reviews_store_id_uq").on(t.storeId, t.id),
    index("product_reviews_product_idx").on(t.storeId, t.productId, t.status),
    uniqueIndex("product_reviews_order_product_uq").on(t.storeId, t.orderId, t.productId),
    scopedFk("pr_product_fk", [t.storeId, t.productId], [products.storeId, products.id], "cascade"),
  ],
);

// ===== الطلبيات =====

export const orders = sqliteTable(
  "orders",
  {
    id: pk(),
    storeId: storeIdCol(),
    number: integer("number").notNull(), // تسلسلي لكل متجر
    trackingToken: text("tracking_token").notNull(),
    customerId: text("customer_id").notNull(),
    // لقطة وقت الطلب (ما تتغيرش لو الزبون عدّل بياناته بعدين)
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    cityId: text("city_id").notNull().references(() => cities.id),
    cityName: text("city_name").notNull(),
    address: text("address").notNull(),
    notes: text("notes"),
    status: text("status").$type<OrderStatus>().notNull().default("new"),
    paymentMethod: text("payment_method").$type<PaymentMethod>().notNull().default("cod"),
    paymentStatus: text("payment_status").$type<PaymentStatus>().notNull().default("pending"),
    subtotal: integer("subtotal").notNull(),
    discount: integer("discount").notNull().default(0),
    deliveryFee: integer("delivery_fee").notNull().default(0),
    total: integer("total").notNull(),
    couponId: text("coupon_id"),
    couponCode: text("coupon_code"),
    courierId: text("courier_id"),
    shipmentNumber: text("shipment_number"),
    shippingCompany: text("shipping_company"), // vanex | darb | nawras | other
    warehouseId: text("warehouse_id"), // المخزن اللي انسحبت منه الطلبية (null = الرئيسي)
    internalNotes: text("internal_notes"),
    source: text("source"), // instagram, tiktok, direct…
    /** ترتيب الطلبية في شهرها (بتوقيت ليبيا) وقت إنشائها: لحد «طلبيات في الشهر». null = قديمة (ظاهرة دايماً) */
    monthRank: integer("month_rank"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_store_id_uq").on(t.storeId, t.id),
    uniqueIndex("orders_number_uq").on(t.storeId, t.number),
    index("orders_status_idx").on(t.storeId, t.status, t.createdAt),
    index("orders_customer_idx").on(t.storeId, t.customerId),
    index("orders_courier_idx").on(t.storeId, t.courierId),
    scopedFk("orders_customer_fk", [t.storeId, t.customerId], [customers.storeId, customers.id]),
    scopedFk("orders_coupon_fk", [t.storeId, t.couponId], [coupons.storeId, coupons.id]),
    scopedFk("orders_courier_fk", [t.storeId, t.courierId], [couriers.storeId, couriers.id]),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: pk(),
    storeId: storeIdCol(),
    orderId: text("order_id").notNull(),
    productId: text("product_id").notNull(),
    variantId: text("variant_id").notNull(),
    name: text("name").notNull(),
    variantLabel: text("variant_label"),
    unitPrice: integer("unit_price").notNull(),
    unitCost: integer("unit_cost"),
    quantity: integer("quantity").notNull(),
    imageMediaId: text("image_media_id"),
    personalizationText: text("personalization_text"), // نقش / رسالة إهداء كتبها الزبون
  },
  (t) => [
    uniqueIndex("order_items_store_id_uq").on(t.storeId, t.id),
    index("order_items_order_idx").on(t.storeId, t.orderId),
    scopedFk("oi_order_fk", [t.storeId, t.orderId], [orders.storeId, orders.id], "cascade"),
    scopedFk("oi_product_fk", [t.storeId, t.productId], [products.storeId, products.id]),
    scopedFk("oi_variant_fk", [t.storeId, t.variantId], [productVariants.storeId, productVariants.id]),
  ],
);

export const orderStatusHistory = sqliteTable(
  "order_status_history",
  {
    id: pk(),
    storeId: storeIdCol(),
    orderId: text("order_id").notNull(),
    fromStatus: text("from_status").$type<OrderStatus>(),
    toStatus: text("to_status").$type<OrderStatus>().notNull(),
    note: text("note"),
    actorUserId: text("actor_user_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("osh_order_idx").on(t.storeId, t.orderId, t.createdAt),
    scopedFk("osh_order_fk", [t.storeId, t.orderId], [orders.storeId, orders.id], "cascade"),
  ],
);

export const paymentReceipts = sqliteTable(
  "payment_receipts",
  {
    id: pk(),
    storeId: storeIdCol(),
    orderId: text("order_id").notNull(),
    mediaId: text("media_id").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [
    index("receipts_order_idx").on(t.storeId, t.orderId),
    scopedFk("pr_order_fk", [t.storeId, t.orderId], [orders.storeId, orders.id], "cascade"),
    scopedFk("pr_media_fk", [t.storeId, t.mediaId], [media.storeId, media.id]),
  ],
);

export const couponRedemptions = sqliteTable(
  "coupon_redemptions",
  {
    id: pk(),
    storeId: storeIdCol(),
    couponId: text("coupon_id").notNull(),
    orderId: text("order_id").notNull(),
    discount: integer("discount").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("coupon_redemptions_order_uq").on(t.storeId, t.orderId),
    scopedFk("cr_coupon_fk", [t.storeId, t.couponId], [coupons.storeId, coupons.id]),
    scopedFk("cr_order_fk", [t.storeId, t.orderId], [orders.storeId, orders.id], "cascade"),
  ],
);

export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: pk(),
    storeId: storeIdCol(),
    variantId: text("variant_id").notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason", { enum: ["order", "return", "manual", "import", "cancel", "transfer", "stocktake", "purchase", "purchase_return", "pos_sale", "pos_return"] }).notNull(),
    warehouseId: text("warehouse_id"), // المخزن المتأثر (null = الرئيسي / وحدة المخازن مطفية)
    orderId: text("order_id"),
    note: text("note"),
    actorUserId: text("actor_user_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("stock_movements_variant_idx").on(t.storeId, t.variantId, t.createdAt),
    scopedFk("sm_variant_fk", [t.storeId, t.variantId], [productVariants.storeId, productVariants.id], "cascade"),
    scopedFk("sm_order_fk", [t.storeId, t.orderId], [orders.storeId, orders.id]),
  ],
);

// ===== الكاش والمرتجعات =====

// دفتر حسابات المندوب: collected = المندوب استلم كاش من زبون، settlement = المندوب سلّم الفلوس للبياع.
// الرصيد عند المندوب = مجموع collected - مجموع settlement (+/- adjustment).
export const courierCashEntries = sqliteTable(
  "courier_cash_entries",
  {
    id: pk(),
    storeId: storeIdCol(),
    courierId: text("courier_id").notNull(),
    orderId: text("order_id"),
    type: text("type", { enum: ["collected", "settlement", "adjustment"] }).notNull(),
    amount: integer("amount").notNull(),
    note: text("note"),
    actorUserId: text("actor_user_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("cash_entries_courier_idx").on(t.storeId, t.courierId, t.createdAt),
    scopedFk("cce_courier_fk", [t.storeId, t.courierId], [couriers.storeId, couriers.id]),
    scopedFk("cce_order_fk", [t.storeId, t.orderId], [orders.storeId, orders.id]),
  ],
);

export const returns = sqliteTable(
  "returns",
  {
    id: pk(),
    storeId: storeIdCol(),
    orderId: text("order_id").notNull(),
    reason: text("reason", { enum: ["refused", "unreachable", "defective", "wrong_item", "changed_mind", "other"] }).notNull(),
    reasonNote: text("reason_note"),
    restocked: integer("restocked", { mode: "boolean" }).notNull().default(true),
    shippingLoss: integer("shipping_loss").notNull().default(0),
    actorUserId: text("actor_user_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("returns_store_id_uq").on(t.storeId, t.id),
    index("returns_order_idx").on(t.storeId, t.orderId),
    scopedFk("returns_order_fk", [t.storeId, t.orderId], [orders.storeId, orders.id]),
  ],
);

export const returnItems = sqliteTable(
  "return_items",
  {
    id: pk(),
    storeId: storeIdCol(),
    returnId: text("return_id").notNull(),
    orderItemId: text("order_item_id").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [
    scopedFk("ri_return_fk", [t.storeId, t.returnId], [returns.storeId, returns.id], "cascade"),
    scopedFk("ri_item_fk", [t.storeId, t.orderItemId], [orderItems.storeId, orderItems.id]),
  ],
);

// =====================================================================
// ===== منظومات رُكن: المحرك المشترك (الفروع، الكاشير، الورديات، الفواتير، دفتر الزبون، المزامنة) =====
// =====================================================================

/** الفروع: لكل فرع كاشيراته وأجهزته وترقيم فواتيره، ومربوط بمخزن لو وحدة المخازن شغالة */
export const branches = sqliteTable(
  "branches",
  {
    id: pk(),
    storeId: storeIdCol(),
    name: text("name").notNull(),
    address: text("address"),
    phone: text("phone"),
    warehouseId: text("warehouse_id"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    /** رأس وذيل الفاتورة (يتعدلوا من اللوحة) */
    receiptHeader: text("receipt_header"),
    receiptFooter: text("receipt_footer"),
    nextSaleNumber: integer("next_sale_number").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("branches_store_id_uq").on(t.storeId, t.id), uniqueIndex("branches_name_uq").on(t.storeId, t.name),
    scopedFk("br_warehouse_fk", [t.storeId, t.warehouseId], [warehouses.storeId, warehouses.id]),
  ],
);

/** نقاط البيع (الكاشيرات) في كل فرع */
export const registers = sqliteTable(
  "registers",
  {
    id: pk(),
    storeId: storeIdCol(),
    branchId: text("branch_id").notNull(),
    name: text("name").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("registers_store_id_uq").on(t.storeId, t.id), uniqueIndex("registers_name_uq").on(t.storeId, t.branchId, t.name),
    scopedFk("reg_branch_fk", [t.storeId, t.branchId], [branches.storeId, branches.id]),
  ],
);

/** أجهزة التشغيل (كاشير/كشك/شاشة حائط/استقبال): توكن بصلاحية محدودة بدل جلسة موظف كاملة */
export const devices = sqliteTable(
  "devices",
  {
    id: pk(),
    storeId: storeIdCol(),
    kind: text("kind", { enum: ["pos", "kiosk", "wall", "reception"] }).notNull(),
    line: text("line", { enum: ["market", "lounge", "gym", "store"] }).notNull(),
    name: text("name").notNull(),
    branchId: text("branch_id").notNull(),
    registerId: text("register_id"),
    /** sha256 للتوكن (التوكن نفسه في كوكي الجهاز بس) */
    tokenHash: text("token_hash").notNull().unique(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("devices_store_id_uq").on(t.storeId, t.id),
    scopedFk("dev_branch_fk", [t.storeId, t.branchId], [branches.storeId, branches.id]),
    scopedFk("dev_register_fk", [t.storeId, t.registerId], [registers.storeId, registers.id]),
  ],
);

/** الورديات: رصيد افتتاحي ← حركات ← تقفيل بعدّ الفئات والفرق (عجز/زيادة) وتقرير Z */
export const posShifts = sqliteTable(
  "pos_shifts",
  {
    id: pk(),
    storeId: storeIdCol(),
    clientId: text("client_id").notNull(),
    branchId: text("branch_id").notNull(),
    registerId: text("register_id"),
    deviceId: text("device_id"),
    status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
    openedBy: text("opened_by").notNull(),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull(),
    openingFloat: integer("opening_float").notNull().default(0),
    closedBy: text("closed_by"),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
    /** الكاش المتوقع في الدرج عند التقفيل (افتتاحي + كاش المبيعات − المرتجع ± الحركات) */
    expectedCash: integer("expected_cash"),
    countedCash: integer("counted_cash"),
    /** عدّ الفئات: {"50000": 3, "20000": 1, ...} (المفتاح قيمة الفئة بالدرهم) */
    denominations: text("denominations", { mode: "json" }).$type<Record<string, number>>(),
    difference: integer("difference"),
    zNumber: integer("z_number"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("pos_shifts_store_id_uq").on(t.storeId, t.id), uniqueIndex("pos_shifts_client_uq").on(t.storeId, t.clientId),
    index("pos_shifts_branch_idx").on(t.storeId, t.branchId, t.openedAt),
    scopedFk("ps_branch_fk", [t.storeId, t.branchId], [branches.storeId, branches.id]),
    scopedFk("ps_register_fk", [t.storeId, t.registerId], [registers.storeId, registers.id]),
  ],
);

/** إدخال/سحب فلوس من الدرج مع السبب (وفتح الدرج بدون بيع) */
export const posCashMoves = sqliteTable(
  "pos_cash_moves",
  {
    id: pk(),
    storeId: storeIdCol(),
    clientId: text("client_id").notNull(),
    shiftId: text("shift_id").notNull(),
    kind: text("kind", { enum: ["in", "out", "drawer"] }).notNull(),
    amount: integer("amount").notNull().default(0), // موجب دايماً (الاتجاه من kind)
    reason: text("reason"),
    actorUserId: text("actor_user_id"),
    approvedBy: text("approved_by"),
    at: integer("at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("pos_cash_moves_client_uq").on(t.storeId, t.clientId),
    scopedFk("pcm_shift_fk", [t.storeId, t.shiftId], [posShifts.storeId, posShifts.id]),
  ],
);

/** فاتورة البيع (للكاشير والصالة والنادي). الإجماليات تتحسب في السيرفر من السطور. */
export const sales = sqliteTable(
  "sales",
  {
    id: pk(),
    storeId: storeIdCol(),
    clientId: text("client_id").notNull(),
    line: text("line", { enum: ["market", "lounge", "gym", "store"] }).notNull(),
    branchId: text("branch_id").notNull(),
    registerId: text("register_id"),
    shiftId: text("shift_id"),
    deviceId: text("device_id"),
    number: integer("number").notNull(),
    /** رقم الفاتورة المطبوع من الجهاز (يطلع بدون نت، مثلاً K1A2-37). الرقم التسلسلي للفرع (number) من السيرفر */
    receiptNo: text("receipt_no"),
    customerId: text("customer_id"),
    cashierUserId: text("cashier_user_id"),
    status: text("status", { enum: ["completed", "partially_returned", "returned"] }).notNull().default("completed"),
    priceLevel: text("price_level", { enum: ["retail", "semi", "wholesale"] }).notNull().default("retail"),
    subtotal: integer("subtotal").notNull(),
    discount: integer("discount").notNull().default(0), // خصم الفاتورة كاملة
    total: integer("total").notNull(),
    tendered: integer("tendered").notNull().default(0), // الكاش اللي عطاه الزبون
    change: integer("change").notNull().default(0),
    pointsEarned: integer("points_earned").notNull().default(0),
    note: text("note"),
    /** وقت البيع في الجهاز (المزامنة ممكن تجي بعده) */
    soldAt: integer("sold_at", { mode: "timestamp_ms" }).notNull(),
    syncedAt: integer("synced_at", { mode: "timestamp_ms" }).notNull(),
    /** تحتاج مراجعة: سعر مختلف عن الحالي، مخزون نزل تحت الصفر، دين فوق الحد… */
    needsReview: integer("needs_review", { mode: "boolean" }).notNull().default(false),
    reviewNotes: text("review_notes", { mode: "json" }).$type<string[]>(),
    approvedBy: text("approved_by"),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sales_store_id_uq").on(t.storeId, t.id), uniqueIndex("sales_client_uq").on(t.storeId, t.clientId),
    uniqueIndex("sales_number_uq").on(t.storeId, t.branchId, t.number),
    index("sales_receipt_idx").on(t.storeId, t.receiptNo),
    index("sales_sold_idx").on(t.storeId, t.soldAt), index("sales_shift_idx").on(t.storeId, t.shiftId), index("sales_customer_idx").on(t.storeId, t.customerId),
    scopedFk("sales_branch_fk", [t.storeId, t.branchId], [branches.storeId, branches.id]),
    scopedFk("sales_shift_fk", [t.storeId, t.shiftId], [posShifts.storeId, posShifts.id]),
    scopedFk("sales_customer_fk", [t.storeId, t.customerId], [customers.storeId, customers.id]),
  ],
);

/**
 * سطور الفاتورة. quantity بوحدة البيع (حبة/كرتونة)، أو بالجرام للموزون (isWeighed، والسعر للكيلو).
 * baseQty = اللي نقص من المخزون بالوحدة الأصغر (الحبة أو الجرام).
 */
export const saleItems = sqliteTable(
  "sale_items",
  {
    id: pk(),
    storeId: storeIdCol(),
    saleId: text("sale_id").notNull(),
    kind: text("kind", { enum: ["product", "service", "custom"] }).notNull().default("product"),
    variantId: text("variant_id"),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull(),
    isWeighed: integer("is_weighed", { mode: "boolean" }).notNull().default(false),
    unitFactor: integer("unit_factor").notNull().default(1),
    baseQty: integer("base_qty").notNull().default(0),
    unitPrice: integer("unit_price").notNull(),
    discount: integer("discount").notNull().default(0),
    total: integer("total").notNull(),
    unitCost: integer("unit_cost"), // تكلفة الوحدة الأصغر لحظة البيع
    returnedQty: integer("returned_qty").notNull().default(0),
    refId: text("ref_id"),
  },
  (t) => [
    uniqueIndex("sale_items_store_id_uq").on(t.storeId, t.id),
    index("sale_items_sale_idx").on(t.storeId, t.saleId),
    scopedFk("si_sale_fk", [t.storeId, t.saleId], [sales.storeId, sales.id], "cascade"),
    scopedFk("si_variant_fk", [t.storeId, t.variantId], [productVariants.storeId, productVariants.id]),
  ],
);

/** الدفع المقسّم: مجموع الطرق = إجمالي الفاتورة (والباقي للزبون من الكاش بس) */
export const salePayments = sqliteTable(
  "sale_payments",
  {
    id: pk(),
    storeId: storeIdCol(),
    saleId: text("sale_id").notNull(),
    method: text("method", { enum: PAY_METHODS }).notNull(),
    amount: integer("amount").notNull(),
    ref: text("ref"),
  },
  (t) => [
    index("sale_payments_sale_idx").on(t.storeId, t.saleId),
    scopedFk("sp_sale_fk", [t.storeId, t.saleId], [sales.storeId, sales.id], "cascade"),
  ],
);

/** مرتجع الكاشير برقم الفاتورة: كامل أو جزئي، المخزون يرجع والفلوس ترجع بنفس الطريقة أو تنقص من الدين */
export const saleReturns = sqliteTable(
  "sale_returns",
  {
    id: pk(),
    storeId: storeIdCol(),
    clientId: text("client_id").notNull(),
    saleId: text("sale_id").notNull(),
    shiftId: text("shift_id"),
    refundMethod: text("refund_method", { enum: PAY_METHODS }).notNull(),
    amount: integer("amount").notNull(),
    reason: text("reason"),
    actorUserId: text("actor_user_id"),
    approvedBy: text("approved_by"),
    at: integer("at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sale_returns_store_id_uq").on(t.storeId, t.id), uniqueIndex("sale_returns_client_uq").on(t.storeId, t.clientId),
    scopedFk("sr_sale_fk", [t.storeId, t.saleId], [sales.storeId, sales.id]),
    scopedFk("sr_shift_fk", [t.storeId, t.shiftId], [posShifts.storeId, posShifts.id]),
  ],
);

export const saleReturnItems = sqliteTable(
  "sale_return_items",
  {
    id: pk(),
    storeId: storeIdCol(),
    returnId: text("return_id").notNull(),
    saleItemId: text("sale_item_id").notNull(),
    quantity: integer("quantity").notNull(),
    amount: integer("amount").notNull(),
  },
  (t) => [
    scopedFk("sri_return_fk", [t.storeId, t.returnId], [saleReturns.storeId, saleReturns.id], "cascade"),
    scopedFk("sri_item_fk", [t.storeId, t.saleItemId], [saleItems.storeId, saleItems.id]),
  ],
);

/**
 * دفتر الزبون (إلحاق فقط، الرصيد = مجموع الحركات): debt = الدين عليه (موجب يزيد الدين)،
 * wallet = رصيد المحفظة (موجب = شحن)، points = نقاط الولاء.
 */
export const customerLedger = sqliteTable(
  "customer_ledger",
  {
    id: pk(),
    storeId: storeIdCol(),
    customerId: text("customer_id").notNull(),
    account: text("account", { enum: ["debt", "wallet", "points"] }).notNull(),
    amount: integer("amount").notNull(),
    kind: text("kind", { enum: ["sale", "payment", "topup", "spend", "refund", "adjust", "earn", "redeem", "opening"] }).notNull(),
    method: text("method", { enum: PAY_METHODS }),
    refType: text("ref_type"),
    refId: text("ref_id"),
    clientId: text("client_id"),
    note: text("note"),
    actorUserId: text("actor_user_id"),
    at: integer("at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("customer_ledger_store_id_uq").on(t.storeId, t.id),
    uniqueIndex("customer_ledger_client_uq").on(t.storeId, t.clientId, t.account),
    index("customer_ledger_customer_idx").on(t.storeId, t.customerId, t.account),
    scopedFk("cl_customer_fk", [t.storeId, t.customerId], [customers.storeId, customers.id]),
  ],
);

/** سجل المزامنة: كل عملية من الجهاز (clientId) تتطبق مرة وحدة بس، والنتيجة ترجع لو اتعاودت */
export const syncOps = sqliteTable(
  "sync_ops",
  {
    id: pk(),
    storeId: storeIdCol(),
    clientId: text("client_id").notNull(),
    deviceId: text("device_id"),
    kind: text("kind").notNull(),
    status: text("status", { enum: ["applied", "rejected"] }).notNull(),
    result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("sync_ops_client_uq").on(t.storeId, t.clientId)],
);

/** حضور وانصراف الموظفين (اختياري) */
export const staffAttendance = sqliteTable(
  "staff_attendance",
  {
    id: pk(),
    storeId: storeIdCol(),
    clientId: text("client_id").notNull(),
    userId: text("user_id").notNull(),
    branchId: text("branch_id"),
    inAt: integer("in_at", { mode: "timestamp_ms" }).notNull(),
    outAt: integer("out_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("staff_attendance_client_uq").on(t.storeId, t.clientId),
    index("staff_attendance_user_idx").on(t.storeId, t.userId, t.inAt),
    scopedFk("sa_branch_fk", [t.storeId, t.branchId], [branches.storeId, branches.id]),
  ],
);
