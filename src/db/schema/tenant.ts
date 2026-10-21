// كل جدول هنا خاص بمتجر ولازم يحمل store_id. الوصول له فقط عبر forStore(storeId) في src/server/tenant.
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, pk, scopedFk, updatedAt } from "./_helpers";
import { cities, media, stores, users } from "./platform";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@/lib/constants";

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
    items: text("items", { mode: "json" }).$type<{ name: string; variantLabel: string | null; quantity: number; price: number }[]>().notNull(),
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
    reason: text("reason", { enum: ["order", "return", "manual", "import", "cancel"] }).notNull(),
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
