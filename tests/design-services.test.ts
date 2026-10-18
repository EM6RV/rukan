import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { designRequests, stores, users } from "@/db/schema/platform";
import { addMonths } from "@/lib/billing";
import { createDesignRequest, designRequestMessage, getDesignAllowance, listDesignRequests } from "@/server/design-services";
import { makeStore, makeTestDb } from "./helpers/db";

let db: Db, close: () => void;
const DAY = 86_400_000;
const FREE1 = { freeDesigns: 1 };
const NONE = {};

beforeAll(async () => { ({ db, close } = await makeTestDb()); });
afterAll(() => close());

async function shop(slug: string, patch: Partial<typeof stores.$inferInsert> = {}) {
  const { store, user } = await makeStore(db, slug);
  await db.update(stores).set({ status: "active", currentPeriodEnd: new Date(Date.now() + 100 * DAY), ...patch }).where(eq(stores.id, store.id));
  const row = (await db.select().from(stores).where(eq(stores.id, store.id)))[0]!;
  return { store: row, userId: user.id };
}

describe("التصميم المجاني ضمن الباقة", () => {
  it("باقة بدون تصاميم مجانية: الرصيد صفر والطلب المجاني مرفوض، والعادي يمر", async () => {
    const { store, userId } = await shop("ds-none");
    expect(await getDesignAllowance(db, store, NONE, "yearly")).toEqual({ total: 0, used: 0, remaining: 0 });
    const free = await createDesignRequest(db, store, NONE, "yearly", userId, { service: "reel", useFree: true });
    expect(free).toEqual({ ok: false, error: expect.stringContaining("ما فيها تصميم مجاني") });
    const paid = await createDesignRequest(db, store, NONE, "yearly", userId, { service: "reel", note: "ريل عن العطور" });
    expect(paid).toMatchObject({ ok: true, data: { service: "reel", isFree: false, note: "ريل عن العطور" } });
  });

  it("السنوية: تصميم مجاني واحد (ريل أو لوجو) في الفترة، والثاني مرفوض", async () => {
    const { store, userId } = await shop("ds-year");
    expect(await getDesignAllowance(db, store, FREE1, "yearly")).toEqual({ total: 1, used: 0, remaining: 1 });
    const first = await createDesignRequest(db, store, FREE1, "yearly", userId, { service: "logo", useFree: true });
    expect(first).toMatchObject({ ok: true, data: { isFree: true } });
    expect(await getDesignAllowance(db, store, FREE1, "yearly")).toEqual({ total: 1, used: 1, remaining: 0 });
    const second = await createDesignRequest(db, store, FREE1, "yearly", userId, { service: "reel", useFree: true });
    expect(second).toEqual({ ok: false, error: expect.stringContaining("استعملت التصميم المجاني") });
    // الطلب المدفوع يظل متاح
    expect((await createDesignRequest(db, store, FREE1, "yearly", userId, { service: "reel" })).ok).toBe(true);
  });

  it("الهوية الكاملة والتصميم الثاني مش ضمن المجاني", async () => {
    const { store, userId } = await shop("ds-kind");
    for (const service of ["identity", "other"]) {
      expect(await createDesignRequest(db, store, FREE1, "yearly", userId, { service, useFree: true })).toEqual({ ok: false, error: expect.stringContaining("للريل أو اللوجو") });
    }
    expect((await getDesignAllowance(db, store, FREE1, "yearly")).used).toBe(0);
  });

  it("التجربة والمنتهي ما ياخذوش مجاني (لازم اشتراك فعّال)", async () => {
    const trial = await shop("ds-trial", { status: "trial", currentPeriodEnd: null });
    expect((await getDesignAllowance(db, trial.store, FREE1, "yearly")).total).toBe(0);
    const expired = await shop("ds-exp", { status: "expired" });
    expect((await getDesignAllowance(db, expired.store, FREE1, "yearly")).total).toBe(0);
  });

  it("الرصيد يتجدد مع الفترة الجديدة (تجديد الاشتراك)", async () => {
    const { store, userId } = await shop("ds-renew");
    // طلب مجاني قديم قبل بداية الفترة الحالية (الفترة 12 شهر تنتهي بعد 100 يوم)
    const start = addMonths(store.currentPeriodEnd!.getTime(), -12);
    await db.insert(designRequests).values({ storeId: store.id, userId, service: "reel", isFree: true, createdAt: new Date(start - 5 * DAY) });
    expect((await getDesignAllowance(db, store, FREE1, "yearly")).remaining).toBe(1);
    await db.insert(designRequests).values({ storeId: store.id, userId, service: "logo", isFree: true, createdAt: new Date(start + 5 * DAY) });
    expect((await getDesignAllowance(db, store, FREE1, "yearly")).remaining).toBe(0);
  });

  it("الرصيد لكل متجر لوحده", async () => {
    const a = await shop("ds-a");
    const b = await shop("ds-b");
    await createDesignRequest(db, a.store, FREE1, "yearly", a.userId, { service: "reel", useFree: true });
    expect((await getDesignAllowance(db, b.store, FREE1, "yearly")).remaining).toBe(1);
  });
});

describe("التحقق والرسالة والقائمة", () => {
  it("مدخلات غلط", async () => {
    const { store, userId } = await shop("ds-bad");
    const err = async (input: unknown) => { const r = await createDesignRequest(db, store, FREE1, "yearly", userId, input); return r.ok ? "OK" : r.error; };
    expect(await err({ service: "video" })).toContain("نوع التصميم");
    expect(await err({})).toContain("نوع التصميم");
    expect(await err({ service: "reel", note: "ا".repeat(601) })).toContain("الوصف");
  });

  it("رسالة الواتساب فيها المتجر والخدمة والوصف، والمجاني يتذكر", () => {
    const m = designRequestMessage({ storeName: "عطور الندى", slug: "nada", planName: "سنوية", service: "reel", note: "20 ثانية", isFree: true });
    expect(m).toContain("«عطور الندى» (nada)");
    expect(m).toContain("باقتي سنوية");
    expect(m).toContain("تصميم: ريل (التصميم المجاني ضمن باقتي)");
    expect(m).toContain("الوصف: 20 ثانية");
    expect(m).toContain("اللوجو وتفاصيل الطلب");
    expect(designRequestMessage({ storeName: "س", slug: "s", service: "logo" })).not.toContain("مجاني");
  });

  it("قائمة الأدمن: الأحدث أول مع بيانات المتجر والمستخدم", async () => {
    const s = await shop("ds-list");
    const now = Date.now();
    await db.insert(designRequests).values({ storeId: s.store.id, userId: s.userId, service: "logo", note: "أول", createdAt: new Date(now - 5000) });
    await db.insert(designRequests).values({ storeId: s.store.id, userId: s.userId, service: "identity", note: "ثاني", createdAt: new Date(now) });
    const rows = (await listDesignRequests(db)).filter((r) => r.storeSlug === "ds-list");
    expect(rows.map((r) => r.note)).toEqual(["ثاني", "أول"]);
    expect(rows[0]).toMatchObject({ storeName: "ds-list", service: "identity", isFree: false });
    expect(rows[0]!.ownerPhone).toBe((await db.select().from(users).where(eq(users.id, s.userId)))[0]!.phone);
  });
});
