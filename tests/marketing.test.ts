import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import type { PlanLimits } from "@/db/schema/platform";
import { users } from "@/db/schema/platform";
import { checkCoupon } from "@/server/orders/create";
import { couponState, deleteCoupon, listCoupons, saveCoupon, setCouponActive } from "@/server/marketing/coupons";
import { savePixelSettings } from "@/server/settings-service";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t } from "@/server/tenant";
import { dateInputToMs, msToDateInput } from "@/lib/date-input";
import { makeTestDb } from "./helpers/db";

const ON: PlanLimits = { maxProducts: null, maxStaff: 3, allTemplates: true, coupons: true, reports: true, customDomain: false, pixels: true, removeBranding: false };
const OFF: PlanLimits = { ...ON, coupons: false, pixels: false };
let db: Db;
let close: () => void;
let seq = 0;

async function shop(slug: string) {
  const [u] = await db.insert(users).values({ phone: `0916${String(++seq).padStart(6, "0")}`, name: "u", passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  return { id: r.data.storeId, scope: forStore(db, r.data.storeId) };
}

beforeAll(async () => { ({ db, close } = await makeTestDb()); });
afterAll(() => close());

describe("الكوبونات", () => {
  it("إنشاء وتعديل وقائمة وحالات", async () => {
    const s = await shop("cp-1");
    const now = Date.now();
    const r = await saveCoupon(s.scope, { code: " ramadan10 ", type: "percent", value: 10, minOrder: 30_000, maxUses: 2 }, ON);
    if (!r.ok) throw new Error(r.error);
    expect((await listCoupons(s.scope))[0]).toMatchObject({ code: "RAMADAN10", type: "percent", value: 10, minOrder: 30_000, maxUses: 2, usedCount: 0, state: "active", isActive: true });

    expect((await saveCoupon(s.scope, { id: r.data.id, code: "RAMADAN10", type: "fixed", value: 5_000, isActive: false }, ON)).ok).toBe(true);
    expect((await listCoupons(s.scope))[0]).toMatchObject({ type: "fixed", value: 5_000, minOrder: null, maxUses: null, state: "disabled" });

    const d = (over: object) => ({ isActive: true, startsAt: null, expiresAt: null, maxUses: null, usedCount: 0, ...over });
    expect(couponState(d({ expiresAt: new Date(now - 1) }), now)).toBe("expired");
    expect(couponState(d({ startsAt: new Date(now + 1000) }), now)).toBe("scheduled");
    expect(couponState(d({ maxUses: 3, usedCount: 3 }), now)).toBe("exhausted");
  });

  it("تحقق المدخلات برسائل عربية", async () => {
    const s = await shop("cp-2");
    const base = { code: "SAVE5", type: "percent", value: 5 };
    const err = async (over: object) => { const r = await saveCoupon(s.scope, { ...base, ...over }, ON); return r.ok ? "OK" : r.error; };
    expect(await err({ code: "ab" })).toContain("الكود");
    expect(await err({ code: "عربي!!" })).toContain("الكود");
    expect(await err({ value: 0 })).toContain("أكبر من صفر");
    expect(await err({ value: 101 })).toContain("100%");
    expect(await err({ value: 1.5 })).toContain("رقم صحيح");
    expect(await err({ type: "x" })).toContain("نوع الخصم");
    expect(await err({ maxUses: 0 })).toContain("عدد الاستخدامات");
    expect(await err({ minOrder: -1 })).toContain("الحد الأدنى");
    expect(await err({ startsAt: 2000, expiresAt: 1000 })).toContain("بعد تاريخ البداية");
    expect(await err({ expiresAt: 1000 })).toContain("فات");
    expect(await err({})).toBe("OK");
    expect(await err({})).toContain("موجود"); // نفس الكود
    expect(await err({ code: "save5" })).toContain("موجود"); // بدون حساسية للحالة
  });

  it("الباقة بدون كوبونات ترفض", async () => {
    const s = await shop("cp-3");
    expect(await saveCoupon(s.scope, { code: "FREE10", type: "percent", value: 10 }, OFF)).toEqual({ ok: false, error: expect.stringContaining("سنوية") });
  });

  it("كوبون مستخدم: الكود ثابت، العدد ما ينزلش عن المستخدم، ما يتمسحش", async () => {
    const s = await shop("cp-4");
    const r = await saveCoupon(s.scope, { code: "USED1", type: "percent", value: 10, maxUses: 5 }, ON);
    if (!r.ok) throw new Error(r.error);
    await s.scope.update(t.coupons, { usedCount: 3 });
    expect(await saveCoupon(s.scope, { id: r.data.id, code: "OTHER", type: "percent", value: 10 }, ON)).toEqual({ ok: false, error: expect.stringContaining("ما ينفعش تغيّر") });
    expect(await saveCoupon(s.scope, { id: r.data.id, code: "USED1", type: "percent", value: 10, maxUses: 2 }, ON)).toEqual({ ok: false, error: expect.stringContaining("استُخدم 3") });
    expect((await saveCoupon(s.scope, { id: r.data.id, code: "USED1", type: "percent", value: 15, maxUses: 3 }, ON)).ok).toBe(true);
    expect(await deleteCoupon(s.scope, r.data.id)).toEqual({ ok: false, error: expect.stringContaining("عطّله") });
    expect((await setCouponActive(s.scope, r.data.id, false)).ok).toBe(true);
    const fresh = await saveCoupon(s.scope, { code: "FRESH1", type: "fixed", value: 1000 }, ON);
    if (!fresh.ok) throw new Error(fresh.error);
    expect((await deleteCoupon(s.scope, fresh.data.id)).ok).toBe(true);
    expect((await deleteCoupon(s.scope, fresh.data.id)).ok).toBe(false);
  });

  it("عزل: متجر ما يعدل/يمسح/يعطل كوبون متجر ثاني، ونفس الكود مسموح في متجرين", async () => {
    const [a, b] = [await shop("cp-a"), await shop("cp-b")];
    const ra = await saveCoupon(a.scope, { code: "SAME10", type: "percent", value: 10 }, ON);
    const rb = await saveCoupon(b.scope, { code: "SAME10", type: "percent", value: 20 }, ON);
    if (!ra.ok || !rb.ok) throw new Error("setup");
    expect((await saveCoupon(a.scope, { id: rb.data.id, code: "HACK10", type: "percent", value: 99 }, ON)).ok).toBe(false);
    expect((await setCouponActive(a.scope, rb.data.id, false)).ok).toBe(false);
    expect((await deleteCoupon(a.scope, rb.data.id)).ok).toBe(false);
    expect((await listCoupons(b.scope))[0]).toMatchObject({ code: "SAME10", value: 20, isActive: true });
  });

  it("الكوبون المحفوظ يشتغل في checkCoupon (نسبة، مبلغ، حد أدنى، مجدول)", async () => {
    const s = await shop("cp-5");
    await saveCoupon(s.scope, { code: "P10", type: "percent", value: 10, minOrder: 50_000 }, ON);
    await saveCoupon(s.scope, { code: "FIX5", type: "fixed", value: 5_000 }, ON);
    await saveCoupon(s.scope, { code: "LATER", type: "percent", value: 10, startsAt: Date.now() + 86_400_000 * 2 }, ON);
    expect(await checkCoupon(s.scope, "p10", 100_000)).toMatchObject({ ok: true, discount: 10_000 });
    expect(await checkCoupon(s.scope, "P10", 40_000)).toMatchObject({ ok: false });
    expect(await checkCoupon(s.scope, "FIX5", 3_000)).toMatchObject({ ok: true, discount: 3_000 });
    expect(await checkCoupon(s.scope, "LATER", 100_000)).toMatchObject({ ok: false });
  });
});

describe("Pixels", () => {
  it("حفظ وتحقق وحدود الباقة", async () => {
    const s = await shop("px-1");
    const get = async () => (await s.scope.from(t.storeSettings))[0]!;
    expect((await savePixelSettings(db, s.id, { metaPixelId: " 1234567890 ", tiktokPixelId: "C1ABCDEF2G" }, ON)).ok).toBe(true);
    expect(await get()).toMatchObject({ metaPixelId: "1234567890", tiktokPixelId: "C1ABCDEF2G" });
    expect((await savePixelSettings(db, s.id, { metaPixelId: "", tiktokPixelId: null }, ON)).ok).toBe(true);
    expect(await get()).toMatchObject({ metaPixelId: null, tiktokPixelId: null });
    expect(await savePixelSettings(db, s.id, { metaPixelId: "12'); alert(1);//" }, ON)).toEqual({ ok: false, error: expect.stringContaining("Meta Pixel") });
    expect((await savePixelSettings(db, s.id, { tiktokPixelId: "ab" }, ON)).ok).toBe(false);
    expect(await savePixelSettings(db, s.id, { metaPixelId: "1234567890" }, OFF)).toEqual({ ok: false, error: expect.stringContaining("سنوية برو") });
  });
});

describe("حقول التاريخ", () => {
  it("تحويل بتوقيت ليبيا ذهاباً وإياباً", () => {
    expect(dateInputToMs("2026-03-10", "start")).toBe(Date.UTC(2026, 2, 9, 22, 0));
    expect(dateInputToMs("2026-03-10", "end")).toBe(Date.UTC(2026, 2, 10, 21, 59, 59, 999));
    expect(msToDateInput(dateInputToMs("2026-03-10", "end"))).toBe("2026-03-10");
    expect(msToDateInput(dateInputToMs("2026-03-10", "start"))).toBe("2026-03-10");
    expect(dateInputToMs("", "start")).toBeNull();
    expect(dateInputToMs("garbage", "end")).toBeNull();
    expect(msToDateInput(null)).toBe("");
  });
});
