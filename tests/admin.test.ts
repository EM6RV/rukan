import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLogs, media, plans, stores, subscriptionPayments, users, type PlanLimits } from "@/db/schema/platform";
import { activeAnnouncementsFor, deleteAnnouncement, dismissAnnouncement, listAnnouncements, saveAnnouncement } from "@/server/admin/announcements";
import { savePlan, listPlans } from "@/server/admin/plans";
import { getSiteContent, resetSiteContent, saveSiteContent } from "@/server/admin/site-content";
import { getPlatformConfig, listAudit, savePlatformConfig } from "@/server/admin/settings";
import { getPlatformStats } from "@/server/admin/stats";
import { getStoreDetail, listStores } from "@/server/admin/stores";
import { changePlan, extendTrial, listExpiring, listPayments, recordPayment, setSuspended } from "@/server/admin/subscriptions";
import { addMonths, monthKey, renewalMessage } from "@/lib/billing";
import { DEFAULT_SITE_CONTENT } from "@/lib/site-content";
import { createStoreForUser } from "@/server/store-service";
import { makeTestDb } from "./helpers/db";

const DAY = 86_400_000;
const LIMITS: PlanLimits = { maxProducts: 500, maxStaff: 3, allTemplates: true, coupons: true, reports: true, customDomain: false, pixels: false, removeBranding: false };
let db: Db;
let close: () => void;
let seq = 0;
let adminId: string;
let monthly: string, semi: string, yearly: string;

async function shop(slug: string, patch: Partial<typeof stores.$inferInsert> = {}) {
  const [u] = await db.insert(users).values({ phone: `0914${String(++seq).padStart(6, "0")}`, name: `مالك ${slug}`, passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  await db.update(stores).set({ onboardedAt: new Date(), planId: semi, ...patch }).where(eq(stores.id, r.data.storeId));
  return { id: r.data.storeId, ownerId: u!.id, phone: u!.phone };
}
const row = async (id: string) => (await db.select().from(stores).where(eq(stores.id, id)))[0]!;
const actor = () => ({ id: adminId });
const pay = (storeId: string, over: Record<string, unknown> = {}, now?: number) => recordPayment(db, { storeId, planId: monthly, amount: 250_000, method: "cash", ...over }, actor(), now);

beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  adminId = (await db.insert(users).values({ phone: "0910000000", name: "الأدمن", passwordHash: "x", platformRole: "admin" }).returning())[0]!.id;
  [monthly, semi, yearly] = (await db.insert(plans).values([
    { slug: "monthly", nameAr: "شهرية", billingPeriod: "monthly", price: 250_000, limits: { ...LIMITS, maxProducts: 200, maxStaff: 2, pixels: false, customDomain: false, removeBranding: false }, sortOrder: 1 },
    { slug: "semiannual", nameAr: "ست شهور", billingPeriod: "semiannual", price: 650_000, limits: LIMITS, sortOrder: 2 },
    { slug: "yearly", nameAr: "سنوية", billingPeriod: "yearly", price: 1_250_000, limits: LIMITS, sortOrder: 3 },
  ]).returning()).map((p) => p.id) as [string, string, string];
});
afterAll(() => close());

describe("أدوات الفوترة", () => {
  it("إضافة شهور تقويمية مع ضبط نهاية الشهر", () => {
    expect(new Date(addMonths(Date.UTC(2026, 0, 31), 1)).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(new Date(addMonths(Date.UTC(2028, 0, 31), 1)).toISOString().slice(0, 10)).toBe("2028-02-29");
    expect(new Date(addMonths(Date.UTC(2026, 10, 15), 3)).toISOString().slice(0, 10)).toBe("2027-02-15");
    expect(new Date(addMonths(Date.UTC(2026, 5, 10), 12)).toISOString().slice(0, 10)).toBe("2027-06-10");
    expect(monthKey(Date.UTC(2026, 2, 31, 23, 0))).toBe("2026-04"); // 01:00 يوم 1 أبريل بتوقيت ليبيا
  });
  it("رسالة التجديد", () => {
    expect(renewalMessage({ ownerName: "سالم", storeName: "عطور", daysLeft: 3, endDate: "2026-03-10", planName: "نمو" })).toContain("ينتهي بعد 3 أيام");
    expect(renewalMessage({ ownerName: "سالم", storeName: "عطور", daysLeft: 1, endDate: "x" })).toContain("ينتهي بكرة");
    expect(renewalMessage({ ownerName: "سالم", storeName: "عطور", daysLeft: 0, endDate: "x" })).toContain("انتهى");
  });
});

describe("تسجيل الدفعات", () => {
  it("متجر تجريبي ← نشط لشهر من الحين، وتسجل الدفعة والتدقيق", async () => {
    const s = await shop("pay-1", { status: "trial", trialEndsAt: new Date(Date.now() + 3 * DAY), currentPeriodEnd: null });
    const now = Date.now();
    const r = await pay(s.id, {}, now);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.periodEnd).toBe(addMonths(now, 1));
    expect(await row(s.id)).toMatchObject({ status: "active", planId: monthly, billingCycle: "monthly" });
    expect((await row(s.id)).currentPeriodEnd!.getTime()).toBe(addMonths(now, 1));
    const p = (await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.storeId, s.id)))[0]!;
    expect(p).toMatchObject({ amount: 250_000, method: "cash", recordedBy: adminId });
    expect((await db.select().from(auditLogs).where(eq(auditLogs.storeId, s.id))).map((a) => a.action)).toContain("subscription.payment");
  });

  it("دفعة وهو لسا ساري: تبدا من نهاية الفترة (ما يضيعش اللي دفعه)، والسنوي 12 شهر", async () => {
    const now = Date.now();
    const end = now + 10 * DAY;
    const s = await shop("pay-2", { status: "active", currentPeriodEnd: new Date(end) });
    const r = await pay(s.id, { planId: yearly, amount: 1_250_000, method: "bank_transfer" }, now);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.periodEnd).toBe(addMonths(end, 12));
    expect(await row(s.id)).toMatchObject({ billingCycle: "yearly" });
    // منتهي: من الحين
    const e = await shop("pay-3", { status: "active", currentPeriodEnd: new Date(now - 5 * DAY) });
    const r2 = await pay(e.id, {}, now);
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.data.periodEnd).toBe(addMonths(now, 1));
  });

  it("الموقوف يبقى موقوف، وتغيير الباقة مع الدفعة", async () => {
    const s = await shop("pay-4", { status: "suspended", currentPeriodEnd: null });
    await pay(s.id, { planId: monthly });
    expect(await row(s.id)).toMatchObject({ status: "suspended", planId: monthly });
  });

  it("الإيصال: خاص ومن نفس المتجر فقط", async () => {
    const [a, b] = [await shop("pay-5"), await shop("pay-6")];
    const priv = async (storeId: string | null, isPrivate = true) => (await db.insert(media).values({ storeId, mime: "image/webp", size: 1, driver: "turso", isPrivate }).returning())[0]!.id;
    expect((await pay(a.id, { receiptMediaId: await priv(b.id) })).ok).toBe(false);
    expect((await pay(a.id, { receiptMediaId: await priv(a.id, false) })).ok).toBe(false);
    expect((await pay(a.id, { receiptMediaId: await priv(null) })).ok).toBe(false);
    expect((await pay(a.id, { receiptMediaId: await priv(a.id) })).ok).toBe(true);
  });

  it("المدة تتحدد من الباقة مش من العميل (دورة مرسلة تتجاهل)", async () => {
    const now = Date.now();
    const s = await shop("pay-cycle", { status: "active", currentPeriodEnd: null });
    const r = await pay(s.id, { planId: monthly, billingCycle: "yearly" }, now); // الشهرية 1 شهر، حتى لو أرسل «سنوي»
    if (!r.ok) throw new Error(r.error);
    expect(r.data.periodEnd).toBe(addMonths(now, 1));
    expect(await row(s.id)).toMatchObject({ billingCycle: "monthly" });
    const p = (await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.storeId, s.id)))[0]!;
    expect(p.billingCycle).toBe("monthly");
  });

  it("باقة ست شهور: التجديد 6 أشهر", async () => {
    const now = Date.now();
    const s = await shop("pay-six", { status: "active", currentPeriodEnd: null });
    const r = await pay(s.id, { planId: semi, amount: 650_000 }, now);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.periodEnd).toBe(addMonths(now, 6));
    expect(await row(s.id)).toMatchObject({ billingCycle: "semiannual", planId: semi });
  });

  it("رفض مدخلات غلط", async () => {
    const s = await shop("pay-7");
    const err = async (over: Record<string, unknown>) => { const r = await pay(s.id, over); return r.ok ? "OK" : r.error; };
    expect(await err({ amount: 0 })).toContain("أكبر من صفر");
    expect(await err({ amount: 12.5 })).toContain("رقم صحيح");
    expect(await err({ amount: "99" })).toContain("المبلغ");
    expect(await err({ method: "visa" })).toContain("طريقة");
    expect(await err({ planId: "ghost" })).toContain("الباقة");
    expect(await err({ storeId: "ghost" })).toContain("المتجر");
    expect(await err({ note: "ا".repeat(301) })).toContain("الملاحظة");
  });

  it("متزامنتين: كل واحدة تمدد من نهاية السابقة", async () => {
    const now = Date.now();
    const s = await shop("pay-8", { status: "active", currentPeriodEnd: new Date(now + 5 * DAY) });
    const rs = await Promise.all([pay(s.id, {}, now), pay(s.id, {}, now)]);
    expect(rs.every((r) => r.ok)).toBe(true);
    expect((await row(s.id)).currentPeriodEnd!.getTime()).toBe(addMonths(addMonths(now + 5 * DAY, 1), 1));
  });

  it("قائمة الدفعات بالصفحات وعزل المتجر", async () => {
    const s = await shop("pay-9");
    for (let i = 0; i < 3; i++) await pay(s.id, { amount: 1000 + i });
    const all = await listPayments(db, { storeId: s.id });
    expect(all.total).toBe(3);
    expect(all.items[0]).toMatchObject({ storeName: "pay-9", planName: "شهرية", recordedBy: "الأدمن" });
    expect((await listPayments(db, { storeId: s.id, pageSize: 2, page: 2 })).items).toHaveLength(1);
  });
});

describe("التجربة والإيقاف والباقة", () => {
  it("تمديد التجربة من نهايتها أو من الحين، وللمنتهي يرجّعه تجريبي، ويرفض المشترك", async () => {
    const now = Date.now();
    const a = await shop("tr-1", { status: "trial", trialEndsAt: new Date(now + 2 * DAY), currentPeriodEnd: null });
    const r = await extendTrial(db, a.id, 7, actor(), now);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.trialEndsAt).toBe(now + 9 * DAY);
    const b = await shop("tr-2", { status: "expired", trialEndsAt: new Date(now - 10 * DAY), currentPeriodEnd: null });
    const r2 = await extendTrial(db, b.id, 5, actor(), now);
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.data.trialEndsAt).toBe(now + 5 * DAY);
    expect((await row(b.id)).status).toBe("trial");
    const c = await shop("tr-3", { status: "active", currentPeriodEnd: new Date(now + 20 * DAY) });
    expect(await extendTrial(db, c.id, 5, actor(), now)).toEqual({ ok: false, error: expect.stringContaining("مشترك") });
    for (const bad of [0, 400, 1.5, "7", null]) expect((await extendTrial(db, a.id, bad, actor(), now)).ok).toBe(false);
    expect((await extendTrial(db, "ghost", 5, actor())).ok).toBe(false);
  });

  it("إيقاف وتفعيل: التفعيل يرجّع الحالة المنطقية", async () => {
    const now = Date.now();
    const paid = await shop("sp-1", { status: "active", currentPeriodEnd: new Date(now + 20 * DAY) });
    expect((await setSuspended(db, paid.id, true, actor(), "مخالفة", now)).ok).toBe(true);
    expect((await row(paid.id)).status).toBe("suspended");
    expect((await setSuspended(db, paid.id, true, actor(), null, now)).ok).toBe(false);
    expect(await setSuspended(db, paid.id, false, actor(), null, now)).toMatchObject({ ok: true, data: { status: "active" } });
    expect((await setSuspended(db, paid.id, false, actor(), null, now)).ok).toBe(false);
    const tri = await shop("sp-2", { status: "suspended", trialEndsAt: new Date(now + DAY), currentPeriodEnd: null });
    expect(await setSuspended(db, tri.id, false, actor(), null, now)).toMatchObject({ data: { status: "trial" } });
    const old = await shop("sp-3", { status: "suspended", trialEndsAt: new Date(now - DAY), currentPeriodEnd: null });
    expect(await setSuspended(db, old.id, false, actor(), null, now)).toMatchObject({ data: { status: "expired" } });
    expect((await db.select().from(auditLogs).where(eq(auditLogs.storeId, paid.id))).map((a) => a.action)).toEqual(expect.arrayContaining(["store.suspend", "store.unsuspend"]));
  });

  it("تغيير الباقة يدوياً", async () => {
    const s = await shop("cp-1");
    expect((await changePlan(db, s.id, monthly, actor())).ok).toBe(true);
    expect((await row(s.id)).planId).toBe(monthly);
    expect((await changePlan(db, s.id, "ghost", actor())).ok).toBe(false);
    expect((await changePlan(db, "ghost", monthly, actor())).ok).toBe(false);
  });
});

describe("قائمة المتاجر", () => {
  it("فلاتر الحالة الفعلية والبحث والصفحات", async () => {
    const now = Date.now();
    const mk = (slug: string, patch: object) => shop(slug, patch);
    const t = await mk("ls-trial", { status: "trial", trialEndsAt: new Date(now + 5 * DAY), currentPeriodEnd: null });
    const tExp = await mk("ls-trial-exp", { status: "trial", trialEndsAt: new Date(now - DAY), currentPeriodEnd: null });
    const a = await mk("ls-active", { status: "active", currentPeriodEnd: new Date(now + 9 * DAY) });
    const aExp = await mk("ls-active-exp", { status: "active", currentPeriodEnd: new Date(now - DAY) });
    const sus = await mk("ls-susp", { status: "suspended" });
    const names = async (f: Parameters<typeof listStores>[1]) => (await listStores(db, f, now)).items.map((i) => i.slug).filter((s) => s.startsWith("ls-")).sort();
    expect(await names({ state: "trial" })).toEqual(["ls-trial"]);
    expect(await names({ state: "active" })).toEqual(["ls-active"]);
    expect(await names({ state: "expired" })).toEqual(["ls-active-exp", "ls-trial-exp"]);
    expect(await names({ state: "suspended" })).toEqual(["ls-susp"]);
    expect((await listStores(db, { q: "ls-active", pageSize: 100 }, now)).items.map((i) => i.state).sort()).toEqual(["active", "expired"]);
    expect((await listStores(db, { q: t.phone }, now)).items.map((i) => i.slug)).toEqual(["ls-trial"]);
    expect((await listStores(db, { q: `+218${a.phone.slice(1)}` }, now)).total).toBe(0); // البحث بالصيغة المخزنة (09…) فقط
    expect((await listStores(db, { q: "%" }, now)).total).toBe(0);
    expect((await listStores(db, { planId: monthly }, now)).items.filter((i) => i.slug.startsWith("ls-"))).toEqual([]);
    const p1 = await listStores(db, { pageSize: 2, page: 1 }, now);
    expect(p1.items).toHaveLength(2);
    expect(p1.pageCount).toBe(Math.ceil(p1.total / 2));
    expect(aExp && sus && tExp).toBeTruthy();
  });

  it("تفاصيل المتجر: المالك والباقة والدفعات والتدقيق والعدّادات", async () => {
    const s = await shop("dt-1");
    await pay(s.id);
    const d = (await getStoreDetail(db, s.id))!;
    expect(d.ownerName).toBe("مالك dt-1");
    expect(d.plan?.slug).toBe("monthly"); // الدفعة نقلته للباقة الشهرية
    expect(d.payments).toHaveLength(1);
    expect(d.counts).toEqual({ products: 0, orders: 0, customers: 0 });
    expect(d.members.map((m) => m.role)).toEqual(["owner"]);
    expect(d.audit.map((a) => a.action)).toContain("subscription.payment");
    expect(await getStoreDetail(db, "ghost")).toBeNull();
  });
});

describe("التنبيه قبل الانتهاء", () => {
  it("المتاجر القريبة من الانتهاء والمنتهية حديثاً فقط", async () => {
    const now = Date.now();
    await shop("ex-soon", { status: "active", currentPeriodEnd: new Date(now + 3 * DAY) });
    await shop("ex-trial", { status: "trial", trialEndsAt: new Date(now + 1 * DAY), currentPeriodEnd: null });
    await shop("ex-far", { status: "active", currentPeriodEnd: new Date(now + 30 * DAY) });
    await shop("ex-recent", { status: "active", currentPeriodEnd: new Date(now - 2 * DAY) });
    await shop("ex-old", { status: "active", currentPeriodEnd: new Date(now - 30 * DAY) });
    await shop("ex-susp", { status: "suspended", currentPeriodEnd: new Date(now + 2 * DAY) });
    const list = (await listExpiring(db, {}, now)).filter((x) => x.slug.startsWith("ex-"));
    expect(list.map((x) => x.slug)).toEqual(["ex-recent", "ex-trial", "ex-soon"]);
    expect(list.map((x) => x.state)).toEqual(["expired", "trial", "active"]);
    expect(list[2]).toMatchObject({ daysLeft: 3, ownerName: "مالك ex-soon", planName: "ست شهور" });
  });
});

describe("إحصائيات المنصة", () => {
  it("عدّادات الحالات والإيرادات الشهرية وMRR", async () => {
    const { db: d2, close: c2 } = await makeTestDb();
    try {
      const [admin] = await d2.insert(users).values({ phone: "0910000001", name: "أدمن", passwordHash: "x", platformRole: "admin" }).returning();
      const [plM] = await d2.insert(plans).values({ slug: "m", nameAr: "شهرية", billingPeriod: "monthly", price: 100_000, limits: LIMITS }).returning();
      const [pl] = await d2.insert(plans).values({ slug: "g", nameAr: "سنوية", billingPeriod: "yearly", price: 1_200_000, limits: LIMITS }).returning();
      const now = Date.now();
      const mk = async (slug: string, patch: object) => {
        const [u] = await d2.insert(users).values({ phone: `0915${String(++seq).padStart(6, "0")}`, name: slug, passwordHash: "x" }).returning();
        const r = await createStoreForUser(d2, { userId: u!.id, name: slug, slug });
        if (!r.ok) throw new Error(r.error);
        await d2.update(stores).set({ onboardedAt: new Date(), planId: pl!.id, ...patch }).where(eq(stores.id, r.data.storeId));
        return r.data.storeId;
      };
      const m = await mk("mo-m", { status: "active", currentPeriodEnd: new Date(now + 20 * DAY), billingCycle: "monthly", planId: plM!.id });
      await mk("yr-y", { status: "active", currentPeriodEnd: new Date(now + 20 * DAY), billingCycle: "yearly" });
      await mk("tr-t", { status: "trial", trialEndsAt: new Date(now + 5 * DAY), currentPeriodEnd: null });
      await mk("ex-e", { status: "expired", currentPeriodEnd: new Date(now - DAY) });
      await mk("su-s", { status: "suspended" });
      const [unfinished] = await d2.insert(users).values({ phone: "0915999999", name: "ناقص", passwordHash: "x" }).returning();
      await createStoreForUser(d2, { userId: unfinished!.id, name: "ناقص", slug: "unfinished" });
      await recordPayment(d2, { storeId: m, planId: plM!.id, amount: 100_000, method: "cash" }, { id: admin!.id });
      await recordPayment(d2, { storeId: m, planId: pl!.id, amount: 1_200_000, method: "bank_transfer" }, { id: admin!.id });

      const st = await getPlatformStats(d2, now);
      expect(st.byState).toEqual({ trial: 1, active: 2, expired: 1, suspended: 1 });
      expect(st.storesTotal).toBe(5);
      expect(st.unfinished).toBe(1);
      expect(st.mrr).toBe(100_000 + 100_000); // شهري + (سنوي/12)
      expect(st.revenue).toHaveLength(6);
      expect(st.revenueThisMonth).toBe(1_300_000);
      expect(st.byPlan).toEqual([{ name: "سنوية", count: 2 }]);
      expect(st.newWeek).toBe(5);
      expect(st.expiring.map((x) => x.slug)).toEqual(expect.arrayContaining(["ex-e", "tr-t"]));
    } finally { c2(); }
  });
});

describe("الباقات", () => {
  const valid = { nameAr: "احترافي", descriptionAr: "للمتاجر الكبيرة", billingPeriod: "yearly", price: 800_000, isFeatured: false, sortOrder: 3, isActive: true, limits: { maxProducts: null, maxStaff: null, allTemplates: true, coupons: true, reports: true, customDomain: true, pixels: true, removeBranding: true } };

  it("إنشاء وتعديل (يرجّع المتاجر المتأثرة لتفريغ الكاش)", async () => {
    const r = await savePlan(db, { ...valid, slug: "pro" }, adminId);
    if (!r.ok) throw new Error(r.error);
    expect(r.data.affectedStores).toEqual([]);
    const s = await shop("pl-1", { planId: r.data.id });
    const u = await savePlan(db, { ...valid, id: r.data.id, price: 700_000, limits: { ...valid.limits, maxStaff: 10 } }, adminId);
    if (!u.ok) throw new Error(u.error);
    expect(u.data.affectedStores.map((x) => x.id)).toEqual([s.id]);
    const saved = (await listPlans(db)).find((p) => p.id === r.data.id)!;
    expect(saved).toMatchObject({ slug: "pro", price: 700_000, billingPeriod: "yearly" });
    expect(saved.limits.maxStaff).toBe(10);
  });

  it("باقة وحدة بس مميزة، والسعر والمدة يتعدلوا", async () => {
    const a = await savePlan(db, { ...valid, slug: `f${++seq}`, isFeatured: true }, adminId);
    const b = await savePlan(db, { ...valid, slug: `f${++seq}`, isFeatured: true }, adminId);
    if (!a.ok || !b.ok) throw new Error("save");
    const all = await listPlans(db);
    expect(all.filter((p) => p.isFeatured).map((p) => p.id)).toEqual([b.data.id]);
    // تعديل المدة والسعر
    const u = await savePlan(db, { ...valid, id: a.data.id, billingPeriod: "monthly", price: 100_000, isFeatured: true }, adminId);
    if (!u.ok) throw new Error(u.error);
    expect((await listPlans(db)).find((p) => p.id === a.data.id)).toMatchObject({ billingPeriod: "monthly", price: 100_000, isFeatured: true });
    expect((await listPlans(db)).find((p) => p.id === b.data.id)!.isFeatured).toBe(false);
  });

  it("تحقق وتكرار الرمز وباقة التجربة", async () => {
    const err = async (over: Record<string, unknown>) => { const r = await savePlan(db, { ...valid, slug: `x${++seq}`, ...over }, adminId); return r.ok ? "OK" : r.error; };
    expect(await err({ nameAr: "x" })).toContain("اسم الباقة");
    expect(await err({ slug: "Bad Slug" })).toContain("الرمز");
    expect(await err({ price: -1 })).toContain("0 أو أكثر");
    expect(await err({ price: 10.5 })).toContain("رقم صحيح");
    expect(await err({ billingPeriod: "weekly" })).toContain("مدة الباقة");
    expect(await err({ limits: { ...valid.limits, maxProducts: -5 } })).toContain("حد المنتجات");
    expect(await err({ limits: { ...valid.limits, coupons: "yes" } })).not.toBe("OK");
    expect(await savePlan(db, { ...valid, slug: "yearly" }, adminId)).toEqual({ ok: false, error: expect.stringContaining("مستعمل") });
    expect((await savePlan(db, { ...valid }, adminId)).ok).toBe(false); // بدون رمز
    expect(await savePlan(db, { ...valid, id: semi, isActive: false }, adminId)).toEqual({ ok: false, error: expect.stringContaining("باقة التجربة") });
    expect((await savePlan(db, { ...valid, id: "ghost" }, adminId)).ok).toBe(false);
  });
});

describe("الإعلانات", () => {
  it("النافذة الزمنية والتعطيل والإغلاق لكل مستخدم", async () => {
    const now = Date.now();
    const [u1, u2] = [await shop("an-1"), await shop("an-2")];
    const mk = (over: Record<string, unknown>) => saveAnnouncement(db, { title: "إعلان", body: "نص الإعلان", level: "info", ...over }, adminId, now);
    const live = await mk({ title: "فعّال" });
    const future = await mk({ title: "قادم", startsAt: now + DAY });
    const ended = await mk({ title: "منتهي", startsAt: now - 3 * DAY, endsAt: now - DAY, isActive: false });
    const off = await mk({ title: "معطل", isActive: false });
    if (!live.ok || !future.ok || !ended.ok || !off.ok) throw new Error("setup");
    expect((await activeAnnouncementsFor(db, u1.ownerId, now)).map((a) => a.title)).toEqual(["فعّال"]);
    expect((await dismissAnnouncement(db, u1.ownerId, live.data.id)).ok).toBe(true);
    expect((await dismissAnnouncement(db, u1.ownerId, live.data.id)).ok).toBe(true); // مكرر بدون خطأ
    expect(await activeAnnouncementsFor(db, u1.ownerId, now)).toEqual([]);
    expect((await activeAnnouncementsFor(db, u2.ownerId, now)).map((a) => a.title)).toEqual(["فعّال"]);
    expect((await activeAnnouncementsFor(db, u2.ownerId, now + 2 * DAY)).map((a) => a.title).sort()).toEqual(["فعّال", "قادم"]);
    const list = await listAnnouncements(db);
    expect(list.find((a) => a.id === live.data.id)!.dismissedBy).toBe(1);
    expect((await dismissAnnouncement(db, u1.ownerId, "ghost")).ok).toBe(false);
    expect((await deleteAnnouncement(db, live.data.id, adminId)).ok).toBe(true);
    expect((await deleteAnnouncement(db, live.data.id, adminId)).ok).toBe(false);
  });

  it("تحقق المدخلات وتعديل", async () => {
    const now = Date.now();
    const err = async (over: Record<string, unknown>) => { const r = await saveAnnouncement(db, { title: "عنوان", body: "نص", level: "info", ...over }, adminId, now); return r.ok ? "OK" : r.error; };
    expect(await err({ title: "" })).toContain("العنوان");
    expect(await err({ body: "ا".repeat(501) })).toContain("النص");
    expect(await err({ level: "danger" })).toContain("نوع");
    expect(await err({ startsAt: 5000, endsAt: 4000 })).toContain("بعد البداية");
    expect(await err({ endsAt: now - 1000 })).toContain("فات");
    const r = await saveAnnouncement(db, { title: "قديم", body: "نص", level: "warning" }, adminId, now);
    if (!r.ok) throw new Error(r.error);
    expect((await saveAnnouncement(db, { id: r.data.id, title: "جديد", body: "نص جديد", level: "success", isActive: false }, adminId, now)).ok).toBe(true);
    expect((await listAnnouncements(db)).find((a) => a.id === r.data.id)).toMatchObject({ title: "جديد", level: "success", isActive: false });
    expect((await saveAnnouncement(db, { id: "ghost", title: "x2", body: "نص", level: "info" }, adminId, now)).ok).toBe(false);
  });
});

describe("محتوى الموقع التسويقي", () => {
  it("الافتراضي ثم الحفظ ثم الرجوع", async () => {
    expect(await getSiteContent(db)).toEqual(DEFAULT_SITE_CONTENT);
    const next = structuredClone(DEFAULT_SITE_CONTENT);
    next.hero.title = "عنوان جديد للهيرو";
    next.faq.items.push({ q: "سؤال جديد؟", a: "جواب جديد" });
    expect((await saveSiteContent(db, next, adminId)).ok).toBe(true);
    expect((await getSiteContent(db)).hero.title).toBe("عنوان جديد للهيرو");
    expect((await getSiteContent(db)).faq.items).toHaveLength(DEFAULT_SITE_CONTENT.faq.items.length + 1);
    expect((await resetSiteContent(db, adminId)).ok).toBe(true);
    expect(await getSiteContent(db)).toEqual(DEFAULT_SITE_CONTENT);
  });

  it("محتوى محفوظ قبل قسم «خدمات التصميم» (بدون design) يبقى سليم ويأخذ الافتراضي للقسم الجديد", async () => {
    const { siteContent } = await import("@/db/schema/platform");
    const old = structuredClone(DEFAULT_SITE_CONTENT) as Record<string, unknown>;
    delete old.design;
    (old.hero as { title: string }).title = "عنوان قديم محفوظ";
    await db.insert(siteContent).values({ key: "marketing", value: old }).onConflictDoUpdate({ target: siteContent.key, set: { value: old } });
    const got = await getSiteContent(db);
    expect(got.hero.title).toBe("عنوان قديم محفوظ"); // ما ضاع تعديل الأدمن
    expect(got.design).toEqual(DEFAULT_SITE_CONTENT.design);
    await resetSiteContent(db, adminId);
  });

  it("رفض بيانات غلط، والصورة لازم تكون عامة من وسائط المنصة", async () => {
    const mut = (f: (c: typeof DEFAULT_SITE_CONTENT) => void) => { const c = structuredClone(DEFAULT_SITE_CONTENT); f(c); return saveSiteContent(db, c, adminId); };
    expect((await mut((c) => { c.hero.title = "ا"; })).ok).toBe(false);
    expect((await mut((c) => { c.features.items = []; })).ok).toBe(false);
    expect((await mut((c) => { c.showcase.items[0]!.href = "javascript:alert(1)"; })).ok).toBe(false);
    expect((await mut((c) => { c.showcase.items[0]!.primary = "red"; })).ok).toBe(false);
    expect((await mut((c) => { c.faq.items = Array.from({ length: 13 }, () => ({ q: "سؤال؟", a: "جواب" })); })).ok).toBe(false);
    expect((await saveSiteContent(db, { hero: {} }, adminId)).ok).toBe(false);
    expect((await mut((c) => { c.showcase.items[0]!.href = "https://example.com/x"; })).ok).toBe(true);

    const other = await shop("sc-1");
    const platformImg = (await db.insert(media).values({ storeId: null, mime: "image/webp", size: 1, driver: "turso" }).returning())[0]!.id;
    const storeImg = (await db.insert(media).values({ storeId: other.id, mime: "image/webp", size: 1, driver: "turso" }).returning())[0]!.id;
    const privImg = (await db.insert(media).values({ storeId: null, mime: "image/webp", size: 1, driver: "turso", isPrivate: true }).returning())[0]!.id;
    expect((await mut((c) => { c.hero.imageMediaId = storeImg; })).ok).toBe(false);
    expect((await mut((c) => { c.hero.imageMediaId = privImg; })).ok).toBe(false);
    expect((await mut((c) => { c.hero.imageMediaId = "ghost"; })).ok).toBe(false);
    expect((await mut((c) => { c.hero.imageMediaId = platformImg; })).ok).toBe(true);
  });

  it("محتوى تالف في القاعدة يرجع للافتراضي", async () => {
    const { siteContent } = await import("@/db/schema/platform");
    await db.insert(siteContent).values({ key: "marketing", value: { hero: "garbage" } }).onConflictDoUpdate({ target: siteContent.key, set: { value: { hero: "garbage" } } });
    expect(await getSiteContent(db)).toEqual(DEFAULT_SITE_CONTENT);
  });
});

describe("إعدادات المنصة وسجل النشاط", () => {
  it("حفظ وتحقق", async () => {
    expect(await getPlatformConfig(db)).toMatchObject({ trialDays: 3, trialPlanSlug: "semiannual", supportWhatsapp: null });
    expect((await savePlatformConfig(db, { trialDays: 21, trialPlanSlug: "monthly", supportWhatsapp: "+218 91 234 5678" }, adminId)).ok).toBe(true);
    expect(await getPlatformConfig(db)).toEqual({ trialDays: 21, trialPlanSlug: "monthly", supportWhatsapp: "0912345678" });
    const err = async (over: Record<string, unknown>) => { const r = await savePlatformConfig(db, { trialDays: 14, trialPlanSlug: "semiannual", supportWhatsapp: null, ...over }, adminId); return r.ok ? "OK" : r.error; };
    expect(await err({ trialDays: 0 })).toContain("يوم");
    expect(await err({ trialDays: 91 })).toContain("90");
    expect(await err({ trialPlanSlug: "ghost" })).toContain("باقة التجربة");
    expect(await err({ supportWhatsapp: "0961234567" })).toContain("واتساب");
    expect(await err({})).toBe("OK");
  });

  it("سجل النشاط: فلترة وصفحات", async () => {
    const all = await listAudit(db, { pageSize: 5 });
    expect(all.items).toHaveLength(5);
    expect(all.total).toBeGreaterThan(5);
    expect(all.items[0]!.createdAt).toBeGreaterThanOrEqual(all.items[1]!.createdAt);
    const pays = await listAudit(db, { action: "subscription.payment", pageSize: 100 });
    expect(pays.items.every((a) => a.action === "subscription.payment")).toBe(true);
    expect(pays.items[0]).toMatchObject({ actor: "الأدمن" });
    const s = await shop("au-1");
    await pay(s.id);
    expect((await listAudit(db, { storeId: s.id })).items.map((a) => a.action)).toEqual(["subscription.payment"]);
  });
});

describe("إعادة تعيين كلمة سر المالك", () => {
  it("تغيّر الكلمة وتلغي الجلسات وتتسجل، وترفض الأدمن والمقفول والضعيف", async () => {
    const { adminResetPassword } = await import("@/server/admin/users");
    const { authenticate } = await import("@/server/auth/service");
    const { createSession } = await import("@/server/auth/session");
    const { hashPassword } = await import("@/server/auth/password");
    const { sessions } = await import("@/db/schema/platform");
    const s = await shop("rp-1");
    await db.update(users).set({ passwordHash: await hashPassword("old-password-1") }).where(eq(users.id, s.ownerId));
    await createSession(db, s.ownerId);
    expect(await adminResetPassword(db, s.ownerId, "short", actor())).toMatchObject({ ok: false });
    expect(await adminResetPassword(db, s.ownerId, "new-password-9", actor(), s.id)).toEqual({ ok: true, data: undefined });
    expect(await db.select().from(sessions).where(eq(sessions.userId, s.ownerId))).toHaveLength(0);
    expect(await authenticate(db, { phone: s.phone, password: "old-password-1" }, "9.9.9.1")).toMatchObject({ ok: false });
    expect(await authenticate(db, { phone: s.phone, password: "new-password-9" }, "9.9.9.1")).toMatchObject({ ok: true });
    expect((await db.select().from(auditLogs).where(eq(auditLogs.storeId, s.id))).map((a) => a.action)).toContain("user.reset_password");
    expect(await adminResetPassword(db, adminId, "new-password-9", actor())).toEqual({ ok: false, error: expect.stringContaining("أدمن") });
    await db.update(users).set({ status: "blocked" }).where(eq(users.id, s.ownerId));
    expect(await adminResetPassword(db, s.ownerId, "new-password-9", actor())).toEqual({ ok: false, error: expect.stringContaining("حسابك موقوف") });
    expect((await adminResetPassword(db, "ghost", "new-password-9", actor())).ok).toBe(false);
  });
});
