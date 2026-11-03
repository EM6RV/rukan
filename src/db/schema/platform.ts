import { sql } from "drizzle-orm";
import { blob, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, pk, updatedAt } from "./_helpers";
import type { AddonKind, BillingCycle, BusinessType, DesignService, LibyaRegion, StoreModule, StoreStatus, StoreTemplate } from "@/lib/constants";
export type { AddonKind } from "@/lib/constants";
import type { DurationKey } from "@/lib/billing";
import type { ProductLine } from "@/lib/product-lines";

// ===== المستخدمون والجلسات =====

export const users = sqliteTable("users", {
  id: pk(),
  phone: text("phone").notNull().unique(), // بصيغة موحدة: 09XXXXXXXX
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  platformRole: text("platform_role", { enum: ["admin"] }),
  /** متى اتأكد الرقم بكود (SMS/واتساب). null = ما اتأكدش (التحقق مطفي حالياً) */
  phoneVerifiedAt: integer("phone_verified_at", { mode: "timestamp_ms" }),
  status: text("status", { enum: ["active", "blocked"] }).notNull().default("active"),
  createdAt: createdAt(),
  lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256 للتوكن، التوكن نفسه ما ينحفظش
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

/**
 * طلبات استرجاع كلمة السر. ما عندنا SMS، فالبياع يطلب من /forgot-password، والأدمن يتأكد منه ويصدر رابط
 * (يُرسل على واتساب). الرابط صالح ساعة ولمرة وحدة، والتوكن ما ينحفظش (sha256 بس).
 */
export const passwordResetRequests = sqliteTable(
  "password_reset_requests",
  {
    id: pk(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "issued", "used", "dismissed"] }).notNull().default("pending"),
    tokenHash: text("token_hash"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    issuedBy: text("issued_by").references(() => users.id, { onDelete: "set null" }),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("pwreset_user_idx").on(t.userId, t.status), uniqueIndex("pwreset_token_uq").on(t.tokenHash)],
);

/** أكواد التحقق من الهاتف (SMS/واتساب). الكود نفسه ما ينحفظش: sha256 بس، وصالح دقائق ولعدد محاولات محدود. */
export const phoneVerifications = sqliteTable(
  "phone_verifications",
  {
    id: pk(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    channel: text("channel", { enum: ["sms", "whatsapp"] }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("phone_verifications_phone_idx").on(t.phone, t.createdAt)],
);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
});

// ===== الباقات =====

export type PlanLimits = {
  maxProducts: number | null; // null = غير محدود
  maxStaff: number | null;
  /** طلبيات في الشهر (بتوقيت ليبيا). غير موجود/null = غير محدود */
  maxOrdersPerMonth?: number | null;
  /** عدد المخازن (وحدة المخازن). غير موجود = 1، null = غير محدود */
  maxWarehouses?: number | null;
  allTemplates: boolean;
  coupons: boolean;
  reports: boolean;
  customDomain: boolean;
  pixels: boolean;
  removeBranding: boolean;
  // مميزات جديدة (غير موجودة = مقفولة)
  abandonedCarts?: boolean;
  bundles?: boolean;
  customRoles?: boolean;
  advancedReports?: boolean;
  analytics?: boolean;
  /** عدد التصاميم المجانية (ريل أو لوجو) في كل فترة اشتراك. غير موجود = 0 */
  freeDesigns?: number;
  /** الوحدات الاختيارية المسموحة في الباقة (غير موجودة = مقفولة) */
  modules?: Partial<Record<StoreModule, boolean>>;

  // ===== حدود ومميزات المنظومات (ماركت/بلاي/فِت). غير موجود = مقفول، والحد غير الموجود = 1 =====
  /** عدد الفروع (مشترك لكل المنظومات). غير موجود = 1، null = غير محدود */
  maxBranches?: number | null;
  /** ماركت: عدد الكاشيرات */
  maxRegisters?: number | null;
  /** بلاي: عدد الأجهزة. غير موجود = 0 */
  maxStations?: number | null;
  /** فِت: عدد الأعضاء النشطين. غير موجود = 0 */
  maxMembers?: number | null;
  // ماركت
  debtBook?: boolean; wholesale?: boolean; batches?: boolean; promotions?: boolean; cameraScan?: boolean; onlineOrders?: boolean; hardware?: boolean;
  // بلاي
  bookings?: boolean; hourPacks?: boolean; wallScreen?: boolean; tournaments?: boolean; powerControl?: boolean;
  // فِت
  classes?: boolean; trainers?: boolean; installments?: boolean; memberPortal?: boolean; kiosk?: boolean; progress?: boolean; advancedMessages?: boolean;
};

/** سعر كل مدة بالدرهم. null/غير موجود = الباقة ما تطلعش في المدة هذي */
export type PlanPrices = Partial<Record<DurationKey, number | null>>;
/** ميزة إضافية لمدة معينة (مثلاً ريل أو لوجو مجاناً في السنوية بس) */
export type DurationPerks = Partial<Record<DurationKey, { freeDesigns?: number; note?: string }>>;

export const plans = sqliteTable("plans", {
  id: pk(),
  slug: text("slug").notNull().unique(),
  /** المنظومة اللي تتبعها الباقة (متجر/ماركت/بلاي/فِت) */
  line: text("line").$type<ProductLine>().notNull().default("store"),
  nameAr: text("name_ar").notNull(),
  descriptionAr: text("description_ar"),
  /** @deprecated من المرحلة 1: الأسعار في prices. باقي للتوافق مع البيانات القديمة بس */
  billingPeriod: text("billing_period").$type<BillingCycle>().notNull().default("monthly"),
  /** @deprecated من المرحلة 1: الأسعار في prices */
  price: integer("price").notNull().default(0),
  prices: text("prices", { mode: "json" }).$type<PlanPrices>().notNull().default(sql`'{}'`),
  /** السعر الأصلي (يبان مشطوب) لكل مدة، اختياري */
  comparePrices: text("compare_prices", { mode: "json" }).$type<PlanPrices>().notNull().default(sql`'{}'`),
  durationPerks: text("duration_perks", { mode: "json" }).$type<DurationPerks>().notNull().default(sql`'{}'`),
  /** الباقة المجانية للأبد. تبان بس لما الأدمن يفعّلها من الإعدادات */
  isFree: integer("is_free", { mode: "boolean" }).notNull().default(false),
  isFeatured: integer("is_featured", { mode: "boolean" }).notNull().default(false), // الباقة المميزة في صفحة الأسعار
  limits: text("limits", { mode: "json" }).$type<PlanLimits>().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

// ===== المتاجر =====

export const stores = sqliteTable(
  "stores",
  {
    id: pk(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    ownerUserId: text("owner_user_id").notNull().references(() => users.id),
    businessType: text("business_type").$type<BusinessType>().notNull().default("other"),
    template: text("template").$type<StoreTemplate>().notNull().default("simple" as StoreTemplate) /* افتراض قديم في القاعدة؛ الإدخال دايماً يحدد القالب صراحة */,
    // ===== الاشتراك (@deprecated) =====
    // من منظومات رُكن: المصدر هو line_subscriptions (سطر لكل منظومة). الأعمدة هذي نسخة من سطر «store»
    // تتحدث مع كل كتابة (للتوافق مع الكود القديم)، ولو النشاط ما عندوش متجر أونلاين: expired (أو suspended).
    /** @deprecated استعمل lineAccess / line_subscriptions */
    status: text("status").$type<StoreStatus>().notNull().default("trial"),
    /** @deprecated استعمل line_subscriptions.plan_id */
    planId: text("plan_id").references(() => plans.id),
    /** @deprecated استعمل line_subscriptions.billing_cycle */
    billingCycle: text("billing_cycle").$type<BillingCycle>().notNull().default("monthly"),
    /** @deprecated استعمل line_subscriptions.trial_ends_at */
    trialEndsAt: integer("trial_ends_at", { mode: "timestamp_ms" }),
    /** @deprecated استعمل line_subscriptions.current_period_end */
    currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }),
    /** المنظومات المفتوحة للنشاط هذا كتجربة قبل الإطلاق العام (زي inboxBeta) */
    lineBeta: text("line_beta", { mode: "json" }).$type<ProductLine[]>().notNull().default(sql`'[]'`),
    nextOrderNumber: integer("next_order_number").notNull().default(1001),
    // يستعمل مندوبين/شركات توصيل (وكاش عندهم)؟ لو مقفل نخفي المندوبين والكاش من اللوحة (افتراضياً شغال)
    useCouriers: integer("use_couriers", { mode: "boolean" }).notNull().default(true),
    /** الوحدات الاختيارية اللي فعّلها البياع. الطفي ما يمسح بياناتها. */
    enabledModules: text("enabled_modules", { mode: "json" }).$type<StoreModule[]>().notNull().default(sql`'[]'`),
    /** تجربة صندوق الرسائل: الأدمن يفعّلها لمتاجر معينة (الوحدة لسه «قريباً» للباقي) */
    inboxBeta: integer("inbox_beta", { mode: "boolean" }).notNull().default(false),
    /** رسالة تحويل الباقة (نظام الباقات الجديد) تبان في اللوحة لين يقفلها: "from:to:cycle" */
    planNotice: text("plan_notice"),
    logoMediaId: text("logo_media_id"),
    // معالج الإعداد: آخر خطوة تم حفظها، و onboardedAt لما يخلص المعالج
    onboardingStep: integer("onboarding_step").notNull().default(0),
    onboardedAt: integer("onboarded_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("stores_owner_idx").on(t.ownerUserId), index("stores_status_idx").on(t.status)],
);

export const storeMembers = sqliteTable(
  "store_members",
  {
    id: pk(),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "manager", "orders_staff", "courier"] }).notNull(),
    customRoleId: text("custom_role_id"), // دور مخصص (store_roles): صلاحياته تغلب صلاحيات role
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("store_members_uq").on(t.storeId, t.userId), index("store_members_user_idx").on(t.userId)],
);

export const storeDomains = sqliteTable(
  "store_domains",
  {
    id: pk(),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    domain: text("domain").notNull().unique(),
    status: text("status", { enum: ["pending", "verified", "failed"] }).notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [index("store_domains_store_idx").on(t.storeId)],
);

export const subscriptionPayments = sqliteTable(
  "subscription_payments",
  {
    id: pk(),
    storeId: text("store_id").notNull().references(() => stores.id),
    /** الدفعة على اشتراك أي منظومة */
    line: text("line").$type<ProductLine>().notNull().default("store"),
    planId: text("plan_id").notNull().references(() => plans.id),
    billingCycle: text("billing_cycle").$type<BillingCycle>().notNull(),
    amount: integer("amount").notNull(),
    method: text("method", { enum: ["cash", "bank_transfer", "other"] }).notNull(),
    receiptMediaId: text("receipt_media_id"),
    /** لقطة الإضافات المدفوعة مع الدفعة */
    addons: text("addons", { mode: "json" }).$type<{ addonId: string; slug: string; quantity: number }[]>(),
    periodStart: integer("period_start", { mode: "timestamp_ms" }).notNull(),
    periodEnd: integer("period_end", { mode: "timestamp_ms" }).notNull(),
    note: text("note"),
    recordedBy: text("recorded_by").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("sub_payments_store_idx").on(t.storeId, t.createdAt)],
);

// ===== الإضافات (Add-ons): موظف إضافي، مخزن إضافي، حزمة منتجات، دومين خاص =====
export const addons = sqliteTable("addons", {
  id: pk(),
  slug: text("slug").notNull().unique(),
  nameAr: text("name_ar").notNull(),
  kind: text("kind").$type<AddonKind>().notNull(),
  /** كم يزيد الحد مع كل وحدة (مثلاً 500 منتج). الدومين ما يحتاجش */
  units: integer("units").notNull().default(1),
  /** سعر الوحدة في الشهر بالدرهم */
  monthlyPrice: integer("monthly_price").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** الإضافات المفعّلة لكل نشاط (تتسجل مع دفعة اشتراك منظومة وتمشي مع فترتها) */
export const storeAddons = sqliteTable(
  "store_addons",
  {
    id: pk(),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    /** المنظومة اللي اندفعت الإضافة مع اشتراكها */
    line: text("line").$type<ProductLine>().notNull().default("store"),
    addonId: text("addon_id").notNull().references(() => addons.id),
    quantity: integer("quantity").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("store_addons_line_uq").on(t.storeId, t.line, t.addonId)],
);

// ===== اشتراكات المنظومات =====

/** إجابات المعالج القصير لكل منظومة (تستعملها المراحل الجاية لتجهيز الكاشيرات والأجهزة والاشتراكات) */
export type LineSetup = {
  done?: boolean;
  market?: { shopName?: string; registers?: number; wholesale?: boolean; scale?: boolean };
  lounge?: { stations?: { type: string; count: number }[]; hourlyPrice?: number };
  gym?: { sections?: ("men" | "women" | "mixed")[]; membershipTypes?: { name: string; months: number; price: number }[]; trainers?: string[] };
};

/** سطر لكل منظومة مشترك فيها النشاط (المصدر الوحيد لحالة الاشتراك) */
export const lineSubscriptions = sqliteTable(
  "line_subscriptions",
  {
    id: pk(),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    line: text("line").$type<ProductLine>().notNull(),
    planId: text("plan_id").references(() => plans.id),
    billingCycle: text("billing_cycle").$type<BillingCycle>().notNull().default("monthly"),
    status: text("status").$type<StoreStatus>().notNull().default("trial"),
    trialEndsAt: integer("trial_ends_at", { mode: "timestamp_ms" }),
    currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }),
    setup: text("setup", { mode: "json" }).$type<LineSetup>().notNull().default(sql`'{}'`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("line_subs_store_line_uq").on(t.storeId, t.line), index("line_subs_line_status_idx").on(t.line, t.status)],
);

/** حزم الدمج: خصم لما النشاط يجمع منظومتين أو أكثر (مثلاً ماركت + متجر) */
export const lineBundles = sqliteTable("line_bundles", {
  id: pk(),
  nameAr: text("name_ar").notNull(),
  lines: text("lines", { mode: "json" }).$type<ProductLine[]>().notNull(),
  /** نسبة الخصم على كل منظومة داخل الحزمة (0–90) */
  discountPercent: integer("discount_percent").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

// ===== إعلانات ومحتوى الموقع =====

export const announcements = sqliteTable("announcements", {
  id: pk(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  level: text("level", { enum: ["info", "warning", "success"] }).notNull().default("info"),
  startsAt: integer("starts_at", { mode: "timestamp_ms" }),
  endsAt: integer("ends_at", { mode: "timestamp_ms" }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const announcementDismissals = sqliteTable(
  "announcement_dismissals",
  {
    announcementId: text("announcement_id").notNull().references(() => announcements.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    dismissedAt: createdAt(),
  },
  (t) => [uniqueIndex("announcement_dismissals_uq").on(t.announcementId, t.userId)],
);

export const siteContent = sqliteTable("site_content", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedBy: text("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
});

export const platformSettings = sqliteTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: pk(),
    actorUserId: text("actor_user_id").references(() => users.id),
    storeId: text("store_id"), // بدون FK عمداً: السجل يبقى حتى لو انحذف المتجر
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_store_idx").on(t.storeId, t.createdAt), index("audit_actor_idx").on(t.actorUserId)],
);

// ===== الوسائط (صور) =====

export const media = sqliteTable(
  "media",
  {
    id: pk(),
    storeId: text("store_id").references(() => stores.id, { onDelete: "cascade" }), // null = وسائط المنصة
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    width: integer("width"),
    height: integer("height"),
    driver: text("driver", { enum: ["turso", "r2"] }).notNull(),
    data: blob("data", { mode: "buffer" }), // للـ turso
    objectKey: text("object_key"), // للـ r2
    // الإيصالات (تحويل مصرفي/اشتراكات) خاصة: ما تتقدمش إلا لأعضاء المتجر والأدمن
    isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("media_store_id_uq").on(t.storeId, t.id), index("media_store_idx").on(t.storeId)],
);

// ===== مرجعي عام =====

export const cities = sqliteTable("cities", {
  id: pk(),
  nameAr: text("name_ar").notNull().unique(),
  region: text("region").$type<LibyaRegion>().notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ===== طلبات التصميم (ريل/لوجو/هوية): الطلب يتسجل هنا والتفاصيل والملفات على واتساب =====
export const designRequests = sqliteTable(
  "design_requests",
  {
    id: pk(),
    storeId: text("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    service: text("service").$type<DesignService>().notNull(),
    note: text("note"),
    isFree: integer("is_free", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("design_requests_store_idx").on(t.storeId, t.createdAt)],
);
