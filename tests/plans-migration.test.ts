import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createDb } from "@/db";
import { approxMonthly, periodLabel, periodUnit } from "@/lib/billing";

const MIGRATIONS = "./src/db/migrations";
const OLD = { starter: "p-starter", growth: "p-growth", pro: "p-pro" };

/** نسخة من الـ migrations لين 0004 بس (قبل نظام الباقات الجديد) */
function oldMigrations(dir: string) {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8"));
  const entries = journal.entries.filter((e: { tag: string }) => e.tag < "0005");
  mkdirSync(join(dir, "meta"), { recursive: true });
  for (const e of entries) cpSync(join(MIGRATIONS, `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
}

describe("ترحيل الباقات القديمة للثلاث الجديدة (migration 0005)", () => {
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

      await migrate(db, { migrationsFolder: MIGRATIONS });

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
  it("المدة والسعر التقريبي في الشهر", () => {
    expect(periodUnit("monthly")).toBe("شهر");
    expect(periodUnit("yearly")).toBe("سنة");
    expect(periodLabel("monthly")).toBe("شهرية");
    expect(periodLabel("yearly")).toBe("سنوية");
    expect(approxMonthly(500_000, "yearly")).toBe(42_000); // 41.67 ← 42 د.ل
    expect(approxMonthly(800_000, "yearly")).toBe(67_000); // 66.67 ← 67 د.ل
    expect(approxMonthly(100_000, "monthly")).toBeNull();
  });
});
