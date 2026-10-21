import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { addons, cities, plans, stores, users } from "@/db/schema/platform";
import { canUse, cheapestPlanWith, effectiveLimits, FEATURES } from "@/lib/entitlements";
import { DEFAULT_PLANS, FREE_LIMITS, GROWTH_LIMITS, PRO_LIMITS, STARTER_LIMITS } from "@/lib/plan-catalog";
import { recordPayment } from "@/server/admin/subscriptions";
import { saveProduct } from "@/server/catalog/products";
import { isOrderLocked, libyaMonthStart, loadStoreLimits, lockedOrderIds } from "@/server/entitlements";
import { createOrder } from "@/server/orders/create";
import { listOrders } from "@/server/orders/manage";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t } from "@/server/tenant";
import { makeTestDb } from "./helpers/db";

describe("canUse: المميزات حسب الباقة", () => {
  it("بداية / نمو / احترافي / مجانية", () => {
    expect(canUse(STARTER_LIMITS, "coupons")).toBe(false);
    expect(canUse(STARTER_LIMITS, "allTemplates")).toBe(true);
    expect(["coupons", "reports", "abandonedCarts", "removeBranding"].every((f) => canUse(GROWTH_LIMITS, f as never))).toBe(true);
    expect(canUse(GROWTH_LIMITS, "customDomain")).toBe(false);
    expect(canUse(GROWTH_LIMITS, "pixels")).toBe(false);
    expect(FEATURES.every((f) => canUse(PRO_LIMITS, f))).toBe(true); // الاحترافي: كل شي
    expect(FEATURES.some((f) => canUse(FREE_LIMITS, f))).toBe(false); // المجانية: ولا ميزة (حتى القوالب: قالب واحد بس)
    expect(canUse({}, "coupons")).toBe(false); // غير موجودة = مقفولة
  });

  it("أرخص باقة فيها الميزة (لنص «متاحة في باقة X»)", () => {
    const ps = DEFAULT_PLANS.filter((p) => !p.isFree);
    expect(cheapestPlanWith(ps, "coupons")?.slug).toBe("growth");
    expect(cheapestPlanWith(ps, "customDomain")?.slug).toBe("pro");
    expect(cheapestPlanWith(ps, "allTemplates")?.slug).toBe("starter");
  });

  it("الإضافات تزيد الحدود، والدومين يتفتح، وميزة المدة للسنوية بس", () => {
    const addons = [{ kind: "staff" as const, units: 1, quantity: 2 }, { kind: "products" as const, units: 500, quantity: 1 }, { kind: "custom_domain" as const, units: 1, quantity: 1 }];
    const l = effectiveLimits(STARTER_LIMITS, { addons });
    expect(l).toMatchObject({ maxStaff: 3, maxProducts: 600, customDomain: true });
    expect(effectiveLimits(GROWTH_LIMITS, { addons }).maxProducts).toBeNull(); // غير محدود يبقى غير محدود
    const pro = DEFAULT_PLANS.find((p) => p.slug === "pro")!;
    expect(effectiveLimits(pro.limits, { cycle: "yearly", perks: pro.durationPerks }).freeDesigns).toBe(1);
    expect(effectiveLimits(pro.limits, { cycle: "semiannual", perks: pro.durationPerks }).freeDesigns).toBe(0);
  });
});

describe("حد الطلبيات في الشهر والإضافات (بقاعدة بيانات)", () => {
  let db: Db, close: () => void, city: string, n = 0;
  beforeAll(async () => {
    ({ db, close } = await makeTestDb());
    city = (await db.insert(cities).values({ nameAr: "طرابلس", region: "west" }).returning())[0]!.id;
  });
  afterAll(() => close());

  async function shop(slug: string, limits = FREE_LIMITS) {
    const [plan] = await db.insert(plans).values({ slug: `p-${slug}`, nameAr: slug, prices: { m1: 100_000, m12: 1_000_000 }, limits }).returning();
    const [u] = await db.insert(users).values({ phone: `0916${String(++n).padStart(6, "0")}`, name: "u", passwordHash: "x" }).returning();
    const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug });
    if (!r.ok) throw new Error(r.error);
    await db.update(stores).set({ planId: plan!.id, onboardedAt: new Date() }).where(eq(stores.id, r.data.storeId));
    const scope = forStore(db, r.data.storeId);
    await scope.insert(t.deliveryRates, [{ cityId: city, fee: 10_000 }]);
    const p = await saveProduct(scope, { name: "منتج", price: 50_000, variants: [{ valueIds: [], stock: 100 }] }, { limits: PRO_LIMITS });
    if (!p.ok) throw new Error(p.error);
    const [v] = await scope.from(t.productVariants, eq(t.productVariants.productId, p.data.id));
    return { id: r.data.storeId, scope, variantId: v!.id, planId: plan!.id, adminId: u!.id };
  }
  const order = async (s: Awaited<ReturnType<typeof shop>>, i: number) => {
    const r = await createOrder(db, s.id, { items: [{ variantId: s.variantId, quantity: 1 }], name: `زبون ${i}`, phone: `09130000${String(i).padStart(2, "0")}`, cityId: city, address: "طرابلس شارع الجمهورية", paymentMethod: "cod" });
    if (!r.ok) throw new Error(r.error);
    return r.data.orderId;
  };

  it("الزبون يطلب عادي فوق الحد، والبياع يشوف الطلبيات الزايدة مقفولة لين يرقّي", async () => {
    const s = await shop("quota-1", { ...FREE_LIMITS, maxOrdersPerMonth: 2 });
    const ids = [await order(s, 1), await order(s, 2), await order(s, 3)]; // الثالثة ما ترفضش
    const ranks = (await s.scope.from(t.orders)).sort((a, b) => a.monthRank! - b.monthRank!).map((o) => o.monthRank);
    expect(ranks).toEqual([1, 2, 3]);
    const limits = await loadStoreLimits(db, { id: s.id, billingCycle: "monthly" }, (await db.select().from(plans).where(eq(plans.id, s.planId)))[0]!);
    expect(await lockedOrderIds(s.scope, limits, ids)).toEqual([ids[2]]);
    const list = await listOrders(s.scope, { maxOrdersPerMonth: limits.maxOrdersPerMonth });
    const third = list.items.find((o) => o.id === ids[2])!;
    expect(third).toMatchObject({ locked: true, customerPhone: "", address: "" });
    expect(third.customerName).not.toContain("زبون");
    expect(list.items.filter((o) => !o.locked)).toHaveLength(2);
    // الترقية (حد أعلى/غير محدود) تفتحها فوراً
    expect(await lockedOrderIds(s.scope, { ...limits, maxOrdersPerMonth: null }, ids)).toEqual([]);
    expect(isOrderLocked({ monthRank: 3 }, { ...limits, maxOrdersPerMonth: 5 })).toBe(false);
    expect(isOrderLocked({ monthRank: null }, limits)).toBe(false); // الطلبيات القديمة دايماً ظاهرة
  });

  it("الترتيب لكل متجر لوحده", async () => {
    const a = await shop("quota-2"), b = await shop("quota-3");
    await order(a, 1); await order(a, 2); await order(b, 1);
    expect((await b.scope.from(t.orders))[0]!.monthRank).toBe(1);
  });

  it("بداية الشهر بتوقيت ليبيا", () => {
    // 23:30 يوم 31 مارس UTC = 01:30 يوم 1 أبريل في ليبيا ← بداية أبريل
    expect(new Date(libyaMonthStart(Date.UTC(2026, 2, 31, 23, 30))).toISOString()).toBe("2026-03-31T22:00:00.000Z");
  });

  it("الإضافات المدفوعة مع الدفعة تزيد حدود المتجر، والدفعة التالية تستبدلها", async () => {
    const s = await shop("addons-1", STARTER_LIMITS);
    const [staff] = await db.insert(addons).values({ slug: "x-staff", nameAr: "موظف إضافي", kind: "staff", units: 1, monthlyPrice: 20_000 }).returning();
    const [dom] = await db.insert(addons).values({ slug: "x-dom", nameAr: "دومين", kind: "custom_domain", units: 1, monthlyPrice: 40_000 }).returning();
    const plan = (await db.select().from(plans).where(eq(plans.id, s.planId)))[0]!;
    const pay = (lines: { addonId: string; quantity: number }[]) => recordPayment(db, { storeId: s.id, planId: s.planId, cycle: "yearly", amount: 1_000_000, method: "cash", addons: lines }, { id: s.adminId });
    expect((await pay([{ addonId: staff!.id, quantity: 2 }, { addonId: dom!.id, quantity: 1 }])).ok).toBe(true);
    const l1 = await loadStoreLimits(db, { id: s.id, billingCycle: "yearly" }, plan);
    expect(l1).toMatchObject({ maxStaff: 3, customDomain: true });
    expect((await pay([])).ok).toBe(true); // التجديد بدون إضافات
    expect(await loadStoreLimits(db, { id: s.id, billingCycle: "yearly" }, plan)).toMatchObject({ maxStaff: 1, customDomain: false });
    expect((await pay([{ addonId: "ghost", quantity: 1 }])).ok).toBe(false);
  });
});

describe("كل ميزة مدفوعة تتفحص في السيرفر (مش في الواجهة بس)", () => {
  // الميزة ← الملفات اللي لازم تفحصها بـ canUse (actions/routes/services/pages)
  const CHECKS: Record<string, string[]> = {
    coupons: ["src/server/marketing/coupons.ts", "src/server/orders/create.ts", "src/app/s/[key]/actions.ts", "src/app/dashboard/coupons/page.tsx"],
    reports: ["src/app/dashboard/reports/page.tsx", "src/app/dashboard/reports/export/route.ts"],
    abandonedCarts: ["src/app/dashboard/abandoned-carts/page.tsx", "src/app/dashboard/abandoned-carts/actions.ts", "src/app/s/[key]/actions.ts"],
    pixels: ["src/server/settings-service.ts", "src/app/s/[key]/layout.tsx"],
    customDomain: ["src/server/domains.ts", "src/server/storefront/queries.ts"],
    allTemplates: ["src/server/settings-service.ts", "src/server/store-service.ts", "src/app/s/[key]/layout.tsx"],
    removeBranding: ["src/app/s/[key]/layout.tsx"],
  };
  for (const [feature, files] of Object.entries(CHECKS)) {
    it(feature, () => {
      for (const f of files) expect(readFileSync(f, "utf8"), `${f} ما يفحصش ${feature}`).toMatch(new RegExp(`canUse\\([^;]*?"${feature}"\\)`));
    });
  }
});
