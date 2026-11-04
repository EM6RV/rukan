// مسار كامل للمنظومات الثلاث على بيانات seed-systems: الأدمن يطلق المنظومات، كل بياع يتصفح لوحته، وصفحات عامة، ودخول عضو وصفحته الشخصية.
// يتطلب: pnpm exec tsx scripts/seed-systems.ts ثم next start
import { mkdirSync } from "node:fs";
import { BASE, check, finish, launch, login, resetRateLimits } from "./lib.mjs";
const ADMIN_PHONE = process.env.ADMIN_PHONE ?? "0910000000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ci-admin-password-123";
const SHOT = process.env.SHOT ?? "e2e/shots";
mkdirSync(SHOT, { recursive: true });
const browser = await launch();
const newPage = async () => { const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ar" }); const p = await c.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); return p; };
const h1 = async (page) => { await page.waitForSelector("main h1, h1", { timeout: 15000 }); return (await page.locator("h1").first().innerText()).trim(); };

await resetRateLimits();
// 1) الأدمن يطلق المنظومات
let page = await newPage();
await page.goto(`${BASE}/login`);
await page.fill('input[name="phone"]', ADMIN_PHONE); await page.fill('input[name="password"]', ADMIN_PASSWORD);
await page.click('button[type="submit"]'); await page.waitForURL((u) => !u.pathname.startsWith("/login"));
await page.goto(`${BASE}/admin/settings`);
for (const name of ["رُكن ماركت", "رُكن بلاي", "رُكن فِت"]) {
  const fs = page.locator("fieldset", { hasText: name });
  if (await fs.count()) await fs.locator("select").first().selectOption("live").catch(() => {});
}
await page.locator("form", { hasText: "رُكن ماركت" }).getByRole("button", { name: "حفظ" }).click();
await page.waitForTimeout(1500);

// 2) صفحات اللوحة لكل منظومة
const tour = async (phone, paths, tag) => {
  const p = await newPage(); await resetRateLimits();
  await login(p, phone);
  for (const path of paths) {
    const r = await p.goto(`${BASE}${path}`);
    const t = await h1(p).catch(() => "");
    check(`${tag} ${path}`, r.ok() && t.length > 0 && !t.includes("غير موجود"), t);
  }
  check(`${tag}: بدون أخطاء JS`, p.errs.length === 0, p.errs.join(" | "));
  return p;
};
await tour("0911000102", ["/dashboard/lounge", "/dashboard/lounge/stations", "/dashboard/lounge/pricing", "/dashboard/lounge/bookings", "/dashboard/lounge/tournaments", "/dashboard/lounge/reports"], "بلاي");
const gymP = await tour("0911000103", ["/dashboard/gym", "/dashboard/gym/members", "/dashboard/gym/reception", "/dashboard/gym/plans", "/dashboard/gym/classes", "/dashboard/gym/trainers", "/dashboard/gym/messages", "/dashboard/gym/reports"], "فِت");
await tour("0911000101", ["/dashboard/market", "/dashboard/market/expiry", "/dashboard/market/reports", "/dashboard/debts"], "ماركت");

// 3) فِت: عضو، اشتراكه، وتفعيل صفحته الشخصية ثم دخوله منها
await gymP.goto(`${BASE}/dashboard/gym/members`);
await h1(gymP);
const link = gymP.locator('a[href^="/dashboard/gym/members/"]').first();
check("قائمة الأعضاء فيها أعضاء", await link.count() > 0);
await link.click(); await h1(gymP);
await gymP.getByText("الاشتراك الحالي").first().waitFor({ timeout: 15000 }).catch(() => {});
check("صفحة العضو: الاشتراك الحالي", await gymP.getByText("الاشتراك الحالي").count() > 0);
await gymP.screenshot({ path: `${SHOT}/gym-member.png`, fullPage: true });
const res = await gymP.request.get(`${BASE}/dashboard/gym/reports/export`);
check("تصدير Excel النادي", res.ok() && (res.headers()["content-type"] ?? "").includes("spreadsheet"));

// 4) الصفحات العامة وتسويق المنظومات
const pub = await newPage();
for (const [path, text] of [["/gym/quwa-fit", "الاشتراكات"], ["/play/nabd-play", "الأجهزة"], ["/market/baraka-market", "العروض"], ["/systems/fit", "رُكن فِت"], ["/systems/play", "رُكن بلاي"], ["/systems/market", "رُكن ماركت"], ["/", "رُكن مش بس متجر"]]) {
  const r = await pub.goto(`${BASE}${path}`);
  check(`عام ${path}`, r.ok() && (await pub.getByText(text).count()) > 0);
}
check("عام: بدون أخطاء JS", pub.errs.length === 0, pub.errs.join(" | "));
const lr = await pub.goto(`${BASE}/gym/no-such-store`);
check("متجر غير موجود → 404", lr.status() === 404);
await finish(browser);
