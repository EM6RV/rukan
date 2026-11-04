import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { cities, storeMembers, stores, users } from "@/db/schema/platform";
import { PRO_LIMITS, STARTER_LIMITS } from "@/lib/plan-catalog";
import { trackingUrl } from "@/lib/shipping-companies";
import { getAnalytics, normalizeSource, recordVisit } from "@/server/analytics";
import { listLowStock } from "@/server/catalog/low-stock";
import { saveProduct } from "@/server/catalog/products";
import { listMovements } from "@/server/catalog/stock-movements";
import { captureCart, getRecoverableCart, markCartRecovered, recoveredSalesReport, markReminded, saveRetentionDays } from "@/server/marketing/abandoned-carts";
import { createManualOrder, createOrder, trackOrder } from "@/server/orders/create";
import { changeOrderStatus, updateOrderDetails } from "@/server/orders/manage";
import { saveTrackingUrls } from "@/server/orders/shipping";
import { hasPermission } from "@/server/permissions";
import { deleteRole, listRoles, saveRole } from "@/server/roles";
import { addStaff, changeStaffRole, listStaff } from "@/server/staff-service";
import { listStoreActivity } from "@/server/store-audit";
import { writeAudit } from "@/server/audit";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t } from "@/server/tenant";
import { makeTestDb } from "./helpers/db";

let db: Db, close: () => void, city: string, n = 0;
beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  city = (await db.insert(cities).values({ nameAr: "طرابلس", region: "west" }).returning())[0]!.id;
});
afterAll(() => close());

async function shop(slug: string) {
  const [u] = await db.insert(users).values({ phone: `0918${String(++n).padStart(6, "0")}`, name: "مالك", passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  await db.update(stores).set({ onboardedAt: new Date() }).where(eq(stores.id, r.data.storeId));
  const scope = forStore(db, r.data.storeId);
  await scope.insert(t.deliveryRates, [{ cityId: city, fee: 10_000 }]);
  const p = await saveProduct(scope, { name: "عطر", price: 50_000, variants: [{ valueIds: [], stock: 8 }] }, { limits: PRO_LIMITS });
  if (!p.ok) throw new Error(p.error);
  const [v] = await scope.from(t.productVariants, eq(t.productVariants.productId, p.data.id));
  return { id: r.data.storeId, userId: u!.id, scope, productId: p.data.id, variantId: v!.id };
}
const base = { name: "خديجة البيضاوي", phone: "0927771234", cityId: "", address: "طرابلس شارع عمر المختار", paymentMethod: "cod" };

describe("الأدوار المخصصة", () => {
  it("تتحجب بالباقة، تتعزل، وتحدد صلاحيات الموظف فعلاً", async () => {
    const a = await shop("ops-roles-a"), b = await shop("ops-roles-b");
    expect(await saveRole(a.scope, STARTER_LIMITS, { name: "محاسب", permissions: ["reports"] })).toEqual({ ok: false, error: expect.stringContaining("مش في باقتك") });
    expect((await saveRole(a.scope, PRO_LIMITS, { name: "x", permissions: ["staff"] })).ok).toBe(false); // الموظفين مش قابلة للتفويض
    expect((await saveRole(a.scope, PRO_LIMITS, { name: "x", permissions: ["reports"] })).ok).toBe(false); // لازم الرئيسية أو الطلبيات
    const role = await saveRole(a.scope, PRO_LIMITS, { name: "محاسب", permissions: ["dashboard", "reports"] });
    if (!role.ok) throw new Error(role.error);
    expect(await listRoles(db, b.scope)).toEqual([]);
    expect((await deleteRole(db, b.scope, role.data.id)).ok).toBe(false);

    const added = await addStaff(db, a.id, a.userId, { name: "علي", phone: "0925550001", password: "Passw0rd!9", role: `custom:${role.data.id}` }, PRO_LIMITS);
    expect(added.ok).toBe(true);
    // دور متجر ثاني ما ينفعش
    const other = await saveRole(b.scope, PRO_LIMITS, { name: "غريب", permissions: ["orders"] });
    if (!other.ok) throw new Error(other.error);
    expect((await addStaff(db, a.id, a.userId, { name: "س", phone: "0925550002", password: "Passw0rd!9", role: `custom:${other.data.id}` }, PRO_LIMITS)).ok).toBe(false);

    const member = (await listStaff(db, a.id)).find((m) => m.name === "علي")!;
    expect(member.customRoleId).toBe(role.data.id);
    const perms = (await listRoles(db, a.scope))[0]!.permissions;
    const ctx = { role: member.role, customPermissions: perms };
    expect(hasPermission(ctx, "reports")).toBe(true);
    expect(hasPermission(ctx, "orders")).toBe(false); // الدور الأساسي (موظف طلبيات) ما يتسرّبش
    expect((await listRoles(db, a.scope))[0]!.memberCount).toBe(1);

    // الرجوع لدور أساسي يلغي المخصص، والحذف يرجّع الموظف لأقل صلاحيات
    expect((await changeStaffRole(db, a.id, a.userId, member.id, "manager", PRO_LIMITS)).ok).toBe(true);
    expect((await listStaff(db, a.id)).find((m) => m.id === member.id)).toMatchObject({ role: "manager", customRoleId: null });
    await changeStaffRole(db, a.id, a.userId, member.id, `custom:${role.data.id}`, PRO_LIMITS);
    expect((await deleteRole(db, a.scope, role.data.id)).ok).toBe(true);
    const [row] = await db.select().from(storeMembers).where(and(eq(storeMembers.id, member.id)));
    expect(row).toMatchObject({ role: "orders_staff", customRoleId: null });
  });
});

describe("طلبية يدوية", () => {
  it("تنقص المخزون وتحترم سعر التوصيل والخصم اليدويين وتسجل المصدر", async () => {
    const s = await shop("ops-manual");
    const r = await createManualOrder(db, s.id, { ...base, cityId: city, items: [{ variantId: s.variantId, quantity: 2 }], manualSource: "whatsapp", deliveryFee: 0, discount: 10_000 });
    if (!r.ok) throw new Error(r.error);
    const [o] = await s.scope.from(t.orders, eq(t.orders.id, r.data.orderId));
    expect(o).toMatchObject({ subtotal: 100_000, discount: 10_000, deliveryFee: 0, total: 90_000, source: "manual:whatsapp", status: "new" });
    expect((await s.scope.from(t.productVariants, eq(t.productVariants.id, s.variantId)))[0]!.stock).toBe(6);
    expect((await s.scope.from(t.orderStatusHistory, eq(t.orderStatusHistory.orderId, r.data.orderId)))[0]!.note).toContain("واتساب");
    // بدون سعر توصيل للمدينة ولا سعر يدوي → خطأ واضح
    const [c2] = await db.insert(cities).values({ nameAr: "سبها", region: "south" }).returning();
    expect(await createManualOrder(db, s.id, { ...base, cityId: c2!.id, items: [{ variantId: s.variantId, quantity: 1 }], manualSource: "phone" })).toEqual({ ok: false, error: expect.stringContaining("سعر التوصيل") });
    expect((await createManualOrder(db, s.id, { ...base, cityId: c2!.id, items: [{ variantId: s.variantId, quantity: 1 }], manualSource: "phone", deliveryFee: 25_000 })).ok).toBe(true);
    // المخزون لسا محمي
    expect((await createManualOrder(db, s.id, { ...base, cityId: city, items: [{ variantId: s.variantId, quantity: 99 }], manualSource: "shop" })).ok).toBe(false);
  });
});

describe("شحن وتتبع", () => {
  it("شركة الشحن ورابط التتبع (https فقط) يظهروا للزبون", async () => {
    const s = await shop("ops-ship");
    expect(trackingUrl("http://x.ly/{n}", "123")).toBeNull();
    expect(trackingUrl("https://x.ly/track", "123")).toBeNull();
    expect(trackingUrl("https://x.ly/t/{n}", "A 1")).toBe("https://x.ly/t/A%201");
    expect((await saveTrackingUrls(s.scope, { vanex: "javascript:alert(1)//{n}" })).ok).toBe(false);
    expect((await saveTrackingUrls(s.scope, { vanex: "https://example.ly/t/{n}" })).ok).toBe(true);
    const o = await createOrder(db, s.id, { ...base, cityId: city, items: [{ variantId: s.variantId, quantity: 1 }] });
    if (!o.ok) throw new Error(o.error);
    await s.scope.insert(t.couriers, { name: "فانكس", kind: "company" });
    const [courier] = await s.scope.from(t.couriers);
    await changeOrderStatus(s.scope, { orderId: o.data.orderId, to: "confirmed", actorUserId: null });
    expect((await changeOrderStatus(s.scope, { orderId: o.data.orderId, to: "with_courier", courierId: courier!.id, shipmentNumber: "VX99", shippingCompany: "vanex", actorUserId: null })).ok).toBe(true);
    const tr = await trackOrder(s.scope, o.data.number, "0927771234");
    expect(tr).toMatchObject({ shipmentNumber: "VX99", shippingCompany: "فانكس (Vanex)", trackingUrl: "https://example.ly/t/VX99" });
    expect((await updateOrderDetails(s.scope, o.data.orderId, { shippingCompany: "darb" }, null)).ok).toBe(true);
    expect((await trackOrder(s.scope, o.data.number, "0927771234"))?.trackingUrl).toBeNull(); // درب السبيل: ما حطيناش رابط
  });
});

describe("تحليلات الزيارات", () => {
  it("تجمع الزيارات والمصادر بدون بيانات شخصية، وتتعزل", async () => {
    const a = await shop("ops-an-a"), b = await shop("ops-an-b");
    expect(normalizeSource("l.instagram.com")).toBe("instagram");
    expect(normalizeSource("vm.tiktok.com")).toBe("tiktok");
    expect(normalizeSource("wa.me")).toBe("whatsapp");
    expect(normalizeSource("")).toBe("direct");
    expect(normalizeSource("example.org")).toBe("other");
    await recordVisit(a.scope, { kind: "home", source: "instagram", session: true });
    await recordVisit(a.scope, { kind: "product", source: "instagram", productId: a.productId, session: false });
    await recordVisit(a.scope, { kind: "product", source: "instagram", productId: a.productId, session: false });
    await recordVisit(a.scope, { kind: "home", source: "direct", session: true });
    const o = await createOrder(db, a.id, { ...base, cityId: city, items: [{ variantId: a.variantId, quantity: 1 }] });
    expect(o.ok).toBe(true);
    const r = await getAnalytics(a.scope, 30);
    expect(r).toMatchObject({ visits: 2, pageViews: 4, orders: 1, conversion: 0.5 });
    expect(r.sources).toEqual(expect.arrayContaining([{ source: "instagram", visits: 1 }, { source: "direct", visits: 1 }]));
    expect(r.topProducts).toEqual([{ productId: a.productId, name: "عطر", views: 2 }]);
    expect(await getAnalytics(b.scope, 30)).toMatchObject({ visits: 0, orders: 0, conversion: null });
  });
});

describe("السلات المتروكة: استرجاع وتقرير", () => {
  it("رابط الاسترجاع يرجّع البنود، والتقرير يحسب اللي اتذكّر وكمّل، والمدة تتحكم", async () => {
    const s = await shop("ops-cart");
    const saved = await captureCart(s.scope, { phone: "0927771234", name: "خديجة", items: [{ variantId: s.variantId, quantity: 2 }] });
    expect(saved.ok && saved.data.saved).toBe(true);
    const [cart] = await s.scope.from(t.abandonedCarts);
    expect(await getRecoverableCart(s.scope, cart!.id)).toEqual([{ variantId: s.variantId, quantity: 2, note: undefined }]);
    expect(await getRecoverableCart(s.scope, "short")).toBeNull();
    expect(await getRecoverableCart(forStore(db, (await shop("ops-cart-2")).id), cart!.id)).toBeNull(); // متجر ثاني
    await markReminded(s.scope, cart!.id, Date.now() - 1000);
    await markCartRecovered(s.scope, "0927771234", Date.now());
    expect(await recoveredSalesReport(s.scope)).toMatchObject({ count: 1, total: 100_000, reminded: 1, rate: 1 });
    expect(await getRecoverableCart(s.scope, cart!.id)).toBeNull(); // خلص
    expect((await saveRetentionDays(s.scope, 1)).ok).toBe(false);
    expect((await saveRetentionDays(s.scope, 7)).ok).toBe(true);
  });
});

describe("قرب يخلص وحركة المخزون وسجل النشاط", () => {
  it("حد خاص لكل متغير، والحركات تتفلتر، وسجل النشاط للمتجر بس", async () => {
    const s = await shop("ops-low");
    expect(await listLowStock(s.scope)).toEqual([]); // 8 > الافتراضي 5
    await s.scope.update(t.productVariants, { minStock: 10 }, eq(t.productVariants.id, s.variantId));
    expect(await listLowStock(s.scope)).toMatchObject([{ name: "عطر", stock: 8, min: 10 }]);
    const o = await createOrder(db, s.id, { ...base, cityId: city, items: [{ variantId: s.variantId, quantity: 2 }] });
    if (!o.ok) throw new Error(o.error);
    const all = await listMovements(s.scope);
    expect(all.rows.map((m) => [m.delta, m.reason])).toEqual(expect.arrayContaining([[-2, "order"], [8, "manual"]]));
    expect((await listMovements(s.scope, { reason: "order" })).rows).toHaveLength(1);
    expect((await listMovements(s.scope, { q: "غير موجود" })).rows).toHaveLength(0);
    expect((await listMovements(s.scope, { q: "عطر" })).total).toBe(2);

    const other = await shop("ops-low-2");
    expect((await listMovements(other.scope, { reason: "order" })).rows).toHaveLength(0);
    await writeAudit(db, { actorUserId: s.userId, storeId: s.id, action: "products.write" });
    await writeAudit(db, { actorUserId: other.userId, storeId: other.id, action: "orders.write" });
    const act = await listStoreActivity(db, s.id);
    expect(act.rows.map((r) => r.action)).toEqual(["products.write"]);
    expect(act.rows[0]).toMatchObject({ actor: "مالك", label: "تعديل المنتجات" });
  });
});
