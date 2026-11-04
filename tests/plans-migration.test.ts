import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createDb } from "@/db";
import { addMonths, cycleMonths, daysText, monthlyEquivalent, offeredCycles, payOnceText, periodLabel, periodUnit, planPrice, savingsPercent } from "@/lib/billing";

const MIGRATIONS = "./src/db/migrations";
const OLD = { starter: "p-starter", growth: "p-growth", pro: "p-pro" };

/** نسخة من الـ migrations لين tag معين (افتراضياً 0004: قبل نظام الباقات الجديد) */
function oldMigrations(dir: string, upTo = "0004") {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8"));
  const entries = journal.entries.filter((e: { tag: string }) => e.tag.slice(0, 4) <= upTo);
  mkdirSync(join(dir, "meta"), { recursive: true });
  for (const e of entries) cpSync(join(MIGRATIONS, `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
}

describe("ترحيل الباقات القديمة للثلاث الجديدة (migrations 0005 و0006)", () => {
  it("ينقل المتاجر ويحافظ على تواريخ الاشتراك والدفعات والإعدادات", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rukn-mig-"));
    const old = join(dir, "old");
    oldMigrations(old);
    const { db, client } = createDb(`file:${join(dir, "m.db")}`);
    try {
      await client.execute("PRAGMA foreign_keys = ON");
      await migrate(db, { migrationsFolder: old });

      // بيانات قديمة: 3 باقات، متجر على كل واحدة (بدورات مختلفة)، دفعة، وإعدادات التجربة القديمة
      const lim = (o: object) => JSON.stringify({ maxProducts: 50, maxStaff: 1, allTemplates: false, coupons: false, reports: false, customDomain: false, pixels: false, removeBranding: false, ...o });
      const plan = (id: string, slug: string, name: string, m: number, y: number, order: number) =>
        client.execute({ sql: "INSERT INTO plans (id, slug, name_ar, price_monthly, price_yearly, limits, sort_order) VALUES (?,?,?,?,?,?,?)", args: [id, slug, name, m, y, lim({}), order] });
      await plan(OLD.starter, "starter", "بداية", 49_000, 490_000, 1);
      await plan(OLD.growth, "growth", "نمو", 99_000, 990_000, 2);
      await plan(OLD.pro, "pro", "احترافي", 199_000, 1_990_000, 3);
      await client.execute("INSERT INTO users (id, phone, name, password_hash, created_at) VALUES ('u1','0910000001','أ','x',1),('u2','0910000002','ب','x',1),('u3','0910000003','ج','x',1),('u4','0910000004','د','x',1)");
      const end = Date.UTC(2027, 2, 14);
      const store = (id: string, owner: string, plan: string | null, cycle: string, status: string, trialEnd: number | null, periodEnd: number | null) =>
        client.execute({ sql: "INSERT INTO stores (id, slug, name, owner_user_id, plan_id, billing_cycle, status, trial_ends_at, current_period_end, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,1)", args: [id, `s-${id}`, id, owner, plan, cycle, status, trialEnd, periodEnd] });
      await store("sa", "u1", OLD.starter, "monthly", "active", null, end);
      await store("sb", "u2", OLD.growth, "yearly", "active", null, end);
      await store("sc", "u3", OLD.pro, "monthly", "trial", end, null);
      await store("sd", "u4", null, "monthly", "trial", end, null); // بدون باقة
      await client.execute({ sql: "INSERT INTO subscription_payments (id, store_id, plan_id, billing_cycle, amount, method, period_start, period_end, recorded_by, created_at) VALUES ('pay1','sb',?,'yearly',990000,'cash',1,2,'u1',1)", args: [OLD.growth] });
      await client.execute("INSERT INTO platform_settings (key, value, updated_at) VALUES ('trial_days','14',1),('trial_plan_slug','\"growth\"',1)");

      // الخطوة 1 (0005): الباقات الثلاث الأولى (اقتصادية/سنوية/سنوية برو)
      const mid = join(dir, "mid");
      oldMigrations(mid, "0005");
      await migrate(db, { migrationsFolder: mid });
      const plans = (await client.execute("SELECT slug, billing_period AS period, price, is_featured AS featured, is_active AS active, limits FROM plans ORDER BY slug")).rows;
      const bySlug = Object.fromEntries(plans.map((p) => [String(p.slug), p]));
      expect(bySlug.economy).toMatchObject({ period: "monthly", price: 100_000, featured: 0, active: 1 });
      expect(bySlug.yearly).toMatchObject({ period: "yearly", price: 500_000, featured: 0, active: 1 });
      expect(bySlug["yearly-pro"]).toMatchObject({ period: "yearly", price: 800_000, featured: 1, active: 1 });
      expect(JSON.parse(String(bySlug.economy!.limits))).toMatchObject({ maxProducts: 50, maxStaff: 1, allTemplates: false, customDomain: false });
      expect(JSON.parse(String(bySlug.yearly!.limits))).toMatchObject({ maxProducts: 500, maxStaff: 3, allTemplates: true, coupons: true, reports: true, customDomain: false });
      expect(JSON.parse(String(bySlug["yearly-pro"]!.limits))).toMatchObject({ maxProducts: null, maxStaff: null, customDomain: true, pixels: true, removeBranding: true });
      // القديمة تنخبّى (مش تنحذف) وسعرها القديم محفوظ
      for (const s of ["starter", "growth", "pro"]) expect(bySlug[s]).toMatchObject({ active: 0 });
      expect(bySlug.growth).toMatchObject({ price: 99_000, period: "monthly" });
      // ما فيه أعمدة الأسعار القديمة
      const cols = (await client.execute("PRAGMA table_info(plans)")).rows.map((c) => String(c.name));
      expect(cols).not.toContain("price_monthly");
      expect(cols).not.toContain("price_yearly");

      // المتاجر انتقلت، وتواريخها وحالتها ما اتغيرت (ما يضيع أي اشتراك)
      const slugOf = async (storeId: string) => String((await client.execute({ sql: "SELECT p.slug FROM stores s LEFT JOIN plans p ON p.id = s.plan_id WHERE s.id = ?", args: [storeId] })).rows[0]?.slug ?? "");
      expect(await slugOf("sa")).toBe("economy");
      expect(await slugOf("sb")).toBe("yearly");
      expect(await slugOf("sc")).toBe("yearly-pro");
      expect(await slugOf("sd")).toBe(""); // بدون باقة يبقى بدون باقة
      const rows = (await client.execute("SELECT id, status, billing_cycle AS cycle, trial_ends_at AS trial, current_period_end AS pe FROM stores ORDER BY id")).rows;
      expect(rows.map((r) => ({ ...r }))).toEqual([
        { id: "sa", status: "active", cycle: "monthly", trial: null, pe: end },
        { id: "sb", status: "active", cycle: "yearly", trial: null, pe: end },
        { id: "sc", status: "trial", cycle: "monthly", trial: end, pe: null },
        { id: "sd", status: "trial", cycle: "monthly", trial: end, pe: null },
      ]);
      // سجل الدفعات يحتفظ باسم الباقة القديمة
      expect(String((await client.execute("SELECT p.slug FROM subscription_payments sp JOIN plans p ON p.id = sp.plan_id")).rows[0]!.slug)).toBe("growth");

      // إعدادات المنصة: باقة التجربة للمقابل الجديد، والتجربة 3 أيام
      const setting = async (k: string) => String((await client.execute({ sql: "SELECT value FROM platform_settings WHERE key = ?", args: [k] })).rows[0]!.value);
      expect(await setting("trial_days")).toBe("3");
      expect(await setting("trial_plan_slug")).toBe('"yearly"');

      // الخطوة 2 (0006): الباقات النهائية: شهرية 250 / ست شهور 650 / سنوية 1250 (فل مزايا)
      const six = join(dir, "six");
      oldMigrations(six, "0006");
      await migrate(db, { migrationsFolder: six });
      const finalPlans = (await client.execute("SELECT slug, name_ar AS name, billing_period AS period, price, is_featured AS featured, is_active AS active, sort_order AS ord, limits FROM plans WHERE is_active = 1 ORDER BY sort_order")).rows;
      expect(finalPlans.map((p) => ({ slug: p.slug, name: p.name, period: p.period, price: p.price, featured: p.featured }))).toEqual([
        { slug: "monthly", name: "شهرية", period: "monthly", price: 250_000, featured: 0 },
        { slug: "semiannual", name: "ست شهور", period: "semiannual", price: 650_000, featured: 0 },
        { slug: "yearly", name: "سنوية", period: "yearly", price: 1_250_000, featured: 1 },
      ]);
      const limOf = (i: number) => JSON.parse(String(finalPlans[i]!.limits));
      expect(limOf(0)).toEqual({ maxProducts: 200, maxStaff: 2, allTemplates: true, coupons: true, reports: true, customDomain: false, pixels: false, removeBranding: false }); // نص المزايا
      expect(limOf(1)).toMatchObject({ maxProducts: 1000, maxStaff: 5, pixels: true, customDomain: false, removeBranding: false });
      expect(limOf(2)).toEqual({ maxProducts: null, maxStaff: null, allTemplates: true, coupons: true, reports: true, customDomain: true, pixels: true, removeBranding: true }); // فل مزايا
      // المتاجر على نفس الباقات (بالتحويل)، وتواريخها ما اتغيرت
      expect(await slugOf("sa")).toBe("monthly");
      expect(await slugOf("sb")).toBe("semiannual");
      expect(await slugOf("sc")).toBe("yearly");
      expect(await slugOf("sd")).toBe("");
      const rows2 = (await client.execute("SELECT id, status, trial_ends_at AS trial, current_period_end AS pe FROM stores ORDER BY id")).rows.map((r) => ({ ...r }));
      expect(rows2).toEqual([
        { id: "sa", status: "active", trial: null, pe: end },
        { id: "sb", status: "active", trial: null, pe: end },
        { id: "sc", status: "trial", trial: end, pe: null },
        { id: "sd", status: "trial", trial: end, pe: null },
      ]);
      expect(await setting("trial_plan_slug")).toBe('"semiannual"');
      expect(await setting("trial_days")).toBe("3");
      // سجل الدفعات يحتفظ بباقته (القديمة المخبّاة growth)
      expect(String((await client.execute("SELECT p.slug FROM subscription_payments sp JOIN plans p ON p.id = sp.plan_id")).rows[0]!.slug)).toBe("growth");

      // الخطوة 3 (0007…0009): جدول طلبات التصميم + تصميم مجاني للسنوية بس
      const nine = join(dir, "nine");
      oldMigrations(nine, "0009");
      await migrate(db, { migrationsFolder: nine });
      const limits = Object.fromEntries((await client.execute("SELECT slug, limits FROM plans WHERE is_active = 1")).rows.map((r) => [String(r.slug), JSON.parse(String(r.limits))]));
      expect(limits.yearly.freeDesigns).toBe(1);
      expect(limits.semiannual.freeDesigns).toBeUndefined();
      expect(limits.monthly.freeDesigns).toBeUndefined();
      expect((await client.execute("SELECT COUNT(*) AS n FROM design_requests")).rows[0]!.n).toBe(0);

      // الخطوة 4 (0010): نظام المدد: بداية / نمو / احترافي + مجانية مخفية
      // قبلها: sa نشط على شهرية، sb نشط على ست شهور (مع دفعة)، sc تجريبي على سنوية
      const semi = String((await client.execute("SELECT id FROM plans WHERE slug='semiannual'")).rows[0]!.id);
      await client.execute({ sql: "INSERT INTO subscription_payments (id, store_id, plan_id, billing_cycle, amount, method, period_start, period_end, recorded_by, created_at) VALUES ('pay2','sb',?,'semiannual',650000,'cash',1,2,'u1',2)", args: [semi] });
      await client.execute({ sql: "UPDATE stores SET plan_id = ?, billing_cycle = 'semiannual' WHERE id = 'sb'", args: [semi] });
      await migrate(db, { migrationsFolder: MIGRATIONS });
      const p10 = (await client.execute("SELECT slug, name_ar AS name, prices, duration_perks AS perks, is_featured AS featured, is_free AS free, limits FROM plans WHERE is_active = 1 ORDER BY sort_order")).rows;
      expect(p10.map((p) => [p.slug, p.name, p.featured, p.free])).toEqual([["free", "مجانية", 0, 1], ["starter", "بداية", 0, 0], ["growth", "نمو", 1, 0], ["pro", "احترافي", 0, 0]]);
      const P = Object.fromEntries(p10.map((p) => [String(p.slug), { prices: JSON.parse(String(p.prices)), perks: JSON.parse(String(p.perks)), limits: JSON.parse(String(p.limits)) }]));
      expect(P.starter!.prices).toEqual({ m1: 120_000, m3: 330_000, m6: 620_000, m12: 1_150_000 });
      expect(P.growth!.prices).toEqual({ m1: 220_000, m3: 600_000, m6: 1_150_000, m12: 2_100_000 });
      expect(P.pro!.prices).toEqual({ m1: null, m3: null, m6: 1_900_000, m12: 3_400_000 });
      expect(P.pro!.perks).toEqual({ m12: { freeDesigns: 1, note: "ريل أو لوجو مجاناً" } });
      expect(P.starter!.limits).toMatchObject({ maxProducts: 100, maxStaff: 1, coupons: false, reports: false, removeBranding: false });
      expect(P.growth!.limits).toMatchObject({ maxProducts: null, maxStaff: 3, coupons: true, reports: true, abandonedCarts: true, removeBranding: true, customDomain: false });
      expect(P.pro!.limits).toMatchObject({ customDomain: true, pixels: true, modules: { warehouses: true, purchasing: true, accounting: true } });
      expect(P.free!.limits).toMatchObject({ maxProducts: 15, maxOrdersPerMonth: 30, maxStaff: 1, allTemplates: false, coupons: false, removeBranding: false });
      // المتاجر: شهرية ← نمو شهر، ست شهور ← نمو 6 شهور، سنوية ← احترافي. نفس التواريخ، ورسالة للمشتركين بس
      const st = (await client.execute("SELECT s.id, p.slug, s.billing_cycle AS cycle, s.plan_notice AS notice, s.status, s.current_period_end AS pe, s.trial_ends_at AS trial FROM stores s LEFT JOIN plans p ON p.id = s.plan_id ORDER BY s.id")).rows.map((r) => ({ ...r }));
      expect(st).toEqual([
        { id: "sa", slug: "growth", cycle: "monthly", notice: "monthly", status: "active", pe: end, trial: null },
        { id: "sb", slug: "growth", cycle: "semiannual", notice: "semiannual", status: "active", pe: end, trial: null },
        { id: "sc", slug: "pro", cycle: "monthly", notice: null, status: "trial", pe: null, trial: end },
        { id: "sd", slug: null, cycle: "monthly", notice: null, status: "trial", pe: null, trial: end },
      ]);
      // الدفعات: دفعة «ست شهور» تولي على «نمو»، والقديمة تبقى على باقتها المخبّاة
      const pays = (await client.execute("SELECT sp.id, p.slug, sp.amount FROM subscription_payments sp JOIN plans p ON p.id = sp.plan_id ORDER BY sp.id")).rows.map((r) => ({ ...r }));
      expect(pays).toEqual([{ id: "pay1", slug: "legacy-growth", amount: 990_000 }, { id: "pay2", slug: "growth", amount: 650_000 }]);
      expect(await setting("trial_plan_slug")).toBe('"growth"');
      // التشغيل مرة ثانية ما يغيّرش شي (الشروط على prices = '{}')
      await migrate(db, { migrationsFolder: MIGRATIONS });
      expect((await client.execute("SELECT COUNT(*) AS n FROM plans WHERE slug = 'free'")).rows[0]!.n).toBe(1);
    } finally {
      client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("قاعدة جديدة (بدون باقات قديمة): ما يزرع شي، والـ seed هو اللي يزرع", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rukn-mig-"));
    const { db, client } = createDb(`file:${join(dir, "f.db")}`);
    try {
      await migrate(db, { migrationsFolder: MIGRATIONS });
      expect((await client.execute("SELECT COUNT(*) AS n FROM plans")).rows[0]!.n).toBe(0);
    } finally { client.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it("إعدادات التجربة المخصصة ما تتغير", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rukn-mig-"));
    const old = join(dir, "old");
    oldMigrations(old);
    const { db, client } = createDb(`file:${join(dir, "c.db")}`);
    try {
      await migrate(db, { migrationsFolder: old });
      await client.execute({ sql: "INSERT INTO plans (id, slug, name_ar, price_monthly, price_yearly, limits) VALUES ('g','growth','نمو',1,1,'{}')" });
      await client.execute("INSERT INTO platform_settings (key, value, updated_at) VALUES ('trial_days','21',1)");
      await migrate(db, { migrationsFolder: MIGRATIONS });
      expect(String((await client.execute("SELECT value FROM platform_settings WHERE key='trial_days'")).rows[0]!.value)).toBe("21");
    } finally { client.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("أدوات عرض الباقات", () => {
  const growth = { prices: { m1: 220_000, m3: 600_000, m6: 1_150_000, m12: 2_100_000 } };
  const pro = { prices: { m1: null, m3: null, m6: 1_900_000, m12: 3_400_000 } };
  it("المدد والتسميات", () => {
    expect(["monthly", "quarterly", "semiannual", "yearly"].map((c) => periodUnit(c as never))).toEqual(["شهر", "3 شهور", "6 شهور", "سنة"]);
    expect(["monthly", "quarterly", "semiannual", "yearly"].map((c) => periodLabel(c as never))).toEqual(["شهري", "3 شهور", "6 شهور", "سنوي"]);
    expect([cycleMonths("monthly"), cycleMonths("quarterly"), cycleMonths("semiannual"), cycleMonths("yearly")]).toEqual([1, 3, 6, 12]);
    expect(payOnceText("yearly")).toBe("في السنة");
    expect(payOnceText("quarterly")).toBe("كل 3 شهور");
  });
  it("سعر المدة، والمدد المتاحة، ونسبة التوفير مقارنة بالشهري", () => {
    expect(planPrice(growth, "quarterly")).toBe(600_000);
    expect(planPrice(pro, "monthly")).toBeNull();
    expect(offeredCycles(pro)).toEqual(["semiannual", "yearly"]);
    expect(savingsPercent(growth, "monthly")).toBe(0);
    expect(savingsPercent(growth, "quarterly")).toBe(9); // 600 / 660
    expect(savingsPercent(growth, "semiannual")).toBe(13); // 1150 / 1320
    expect(savingsPercent(growth, "yearly")).toBe(20); // 2100 / 2640
    expect(savingsPercent(pro, "yearly")).toBe(0); // ما عندهاش سعر شهري
    expect(monthlyEquivalent(2_100_000, "yearly")).toBe(175_000);
    expect(monthlyEquivalent(1_900_000, "semiannual")).toBe(317_000);
  });
  it("تواريخ وأيام", () => {
    expect(new Date(addMonths(Date.UTC(2026, 7, 31), 6)).toISOString().slice(0, 10)).toBe("2027-02-28");
    expect(new Date(addMonths(Date.UTC(2026, 10, 30), 3)).toISOString().slice(0, 10)).toBe("2027-02-28");
    expect([1, 2, 3, 10, 14].map(daysText)).toEqual(["يوم", "يومين", "3 أيام", "10 أيام", "14 يوم"]);
  });
});
