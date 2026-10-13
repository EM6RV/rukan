// فحص إمكانية الوصول (axe-core, WCAG 2.2 AA) على صفحات المنصة: جوال فاتح، ديسكتوب فاتح وداكن
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { BASE, check, db, finish, launch, login, resetRateLimits } from "./lib.mjs";

const axeSrc = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
await resetRateLimits();
const c = db();
const orderId = (await c.execute("select o.id from orders o join stores s on s.id=o.store_id where s.slug='nada-perfume' limit 1")).rows[0].id;
c.close();

const PUBLIC = ["/", "/login", "/register", "/forgot-password", "/s/nada-perfume", "/s/street-218", "/s/lamsa", "/s/nada-perfume/cart", "/s/nada-perfume/checkout", "/s/nada-perfume/track"];
const DASH = ["/dashboard", "/dashboard/orders", `/dashboard/orders/${orderId}`, "/dashboard/products", "/dashboard/products/new", "/dashboard/couriers", "/dashboard/customers", "/dashboard/returns", "/dashboard/coupons", "/dashboard/design", "/dashboard/content", "/dashboard/settings", "/dashboard/reports", "/dashboard/staff", "/dashboard/billing"];
const MODES = [
  ["جوال فاتح", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, false, true],
  ["ديسكتوب فاتح", { viewport: { width: 1280, height: 800 } }, false, true],
  ["ديسكتوب داكن", { viewport: { width: 1280, height: 800 } }, true, false],
];

const browser = await launch();
const failures = [];
for (const [tag, opts, dark, withPublic] of MODES) {
  const page = await (await browser.newContext({ ...opts, locale: "ar" })).newPage();
  const scan = async (url) => {
    await page.goto(BASE + url);
    await page.waitForTimeout(600);
    if (dark && url.startsWith("/dashboard")) {
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
      await page.waitForTimeout(600); // ننتظر انتهاء transitions الألوان قبل قياس التباين
    }
    await page.evaluate(axeSrc);
    const r = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] }, resultTypes: ["violations"] }));
    for (const v of r.violations) for (const n of v.nodes) failures.push(`${tag} ${url.replace(orderId, ":id")} ${v.id}: ${n.target.join(" ").slice(0, 90)}`);
  };
  if (withPublic) for (const u of PUBLIC) await scan(u);
  await login(page);
  for (const u of DASH) await scan(u);
}
check("axe: صفر مخالفات WCAG 2.2 AA", failures.length === 0, failures.slice(0, 10).join(" | "));
await finish(browser);
