import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { cities, stores, users } from "@/db/schema/platform";
import { activeHref, navFor, NAV } from "@/lib/dashboard-nav";
import { FALLBACK_LIMITS } from "@/lib/plan-limits";
import { saveProduct } from "@/server/catalog/products";
import { searchDashboard } from "@/server/dashboard-search";
import { saveCourier } from "@/server/orders/couriers";
import { createOrder } from "@/server/orders/create";
import { changeOrderStatus } from "@/server/orders/manage";
import { can } from "@/server/permissions";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t, type StoreScope } from "@/server/tenant";
import { makeTestDb } from "./helpers/db";

let db: Db, close: () => void, city: string, n = 0;
beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  city = (await db.insert(cities).values({ nameAr: "طرابلس", region: "west" }).returning())[0]!.id;
});
afterAll(() => close());

async function shop(slug: string, productName: string) {
  const [u] = await db.insert(users).values({ phone: `0915${String(++n).padStart(6, "0")}`, name: "u", passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  await db.update(stores).set({ onboardedAt: new Date() }).where(eq(stores.id, r.data.storeId));
  const scope = forStore(db, r.data.storeId);
  await scope.insert(t.deliveryRates, [{ cityId: city, fee: 10_000 }]);
  const p = await saveProduct(scope, { name: productName, price: 50_000, variants: [{ valueIds: [], stock: 5 }] }, { limits: FALLBACK_LIMITS });
  if (!p.ok) throw new Error(p.error);
  const [v] = await scope.from(t.productVariants, eq(t.productVariants.productId, p.data.id));
  return { id: r.data.storeId, scope, userId: u!.id, variantId: v!.id };
}
const ctx = (s: { scope: StoreScope; userId: string }, role: "owner" | "orders_staff" | "courier" = "owner", userId = s.userId) => ({ role, scope: s.scope, user: { id: userId } }) as Parameters<typeof searchDashboard>[0];

describe("بحث لوحة الأوامر (Ctrl+K)", () => {
  it("يلقى منتجات المتجر بس، وما يشوفش متجر ثاني", async () => {
    const a = await shop("srch-a", "عطر الياسمين");
    const b = await shop("srch-b", "عطر الياسمين الفاخر");
    const hits = await searchDashboard(ctx(a), "الياسمين");
    expect(hits.filter((h) => h.kind === "product").map((h) => h.title)).toEqual(["عطر الياسمين"]);
    expect(hits.every((h) => !h.href.includes(b.id))).toBe(true);
  });

  it("الطلبيات برقمها وبهاتف الزبون، والزبائن بالاسم", async () => {
    const a = await shop("srch-o", "منتج");
    const o = await createOrder(db, a.id, { items: [{ variantId: a.variantId, quantity: 1 }], name: "خديجة البيضاوي", phone: "0927771234", cityId: city, address: "طرابلس شارع عمر المختار", paymentMethod: "cod" });
    if (!o.ok) throw new Error(o.error);
    expect((await searchDashboard(ctx(a), String(o.data.number))).some((h) => h.kind === "order")).toBe(true);
    expect((await searchDashboard(ctx(a), "0927771234")).some((h) => h.kind === "order")).toBe(true);
    expect((await searchDashboard(ctx(a), "خديجة")).some((h) => h.kind === "customer")).toBe(true);
  });

  it("موظف الطلبيات ما يلقاش منتجات، والمندوب يلقى طلبياته بس", async () => {
    const a = await shop("srch-r", "قميص أزرق");
    const mk = async (name: string, phone: string) => {
      const r = await createOrder(db, a.id, { items: [{ variantId: a.variantId, quantity: 1 }], name, phone, cityId: city, address: "طرابلس حي الأندلس", paymentMethod: "cod" });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    };
    expect((await searchDashboard(ctx(a, "orders_staff"), "قميص")).some((h) => h.kind === "product")).toBe(false);

    const [cu] = await db.insert(users).values({ phone: "0918889999", name: "مندوب", passwordHash: "x" }).returning();
    const c = await saveCourier(a.scope, { name: "مندوب", kind: "person" });
    if (!c.ok) throw new Error(c.error);
    await a.scope.update(t.couriers, { userId: cu!.id }, eq(t.couriers.id, c.data.id));
    const mine = await mk("زبون المندوب", "0911110000");
    await mk("زبون ثاني", "0911110001");
    expect((await changeOrderStatus(a.scope, { orderId: mine.orderId, to: "confirmed", actorUserId: a.userId })).ok).toBe(true);
    expect((await changeOrderStatus(a.scope, { orderId: mine.orderId, to: "with_courier", courierId: c.data.id, actorUserId: a.userId })).ok).toBe(true);
    const hits = await searchDashboard(ctx(a, "courier", cu!.id), "زبون");
    expect(hits.map((h) => h.title)).toEqual([expect.stringContaining("زبون المندوب")]);
  });

  it("أقل من حرفين = ما فيش بحث", async () => {
    const a = await shop("srch-s", "x");
    expect(await searchDashboard(ctx(a), " ع ")).toEqual([]);
  });
});

describe("خريطة صفحات اللوحة", () => {
  const nav = (role: Parameters<typeof can>[0], useCouriers = true, modules = false) => navFor({ can: (p) => can(role, p), useCouriers, isCourier: role === "courier", moduleOn: () => modules });
  it("كل دور يشوف صفحاته بس", () => {
    expect(nav("owner", true, true).length).toBe(NAV.length);
    expect(nav("owner").length).toBe(NAV.filter((d) => !d.module).length); // الوحدات المطفية تختفي من القائمة
    expect(nav("courier").map((i) => i.href)).toEqual(["/dashboard/orders"]);
    expect(nav("orders_staff").some((i) => i.href === "/dashboard/products")).toBe(false);
    expect(nav("manager").some((i) => i.href === "/dashboard/billing")).toBe(false);
  });
  it("المندوبين المطفيين يختفوا (إلا للمندوب نفسه)", () => {
    expect(nav("owner", false).some((i) => i.href === "/dashboard/couriers")).toBe(false);
  });
  it("العنصر النشط هو الأطول تطابقاً", () => {
    expect(activeHref("/dashboard/settings/modules", NAV)).toBe("/dashboard/settings/modules");
    expect(activeHref("/dashboard/settings", NAV)).toBe("/dashboard/settings");
    expect(activeHref("/dashboard/orders/abc", NAV)).toBe("/dashboard/orders");
    expect(activeHref("/dashboard", NAV)).toBe("/dashboard");
    expect(activeHref("/dashboard/menu", NAV)).toBe(null);
  });
});
