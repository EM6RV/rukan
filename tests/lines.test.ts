import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db";
import { addons, lineSubscriptions, plans, platformSettings, storeAddons, stores, subscriptionPayments, users } from "@/db/schema/platform";
import { combineLimits, effectiveLimits } from "@/lib/entitlements";
import { gymSetupSchema, loungeSetupSchema, marketSetupSchema } from "@/lib/line-setup";
import { DEFAULT_ADDONS, DEFAULT_PLANS, LINE_PLANS, NO_STORE_LIMITS, MARKET_BASIC, GYM_PRO, STARTER_LIMITS } from "@/lib/plan-catalog";
import { addonFitsLine } from "@/lib/product-lines";
import { bundleFor, saveBundle } from "@/server/admin/bundles";
import { publicPlans, savePlan } from "@/server/admin/plans";
import { getLineConfig, saveLineConfig, setLineBeta } from "@/server/admin/settings";
import { listStores } from "@/server/admin/stores";
import { adminStartTrial, changePlan, extendTrial, listExpiring, recordPayment, setSuspended, suggestedAmount } from "@/server/admin/subscriptions";
import { businessAccess, computeLineState } from "@/server/line-access";
import { availableLines, businessLimits, lineAccess, lineLaunch, loadLines, removeLineDuringOnboarding, saveLineSetup, startLineTrial } from "@/server/lines";
import { completeOnboarding, createStoreForUser } from "@/server/store-service";
import { makeTestDb } from "./helpers/db";

const DAY = 86_400_000;
let db: Db;
let close: () => void;
let adminId: string;
let seq = 0;
const P: Record<string, string> = {};

async function owner() {
  const [u] = await db.insert(users).values({ phone: `0917${String(++seq).padStart(6, "0")}`, name: `مالك ${seq}`, passwordHash: "x" }).returning();
  return u!.id;
}
async function business(slug: string, lines: Parameters<typeof createStoreForUser>[1]["lines"]) {
  const r = await createStoreForUser(db, { userId: await owner(), name: slug, slug, lines });
  if (!r.ok) throw new Error(r.error);
  await db.update(stores).set({ onboardedAt: new Date() }).where(eq(stores.id, r.data.storeId));
  return r.data.storeId;
}
const sub = async (storeId: string, line: string) => db.select().from(lineSubscriptions).where(and(eq(lineSubscriptions.storeId, storeId), eq(lineSubscriptions.line, line as "store"))).get();
const storeRow = async (id: string) => (await db.select().from(stores).where(eq(stores.id, id)).get())!;

beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  adminId = (await db.insert(users).values({ phone: "0910000999", name: "أدمن", passwordHash: "x", platformRole: "admin" }).returning())[0]!.id;
  for (const p of [...DEFAULT_PLANS, ...LINE_PLANS]) {
    const [row] = await db.insert(plans).values({ ...p, price: p.prices.m1 ?? 0 }).returning();
    P[p.slug] = row!.id;
  }
  for (const a of DEFAULT_ADDONS) await db.insert(addons).values(a);
});
afterAll(() => close());

describe("migration 0017: الاشتراكات الحالية تنتقل لسطر store", () => {
  it("كل متجر ياخذ سطر بنفس الباقة والمدة والحالة والتواريخ، والإضافات والدفعات والباقات تولي store", async () => {
    const MIG = "./src/db/migrations";
    const dir = mkdtempSync(join(tmpdir(), "rukn-lines-"));
    const old = join(dir, "old");
    const journal = JSON.parse(readFileSync(join(MIG, "meta/_journal.json"), "utf8"));
    const entries = journal.entries.filter((e: { tag: string }) => e.tag.slice(0, 4) <= "0016");
    mkdirSync(join(old, "meta"), { recursive: true });
    for (const e of entries) cpSync(join(MIG, `${e.tag}.sql`), join(old, `${e.tag}.sql`));
    writeFileSync(join(old, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
    const { db: d, client } = createDb(`file:${join(dir, "m.db")}`);
    try {
      await client.execute("PRAGMA foreign_keys = ON");
      await migrate(d, { migrationsFolder: old });
      await client.execute(`INSERT INTO plans (id, slug, name_ar, limits, prices) VALUES ('pl1','growth','نمو','{"maxProducts":null,"maxStaff":3}','{"m1":220000}')`);
      await client.execute("INSERT INTO users (id, phone, name, password_hash, created_at) VALUES ('u1','0910000001','أ','x',1),('u2','0910000002','ب','x',1)");
      const end = Date.UTC(2027, 2, 14);
      await client.execute({ sql: "INSERT INTO stores (id, slug, name, owner_user_id, plan_id, billing_cycle, status, trial_ends_at, current_period_end, onboarded_at, created_at, updated_at) VALUES ('s1','a','a','u1','pl1','yearly','active',NULL,?,5,1,1),('s2','b','b','u2',NULL,'monthly','trial',?,NULL,NULL,1,1)", args: [end, end] });
      await client.execute("INSERT INTO addons (id, slug, name_ar, kind, units, monthly_price) VALUES ('ad1','extra-staff','موظف','staff',1,20000)");
      await client.execute("INSERT INTO store_addons (id, store_id, addon_id, quantity, created_at) VALUES ('sa1','s1','ad1',2,1)");
      await client.execute("INSERT INTO subscription_payments (id, store_id, plan_id, billing_cycle, amount, method, period_start, period_end, recorded_by, created_at) VALUES ('pay1','s1','pl1','yearly',990000,'cash',1,2,'u1',1)");

      await migrate(d, { migrationsFolder: MIG });
      const rows = (await client.execute("SELECT store_id, line, plan_id, billing_cycle, status, trial_ends_at, current_period_end, setup FROM line_subscriptions ORDER BY store_id")).rows;
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ store_id: "s1", line: "store", plan_id: "pl1", billing_cycle: "yearly", status: "active", trial_ends_at: null, current_period_end: end, setup: '{"done":true}' });
      expect(rows[1]).toMatchObject({ store_id: "s2", line: "store", plan_id: null, billing_cycle: "monthly", status: "trial", trial_ends_at: end, setup: "{}" });
      expect((await client.execute("SELECT line FROM store_addons")).rows[0]).toMatchObject({ line: "store" });
      expect((await client.execute("SELECT line FROM subscription_payments")).rows[0]).toMatchObject({ line: "store" });
      expect((await client.execute("SELECT line FROM plans")).rows[0]).toMatchObject({ line: "store" });
      expect((await client.execute("SELECT line_beta FROM stores WHERE id='s1'")).rows[0]).toMatchObject({ line_beta: "[]" });
      // الـ migration تقدر تتعاد بدون تكرار (السطر موجود = ما يتنسخش)
      await client.execute("DELETE FROM __drizzle_migrations WHERE id = (SELECT max(id) FROM __drizzle_migrations)");
      const sql = readFileSync(join(MIG, "0017_lines.sql"), "utf8");
      await client.execute(sql.slice(sql.lastIndexOf("INSERT INTO `line_subscriptions`")));
      expect((await client.execute("SELECT count(*) AS n FROM line_subscriptions")).rows[0]).toMatchObject({ n: 2 });
    } finally {
      client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("حالة المنظومة (computeLineState)", () => {
  const now = Date.UTC(2026, 5, 1);
  it("تجربة/نشط/منتهي/موقوف", () => {
    expect(computeLineState({ status: "trial", trialEndsAt: new Date(now + 3 * DAY), currentPeriodEnd: null }, now)).toEqual({ state: "trial", daysLeft: 3, writable: true, posWritable: true });
    expect(computeLineState({ status: "active", trialEndsAt: null, currentPeriodEnd: new Date(now + 10 * DAY) }, now)).toMatchObject({ state: "active", daysLeft: 10 });
    expect(computeLineState({ status: "active", trialEndsAt: null, currentPeriodEnd: new Date(now - 1) }, now)).toMatchObject({ state: "expired", writable: false, posWritable: false });
    expect(computeLineState({ status: "suspended", trialEndsAt: null, currentPeriodEnd: new Date(now + DAY) }, now)).toMatchObject({ state: "suspended", writable: false });
  });
  it("الكاشير يكمّل في وردية فُتحت قبل الانتهاء، وما يفتحش وردية بعده", () => {
    const sub = { status: "active" as const, trialEndsAt: null, currentPeriodEnd: new Date(now - 60_000) };
    expect(computeLineState(sub, now, { openShiftStartedAt: now - 3_600_000 })).toMatchObject({ state: "expired", writable: false, posWritable: true });
    expect(computeLineState(sub, now, { openShiftStartedAt: now - 1000 })).toMatchObject({ posWritable: false });
    expect(computeLineState({ ...sub, status: "suspended" }, now, { openShiftStartedAt: now - 3_600_000 })).toMatchObject({ posWritable: false });
  });
});

describe("التسجيل باختيار المنظومة", () => {
  it("نشاط ماركت + نادي: تجربة لكل وحدة بباقتها ومدتها، والمتجر الأونلاين مقفول", async () => {
    await db.insert(platformSettings).values({ key: "trial_days_gym", value: 10 });
    const before = Date.now();
    const id = await business("mkt-gym", ["market", "gym"]);
    const [m, g, st] = [await sub(id, "market"), await sub(id, "gym"), await sub(id, "store")];
    expect(m).toMatchObject({ status: "trial", planId: P["market-growth"] });
    expect(g).toMatchObject({ status: "trial", planId: P["gym-growth"] });
    expect(st).toBeUndefined();
    expect(m!.trialEndsAt!.getTime() - before).toBeGreaterThanOrEqual(7 * DAY - 5000);
    expect(Math.round((g!.trialEndsAt!.getTime() - before) / DAY)).toBe(10);
    const row = await storeRow(id);
    expect(row).toMatchObject({ status: "expired", businessType: "grocery" }); // واجهة المتجر مقفولة
    const lines = await loadLines(db, row);
    expect(lines.store.subscribed).toBe(false);
    expect(lines.market).toMatchObject({ subscribed: true, state: "trial", writable: true, planSlug: "market-growth" });
    expect(businessAccess(lines)).toMatchObject({ state: "trial", writable: true });
  });

  it("المتجر لوحده: نفس السلوك القديم (أعمدة stores نسخة من سطره)", async () => {
    const id = await business("st-only", undefined);
    const s = await sub(id, "store");
    const row = await storeRow(id);
    expect(s).toMatchObject({ status: "trial", planId: P.growth });
    expect(row).toMatchObject({ status: "trial", planId: P.growth });
    expect(row.trialEndsAt?.getTime()).toBe(s!.trialEndsAt?.getTime());
  });

  it("زيادة وشيل منظومة أثناء المعالج، ومنع التكرار والمنظومات غير المطلقة", async () => {
    const id = await business("add-rm", ["store"]);
    expect((await startLineTrial(db, id, "lounge", { available: ["store"] })).ok).toBe(false);
    expect((await startLineTrial(db, id, "lounge")).ok).toBe(true);
    expect(await startLineTrial(db, id, "lounge")).toEqual({ ok: false, error: expect.stringContaining("من قبل") });
    expect((await removeLineDuringOnboarding(db, id, "lounge")).ok).toBe(true);
    expect(await sub(id, "lounge")).toBeUndefined();
  });

  it("إنهاء المعالج يتطلب إعداد كل منظومة", async () => {
    const r = await createStoreForUser(db, { userId: await owner(), name: "fin", slug: "fin-gym", lines: ["gym"] });
    if (!r.ok) throw new Error(r.error);
    expect(await completeOnboarding(db, r.data.storeId)).toEqual({ ok: false, error: expect.stringContaining("رُكن فِت") });
    const setup = gymSetupSchema.parse({ sections: ["men", "women"], membershipTypes: [{ name: "شهر", months: 1, price: "100" }], trainers: ["سالم"] });
    expect(setup.membershipTypes[0]!.price).toBe(100_000);
    await saveLineSetup(db, r.data.storeId, "gym", { done: true, gym: setup });
    expect((await completeOnboarding(db, r.data.storeId)).ok).toBe(true);
    expect((await storeRow(r.data.storeId)).onboardedAt).not.toBeNull();
  });

  it("schemas المعالج القصير ترفض المدخلات الغلط برسائل عربية", () => {
    expect(marketSetupSchema.safeParse({ shopName: "ماركت", registers: 0, wholesale: false, scale: false }).error?.issues[0]?.message).toContain("كاشير");
    expect(loungeSetupSchema.safeParse({ stations: [{ type: "ps5", count: 0 }], hourlyPrice: "5" }).error?.issues[0]?.message).toContain("جهاز");
    expect(loungeSetupSchema.parse({ stations: [{ type: "ps5", count: 4 }, { type: "xbox", count: 0 }], hourlyPrice: "7.5" })).toEqual({ stations: [{ type: "ps5", count: 4 }], hourlyPrice: 7_500 });
    expect(gymSetupSchema.safeParse({ sections: [], membershipTypes: [] }).success).toBe(false);
  });
});

describe("الحدود: كل منظومة لحالها والموارد المشتركة الأوسع", () => {
  it("مميزات المتجر مقفولة لنشاط بدون متجر، والوحدات والموظفين من أوسع منظومة", () => {
    const l = combineLimits(null, [MARKET_BASIC, GYM_PRO], NO_STORE_LIMITS);
    expect(l.coupons).toBe(false);
    expect(l.allTemplates).toBe(false);
    expect(l.maxStaff).toBeNull(); // فِت احترافية: غير محدود
    expect(l.modules?.purchasing).toBe(true); // من ماركت
    expect(l.modules?.accounting).toBe(true); // من فِت
    const withStore = combineLimits(STARTER_LIMITS, [MARKET_BASIC], NO_STORE_LIMITS);
    expect(withStore.allTemplates).toBe(true);
    expect(withStore.maxStaff).toBe(2);
    expect(withStore.maxProducts).toBeNull();
  });
  it("الإضافات الجديدة تزيد حد منظومتها بس", () => {
    const a = (kind: "register" | "station_pack" | "member_pack" | "branch", units: number, quantity = 1) => ({ kind, units, quantity });
    const m = effectiveLimits(MARKET_BASIC, { addons: [a("register", 1, 2), a("branch", 1)] });
    expect(m).toMatchObject({ maxRegisters: 3, maxBranches: 2 });
    expect(m.maxStations).toBeUndefined();
    expect(effectiveLimits(GYM_PRO, { addons: [a("member_pack", 100)] }).maxMembers).toBeNull();
    expect(addonFitsLine("register", "market")).toBe(true);
    expect(addonFitsLine("register", "gym")).toBe(false);
    expect(addonFitsLine("staff", "lounge")).toBe(true);
    expect(addonFitsLine("custom_domain", "market")).toBe(false);
  });
  it("lineAccess وbusinessLimits من القاعدة", async () => {
    const id = await business("lim", ["store", "market"]);
    const a = await lineAccess(db, id, "market");
    expect(a.limits?.maxRegisters).toBe(3); // نمو
    expect((await lineAccess(db, id, "gym")).subscribed).toBe(false);
    const all = await loadLines(db, await storeRow(id));
    expect(businessLimits(all).coupons).toBe(true); // نمو المتجر
  });
});

describe("الأدمن: دفعات وتجربة وإيقاف لكل منظومة", () => {
  it("دفعة على ماركت: الباقة والإضافات لازم تكون من المنظومة، وتفعّلها بدون ما تمس المتجر", async () => {
    const id = await business("pay-m", ["store", "market"]);
    const reg = (await db.select().from(addons).where(eq(addons.slug, "extra-register")).get())!;
    const dom = (await db.select().from(addons).where(eq(addons.slug, "custom-domain")).get())!;
    const base = { storeId: id, line: "market", cycle: "monthly", amount: 280_000, method: "cash" };
    expect(await recordPayment(db, { ...base, planId: P.growth }, { id: adminId })).toEqual({ ok: false, error: expect.stringContaining("مش من باقات") });
    expect(await recordPayment(db, { ...base, planId: P["market-growth"], addons: [{ addonId: dom.id, quantity: 1 }] }, { id: adminId })).toEqual({ ok: false, error: expect.stringContaining("ما تنفعش") });
    const r = await recordPayment(db, { ...base, planId: P["market-growth"], addons: [{ addonId: reg.id, quantity: 2 }] }, { id: adminId });
    expect(r.ok).toBe(true);
    expect(await sub(id, "market")).toMatchObject({ status: "active", planId: P["market-growth"] });
    expect(await sub(id, "store")).toMatchObject({ status: "trial" });
    expect((await storeRow(id)).status).toBe("trial");
    expect(await db.select({ line: storeAddons.line, q: storeAddons.quantity }).from(storeAddons).where(eq(storeAddons.storeId, id))).toEqual([{ line: "market", q: 2 }]);
    expect((await lineAccess(db, id, "market")).limits?.maxRegisters).toBe(5);
    expect((await db.select().from(subscriptionPayments).where(eq(subscriptionPayments.storeId, id)).get())?.line).toBe("market");
  });

  it("دفعة على منظومة مش مشترك فيها تفتحها", async () => {
    const id = await business("pay-new", ["store"]);
    expect((await recordPayment(db, { storeId: id, line: "lounge", planId: P["lounge-basic"], cycle: "monthly", amount: 100_000, method: "cash" }, { id: adminId })).ok).toBe(true);
    expect(await sub(id, "lounge")).toMatchObject({ status: "active", setup: { done: true } });
  });

  it("تمديد تجربة منظومة، وتغيير باقتها من نفس المنظومة بس، وفتح تجربة من الأدمن", async () => {
    const id = await business("adm-l", ["gym"]);
    const before = (await sub(id, "gym"))!.trialEndsAt!.getTime();
    expect((await extendTrial(db, id, 5, { id: adminId }, Date.now(), "gym")).ok).toBe(true);
    expect((await sub(id, "gym"))!.trialEndsAt!.getTime()).toBe(before + 5 * DAY);
    expect((await extendTrial(db, id, 5, { id: adminId }, Date.now(), "market")).ok).toBe(false);
    expect((await changePlan(db, id, P["gym-pro"]!, { id: adminId })).ok).toBe(true);
    expect((await sub(id, "gym"))?.planId).toBe(P["gym-pro"]);
    expect((await changePlan(db, id, P["market-pro"]!, { id: adminId })).ok).toBe(false); // مش مشترك في ماركت
    expect((await adminStartTrial(db, id, "market", { id: adminId })).ok).toBe(true);
    expect(await sub(id, "market")).toMatchObject({ status: "trial" });
  });

  it("إيقاف النشاط كامل يوقف كل المنظومات، وإيقاف منظومة وحدة يخلي الباقي", async () => {
    const id = await business("susp", ["store", "lounge"]);
    expect((await setSuspended(db, id, true, { id: adminId }, null, Date.now(), "lounge")).ok).toBe(true);
    expect(await sub(id, "lounge")).toMatchObject({ status: "suspended" });
    expect(await sub(id, "store")).toMatchObject({ status: "trial" });
    expect((await setSuspended(db, id, true, { id: adminId }, "مخالفة")).ok).toBe(true);
    expect((await storeRow(id)).status).toBe("suspended");
    expect((await setSuspended(db, id, false, { id: adminId }, null)).ok).toBe(true);
    expect(await sub(id, "lounge")).toMatchObject({ status: "trial" });
    expect((await storeRow(id)).status).toBe("trial");
  });

  it("حزم الدمج تقترح خصم لما النشاط يجمع منظوماتها", async () => {
    expect((await saveBundle(db, { nameAr: "واحدة", lines: ["store"], discountPercent: 10 }, adminId)).ok).toBe(false);
    expect((await saveBundle(db, { nameAr: "ماركت + متجر", lines: ["market", "store"], discountPercent: 15 }, adminId)).ok).toBe(true);
    const b = [{ nameAr: "ماركت + متجر", lines: ["market", "store"] as ("market" | "store")[], discountPercent: 15, isActive: true }];
    expect(bundleFor(b, ["store", "market"], "market")?.discountPercent).toBe(15);
    expect(bundleFor(b, ["store"], "store")).toBeNull();
    expect(suggestedAmount({ prices: { m1: 250_000 } }, "monthly", [], 15)).toBe(212_500);
  });

  it("listStores وlistExpiring حسب المنظومة", async () => {
    const id = await business("flt-gym", ["gym"]);
    const ids = (await listStores(db, { line: "gym", pageSize: 100 })).items.map((i) => i.id);
    expect(ids).toContain(id);
    expect((await listStores(db, { line: "lounge", pageSize: 100 })).items.map((i) => i.id)).not.toContain(id);
    const row = (await listStores(db, { q: "flt-gym" })).items[0]!;
    expect(row.lines.map((l) => l.line)).toEqual(["gym"]);
    expect(row.state).toBe("trial");
    await db.update(lineSubscriptions).set({ trialEndsAt: new Date(Date.now() + 2 * DAY) }).where(eq(lineSubscriptions.storeId, id));
    const exp = await listExpiring(db, { line: "gym" });
    expect(exp.find((e) => e.id === id)).toMatchObject({ line: "gym", state: "trial" });
  });
});

describe("إعدادات المنظومات والباقات", () => {
  it("الإطلاق والتجربة قبل الإطلاق", async () => {
    expect((await lineLaunch(db)).market).toBe("soon");
    const cfg = await getLineConfig(db);
    expect(cfg.gym.trialDays).toBe(10);
    expect((await saveLineConfig(db, { ...cfg, market: { ...cfg.market, trialPlanSlug: "gym-basic" } }, adminId)).ok).toBe(false);
    expect((await saveLineConfig(db, { ...cfg, market: { ...cfg.market, launch: "live" } }, adminId)).ok).toBe(true);
    expect(availableLines(await lineLaunch(db))).toEqual(["store", "market"]);
    const id = await business("beta", ["store"]);
    expect((await setLineBeta(db, id, ["gym"], adminId)).ok).toBe(true);
    expect(availableLines(await lineLaunch(db), (await storeRow(id)).lineBeta)).toEqual(["store", "market", "gym"]);
    expect((await setLineBeta(db, id, ["store"], adminId)).ok).toBe(false);
  });

  it("باقة منظومة: الحدود الخاصة تنحفظ، والمجانية للمتجر بس، والأسعار العامة لكل منظومة لحالها", async () => {
    const limits = { maxStaff: 2, maxRegisters: 2, debtBook: true, wholesale: true };
    const r = await savePlan(db, { slug: "market-mini", line: "market", nameAr: "ميني", prices: { m1: 90_000, m3: null, m6: null, m12: null }, limits }, adminId);
    expect(r.ok).toBe(true);
    const row = (await db.select().from(plans).where(eq(plans.slug, "market-mini")).get())!;
    expect(row.line).toBe("market");
    expect(row.limits).toMatchObject({ maxRegisters: 2, debtBook: true, wholesale: true, coupons: false, maxProducts: null });
    expect(row.limits.maxStations).toBeUndefined();
    expect((await savePlan(db, { slug: "gym-free", line: "gym", nameAr: "مجاني", isFree: true, prices: { m1: 0, m3: null, m6: null, m12: null }, limits: { maxStaff: 1 } }, adminId)).ok).toBe(false);
    expect((await publicPlans(db, false)).every((p) => !p.slug.includes("-"))).toBe(true);
    expect((await publicPlans(db, false, "gym")).map((p) => p.slug)).toEqual(["gym-basic", "gym-growth", "gym-pro"]);
  });
});
