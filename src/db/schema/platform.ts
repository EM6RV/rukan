import { blob, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, pk, updatedAt } from "./_helpers";
import type { BillingCycle, BusinessType, DesignService, LibyaRegion, StoreStatus, StoreTemplate } from "@/lib/constants";

// ===== المستخدمون والجلسات =====

export const users = sqliteTable("users", {
  id: pk(),
  phone: text("phone").notNull().unique(), // بصيغة موحدة: 09XXXXXXXX
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  platformRole: text("platform_role", { enum: ["admin"] }),
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

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
});

// ===== الباقات =====

export type PlanLimits = {
  maxProducts: number | null; // null = غير محدود
  maxStaff: number | null;
  allTemplates: boolean;
  coupons: boolean;
  reports: boolean;
  customDomain: boolean;
  pixels: boolean;
  removeBranding: boolean;
  /** عدد التصاميم المجانية (ريل أو لوجو) في كل فترة اشتراك. غير موجود = 0 */
  freeDesigns?: number;
};

export const plans = sqliteTable("plans", {
  id: pk(),
  slug: text("slug").notNull().unique(),
  nameAr: text("name_ar").notNull(),
  descriptionAr: text("description_ar"),
  billingPeriod: text("billing_period").$type<BillingCycle>().notNull().default("monthly"), // مدة الباقة: شهرية أو سنوية
  price: integer("price").notNull().default(0), // سعر المدة كاملة، بالدرهم (1 د.ل = 1000)
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
    template: text("template").$type<StoreTemplate>().notNull().default("simple"),
    status: text("status").$type<StoreStatus>().notNull().default("trial"),
    planId: text("plan_id").references(() => plans.id),
    billingCycle: text("billing_cycle").$type<BillingCycle>().notNull().default("monthly"),
    trialEndsAt: integer("trial_ends_at", { mode: "timestamp_ms" }),
    currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }),
    nextOrderNumber: integer("next_order_number").notNull().default(1001),
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
    planId: text("plan_id").notNull().references(() => plans.id),
    billingCycle: text("billing_cycle").$type<BillingCycle>().notNull(),
    amount: integer("amount").notNull(),
    method: text("method", { enum: ["cash", "bank_transfer", "other"] }).notNull(),
    receiptMediaId: text("receipt_media_id"),
    periodStart: integer("period_start", { mode: "timestamp_ms" }).notNull(),
    periodEnd: integer("period_end", { mode: "timestamp_ms" }).notNull(),
    note: text("note"),
    recordedBy: text("recorded_by").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("sub_payments_store_idx").on(t.storeId, t.createdAt)],
);

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
