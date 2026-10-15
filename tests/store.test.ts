import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { cities, media, plans, storeMembers, stores, users } from "@/db/schema/platform";
import type { PlanLimits } from "@/db/schema/platform";
import { can, homeFor } from "@/server/permissions";
import { computeStoreAccess } from "@/server/store-access";
import {
  checkSlugAvailable, completeOnboarding, createStoreForUser, saveBusinessType, saveDelivery, saveIdentity, saveStoreBasics,
} from "@/server/store-service";
import { saveContactSettings, saveGeneralSettings, savePaymentSettings, saveSeoSettings } from "@/server/settings-service";
import { normalizeSocial, socialUrl } from "@/lib/social";
import { slugify, uniqueSlug } from "@/lib/slugify";
import { storeUrl } from "@/lib/store-url";
import { forStore, t } from "@/server/tenant";
import { makeTestDb } from "./helpers/db";

const ALL: PlanLimits = { maxProducts: null, maxStaff: null, allTemplates: true, coupons: true, reports: true, customDomain: true, pixels: true, removeBranding: true };
const STARTER: PlanLimits = { ...ALL, maxProducts: 50, allTemplates: false };

let db: Db;
let close: () => void;
let n = 0;
const newUser = async () =>
  (await db.insert(users).values({ phone: `0911${String(++n).padStart(6, "0")}`, name: `u${n}`, passwordHash: "x" }).returning())[0]!;

beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  await db.insert(plans).values({ slug: "growth", nameAr: "نمو", priceMonthly: 1, priceYearly: 1, limits: ALL });
  await db.insert(cities).values([{ nameAr: "طرابلس", region: "west" }, { nameAr: "بنغازي", region: "east" }, { nameAr: "سبها", region: "south" }]);
});
afterAll(() => close());

describe("إنشاء المتجر", () => {
  it("ينشئ المتجر بمحتوى افتراضي كامل وتجربة 14 يوم وباقة نمو", async () => {
    const u = await newUser();
    const r = await createStoreForUser(db, { userId: u.id, name: "عطور سارة", slug: "sara-perfume" });
    if (!r.ok) throw new Error(r.error);
    const store = (await db.select().from(stores).where(eq(stores.id, r.data.storeId)).get())!;
    expect(store).toMatchObject({ slug: "sara-perfume", status: "trial", onboardingStep: 2, onboardedAt: null, nextOrderNumber: 1001 });
    const days = (store.trialEndsAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
    expect(store.planId).not.toBeNull();

    const member = await db.select().from(storeMembers).where(eq(storeMembers.storeId, store.id)).get();
    expect(member).toMatchObject({ userId: u.id, role: "owner" });

    const s = forStore(db, store.id);
    expect((await s.from(t.storePages)).map((p) => p.slug).sort()).toEqual(["about", "contact", "privacy", "returns", "shipping"]);
    expect((await s.from(t.storeHomeSections)).map((x) => x.type)).toEqual(["hero", "categories", "featured"]);
    expect((await s.from(t.whatsappTemplates)).length).toBe(8);
    const pm = await s.from(t.storePaymentMethods);
    expect(pm.find((m) => m.method === "cod")!.isEnabled).toBe(true);
    expect(pm.find((m) => m.method === "bank_transfer")!.isEnabled).toBe(false);
    expect((await s.from(t.storeSettings))[0]!.thanksMessage).toBeTruthy();
  });

  it("رابط مستعمل أو محجوز أو غلط يترفض", async () => {
    const u = await newUser();
    expect(await createStoreForUser(db, { userId: u.id, name: "x1", slug: "sara-perfume" })).toEqual({ ok: false, error: expect.stringContaining("مستعمل") });
    for (const bad of ["admin", "api", "ab", "-abc", "abc-", "UPPER space", "عربي", "a".repeat(31)]) {
      expect((await checkSlugAvailable(db, bad)).ok, bad).toBe(false);
    }
    expect(await checkSlugAvailable(db, "SARA-Perfume")).toEqual({ ok: false, error: expect.stringContaining("مستعمل") }); // حساسية الحروف
    expect(await checkSlugAvailable(db, "free-name-1")).toEqual({ ok: true, data: "free-name-1" });
  });

  it("المستخدم ما يقدر ينشئ متجر ثاني، والاسم القصير يترفض", async () => {
    const u = await newUser();
    expect((await createStoreForUser(db, { userId: u.id, name: "a", slug: "short-name" })).ok).toBe(false);
    expect((await createStoreForUser(db, { userId: u.id, name: "متجر أول", slug: "first-one" })).ok).toBe(true);
    expect(await createStoreForUser(db, { userId: u.id, name: "متجر ثاني", slug: "second-one" })).toEqual({ ok: false, error: "عندك متجر بالفعل." });
  });

  it("سباق: إنشاءين بنفس الرابط، واحد بس ينجح والثاني يرجع خطأ واضح", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const results = await Promise.all([
      createStoreForUser(db, { userId: a.id, name: "سباق أ", slug: "race-slug" }),
      createStoreForUser(db, { userId: b.id, name: "سباق ب", slug: "race-slug" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: expect.stringContaining("مستعمل") });
    expect(await db.select().from(stores).where(eq(stores.slug, "race-slug"))).toHaveLength(1);
  });
});

describe("خطوات المعالج", () => {
  async function fresh(slug: string) {
    const u = await newUser();
    const r = await createStoreForUser(db, { userId: u.id, name: "متجر", slug });
    if (!r.ok) throw new Error(r.error);
    return r.data.storeId;
  }
  const cityId = async (name: string) => (await db.select().from(cities).where(eq(cities.nameAr, name)).get())!.id;

  it("المسار الكامل ثم الإنهاء", async () => {
    const id = await fresh("flow-store");
    expect((await completeOnboarding(db, id)).ok).toBe(false); // لسا ما خلصت الخطوات

    expect((await saveStoreBasics(db, id, { name: "اسم جديد", slug: "flow-renamed" })).ok).toBe(true);
    expect((await db.select().from(stores).where(eq(stores.id, id)).get())).toMatchObject({ name: "اسم جديد", slug: "flow-renamed" });

    const type = await saveBusinessType(db, id, "perfume", ALL);
    expect(type).toMatchObject({ ok: true, data: { template: "noir" } });
    expect((await forStore(db, id).from(t.storeSettings))[0]).toMatchObject({ primaryColor: "#2B1B3D", accentColor: "#C19E58" });

    const [logo] = await db.insert(media).values({ storeId: id, mime: "image/webp", size: 1, driver: "turso" }).returning();
    expect((await saveIdentity(db, id, { template: "bold", primaryColor: "#111111", accentColor: "#E4572E", logoMediaId: logo!.id }, ALL)).ok).toBe(true);
    expect((await db.select().from(stores).where(eq(stores.id, id)).get())).toMatchObject({ template: "bold", logoMediaId: logo!.id });

    const tripoli = await cityId("طرابلس");
    expect((await saveDelivery(db, id, { cityId: tripoli, feeInCity: 10_000, feeOther: 25_000, freeDeliveryOver: 300_000, bankTransfer: true, bankName: "الجمهورية", accountNumber: "123" })).ok).toBe(true);
    const rates = await forStore(db, id).from(t.deliveryRates);
    expect(rates).toHaveLength(3);
    expect(rates.find((r) => r.cityId === tripoli)!.fee).toBe(10_000);
    expect(rates.filter((r) => r.cityId !== tripoli).every((r) => r.fee === 25_000)).toBe(true);
    expect((await forStore(db, id).from(t.storeSettings))[0]).toMatchObject({ cityId: tripoli, freeDeliveryOver: 300_000 });
    expect((await forStore(db, id).from(t.storePaymentMethods, eq(t.storePaymentMethods.method, "bank_transfer")))[0]).toMatchObject({ isEnabled: true, config: { bankName: "الجمهورية", accountNumber: "123" } });

    expect((await completeOnboarding(db, id)).ok).toBe(true);
    const done = (await db.select().from(stores).where(eq(stores.id, id)).get())!;
    expect(done.onboardedAt).not.toBeNull();
    expect(done.onboardingStep).toBe(6);
  });

  it("التحويل المصرفي بدون بيانات حساب يترفض في المعالج", async () => {
    const id = await fresh("bank-required");
    const c = await cityId("سبها");
    const base = { cityId: c, feeInCity: 1_000, feeOther: 2_000, freeDeliveryOver: null };
    expect(await saveDelivery(db, id, { ...base, bankTransfer: true })).toEqual({ ok: false, error: expect.stringContaining("رقم الحساب") });
    expect((await saveDelivery(db, id, { ...base, bankTransfer: true, bankName: " ", accountNumber: "1" })).ok).toBe(false);
    expect(await forStore(db, id).count(t.deliveryRates)).toBe(0); // ما اتكتب شي
    expect((await saveDelivery(db, id, { ...base, bankTransfer: false })).ok).toBe(true);
  });

  it("إعادة حفظ التوصيل ما تكرر الأسعار", async () => {
    const id = await fresh("repeat-delivery");
    const c = await cityId("بنغازي");
    for (let i = 0; i < 2; i++) await saveDelivery(db, id, { cityId: c, feeInCity: 5_000, feeOther: 20_000, freeDeliveryOver: null, bankTransfer: false });
    expect(await forStore(db, id).count(t.deliveryRates)).toBe(3);
  });

  it("باقة بداية: قالب «جريء» ممنوع، والاقتراح يرجع للبسيط", async () => {
    const id = await fresh("starter-store");
    expect(await saveBusinessType(db, id, "clothing", STARTER)).toMatchObject({ ok: true, data: { template: "simple" } });
    expect(await saveIdentity(db, id, { template: "bold", primaryColor: "#111111", accentColor: "#E4572E", logoMediaId: null }, STARTER)).toEqual({ ok: false, error: expect.stringContaining("نمو") });
    expect((await saveIdentity(db, id, { template: "simple", primaryColor: "#111111", accentColor: "#E4572E", logoMediaId: null }, STARTER)).ok).toBe(true);
  });

  it("لوجو من متجر ثاني يترفض، ومدينة غلط تترفض", async () => {
    const [a, b] = [await fresh("owner-a-1"), await fresh("owner-b-1")];
    const [foreign] = await db.insert(media).values({ storeId: b, mime: "image/webp", size: 1, driver: "turso" }).returning();
    expect(await saveIdentity(db, a, { template: "simple", primaryColor: "#111111", accentColor: "#222222", logoMediaId: foreign!.id }, ALL)).toEqual({ ok: false, error: expect.stringContaining("اللوجو") });
    expect((await saveDelivery(db, a, { cityId: "nope", feeInCity: 1, feeOther: 1, freeDeliveryOver: null, bankTransfer: false })).ok).toBe(false);
  });

  it("تغيير الرابط لرابط متجر ثاني يترفض، ولنفس رابطه يعدي", async () => {
    const a = await fresh("rename-a-1");
    await fresh("rename-b-1");
    expect((await saveStoreBasics(db, a, { name: "x1", slug: "rename-b-1" })).ok).toBe(false);
    expect((await saveStoreBasics(db, a, { name: "اسم", slug: "rename-a-1" })).ok).toBe(true);
  });
});

describe("إعدادات المتجر", () => {
  let id: string;
  beforeAll(async () => {
    const u = await newUser();
    const r = await createStoreForUser(db, { userId: u.id, name: "إعدادات", slug: "settings-store" });
    if (!r.ok) throw new Error(r.error);
    id = r.data.storeId;
  });

  it("التواصل: يوحّد الأرقام ويرفض غير الليبية ويرفض javascript: في السوشيال", async () => {
    const ok = await saveContactSettings(db, id, { whatsapp: "+218 91 234 5678", contactPhone: "", email: "a@b.ly", instagram: "@sara.perfume", tiktok: "https://tiktok.com/@sara", facebook: "", snapchat: "", address: "طرابلس" });
    expect(ok.ok).toBe(true);
    expect((await forStore(db, id).from(t.storeSettings))[0]).toMatchObject({ whatsapp: "0912345678", contactPhone: null, instagram: "sara.perfume", tiktok: "https://tiktok.com/@sara", facebook: null });

    expect((await saveContactSettings(db, id, { whatsapp: "0961234567" })).ok).toBe(false);
    expect((await saveContactSettings(db, id, { email: "غلط" })).ok).toBe(false);
    expect(await saveContactSettings(db, id, { instagram: "javascript:alert(1)" })).toEqual({ ok: false, error: expect.stringContaining("إنستغرام") });
    expect((await saveContactSettings(db, id, { tiktok: "data:text/html,x" })).ok).toBe(false);
    expect((await saveContactSettings(db, id, { facebook: "has space" })).ok).toBe(false);
  });

  it("الدفع: التحويل المصرفي يحتاج بيانات، والدفع عند الاستلام دايماً مفعّل", async () => {
    expect((await savePaymentSettings(db, id, { bankTransfer: true })).ok).toBe(false);
    expect((await savePaymentSettings(db, id, { bankTransfer: true, bankName: "الجمهورية", accountNumber: "123456", accountHolder: "سارة" })).ok).toBe(true);
    const pm = await forStore(db, id).from(t.storePaymentMethods);
    expect(pm.find((m) => m.method === "bank_transfer")).toMatchObject({ isEnabled: true, config: { bankName: "الجمهورية", accountNumber: "123456" } });
    await savePaymentSettings(db, id, { bankTransfer: false });
    const after = await forStore(db, id).from(t.storePaymentMethods);
    expect(after.find((m) => m.method === "cod")!.isEnabled).toBe(true);
    expect(after.find((m) => m.method === "bank_transfer")!.isEnabled).toBe(false);
  });

  it("عام: اسم ونشاط وقالب وألوان مع حد الباقة", async () => {
    const base = { name: "اسم محدث", businessType: "beauty", template: "elegant", primaryColor: "#7A2E4A", accentColor: "#E3B7A0", logoMediaId: null };
    expect((await saveGeneralSettings(db, id, base, ALL)).ok).toBe(true);
    expect((await db.select().from(stores).where(eq(stores.id, id)).get())).toMatchObject({ name: "اسم محدث", businessType: "beauty", template: "elegant" });
    expect((await saveGeneralSettings(db, id, base, STARTER)).ok).toBe(false);
    expect((await saveGeneralSettings(db, id, { ...base, primaryColor: "red" }, ALL)).ok).toBe(false);
    expect((await saveGeneralSettings(db, id, { ...base, businessType: "x" }, ALL)).ok).toBe(false);
  });

  it("SEO: طول الحقول وصورة المشاركة", async () => {
    expect((await saveSeoSettings(db, id, { seoTitle: "عنوان", seoDescription: "وصف" })).ok).toBe(true);
    expect((await saveSeoSettings(db, id, { seoTitle: "x".repeat(71) })).ok).toBe(false);
    expect((await saveSeoSettings(db, id, { ogMediaId: "nonexistent" })).ok).toBe(false);
  });
});

describe("الصلاحيات وحالة الاشتراك", () => {
  it("مصفوفة الصلاحيات", () => {
    expect(can("owner", "billing")).toBe(true);
    expect(can("manager", "products")).toBe(true);
    expect(can("manager", "billing")).toBe(false);
    expect(can("manager", "staff")).toBe(false);
    expect(can("orders_staff", "orders")).toBe(true);
    expect(can("orders_staff", "products")).toBe(false);
    expect(can("orders_staff", "settings")).toBe(false);
    expect(can("courier", "orders")).toBe(true);
    expect(can("courier", "dashboard")).toBe(false);
    expect(homeFor("courier")).toBe("/dashboard/orders");
    expect(homeFor("owner")).toBe("/dashboard");
  });

  it("حالة المتجر الفعلية", () => {
    const now = Date.UTC(2026, 0, 10);
    const day = 86_400_000;
    expect(computeStoreAccess({ status: "trial", trialEndsAt: new Date(now + 3 * day), currentPeriodEnd: null }, now)).toEqual({ state: "trial", daysLeft: 3, writable: true });
    expect(computeStoreAccess({ status: "trial", trialEndsAt: new Date(now - 1), currentPeriodEnd: null }, now)).toMatchObject({ state: "expired", writable: false });
    expect(computeStoreAccess({ status: "active", trialEndsAt: null, currentPeriodEnd: new Date(now + 20 * day) }, now)).toMatchObject({ state: "active", daysLeft: 20, writable: true });
    expect(computeStoreAccess({ status: "active", trialEndsAt: null, currentPeriodEnd: new Date(now - day) }, now).state).toBe("expired");
    expect(computeStoreAccess({ status: "suspended", trialEndsAt: new Date(now + day), currentPeriodEnd: null }, now)).toMatchObject({ state: "suspended", writable: false });
    expect(computeStoreAccess({ status: "expired", trialEndsAt: null, currentPeriodEnd: null }, now).writable).toBe(false);
  });
});

describe("أدوات صغيرة", () => {
  it("slugify", () => {
    expect(slugify("عطور سارة")).toBe("عطور-سارة");
    expect(slugify("  Hello,   World!! ")).toBe("hello-world");
    expect(slugify("قَميص  أبيض")).toBe("قميص-أبيض");
    expect(slugify("!!!")).toBe("");
    expect(slugify("a".repeat(100)).length).toBe(60);
    expect(uniqueSlug("a", new Set(["a", "a-2"]))).toBe("a-3");
    expect(uniqueSlug("", new Set())).toBe("item");
  });

  it("السوشيال", () => {
    expect(normalizeSocial("@user_1")).toBe("user_1");
    expect(normalizeSocial("")).toBeNull();
    expect(normalizeSocial("https://instagram.com/x")).toBe("https://instagram.com/x");
    expect(normalizeSocial("JavaScript:alert(1)")).toBeUndefined();
    expect(normalizeSocial("my-page.name")).toBe("my-page.name"); // الشرطة مسموحة (صفحات فيسبوك)
    expect(normalizeSocial("a b")).toBeUndefined();
    expect(socialUrl("instagram", "sara")).toBe("https://instagram.com/sara");
    expect(socialUrl("tiktok", "sara")).toBe("https://www.tiktok.com/@sara");
    expect(socialUrl("facebook", "https://fb.com/x")).toBe("https://fb.com/x");
  });

  it("رابط المتجر", () => {
    expect(storeUrl("sara", { ROOT_DOMAIN: "rukn.ly", APP_URL: "https://rukn.ly" })).toBe("https://sara.rukn.ly");
    expect(storeUrl("sara", { ROOT_DOMAIN: "localhost:3000", APP_URL: "http://localhost:3000/" })).toBe("http://localhost:3000/s/sara");
  });
});
