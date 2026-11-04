// فحص الكيبورد: مؤشر التركيز ظاهر، رابط التخطي، النوافذ تحبس التركيز وترجّعه، وRTL بدون سكرول أفقي
import { BASE, check, finish, launch, login, resetRateLimits } from "./lib.mjs";

await resetRateLimits();
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ar" })).newPage();

async function tabAudit(url, max = 60) {
  await page.goto(BASE + url);
  await page.waitForTimeout(500);
  const bad = [];
  const seen = new Set();
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const e = document.activeElement;
      if (!e || e === document.body) return null;
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      return { key: e.tagName + Math.round(r.x) + "," + Math.round(r.y) + (e.textContent || "").slice(0, 12), label: (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 28), visible: (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none") };
    });
    if (!info) continue;
    if (seen.has(info.key)) break;
    seen.add(info.key);
    if (!info.visible) bad.push(info.label);
  }
  check(`Tab على ${url}: كل عنصر له مؤشر تركيز`, bad.length === 0 && seen.size > 0, `${seen.size} عنصر${bad.length ? " بدون مؤشر: " + bad.slice(0, 4).join(" | ") : ""}`);
}
for (const u of ["/", "/login", "/s/nada-perfume", "/s/nada-perfume/checkout"]) await tabAudit(u, 40);

await page.goto(`${BASE}/s/nada-perfume`);
await page.keyboard.press("Tab");
const skip = await page.evaluate(() => ({ text: document.activeElement.textContent.trim(), top: document.activeElement.getBoundingClientRect().top }));
check("أول Tab في المتجر = «انتقل للمحتوى» وظاهر", skip.text.includes("انتقل للمحتوى") && skip.top >= 0);

await login(page);
for (const u of ["/dashboard", "/dashboard/orders", "/dashboard/products", "/dashboard/couriers", "/dashboard/settings"]) await tabAudit(u);

// النافذة: التركيز يبقى داخلها، Escape يقفلها ويرجّع التركيز للزر
await page.goto(`${BASE}/dashboard/couriers`);
await page.waitForTimeout(500);
const trigger = page.locator('button:has-text("استلمت الفلوس")').first();
await trigger.focus();
await page.keyboard.press("Enter");
await page.waitForSelector("dialog[open]");
const count = await page.evaluate(() => document.querySelectorAll("dialog[open] :is(button,input,textarea,select,a[href])").length);
let inside = true;
for (let i = 0; i < count - 1; i++) { await page.keyboard.press("Tab"); inside = inside && (await page.evaluate(() => !!document.activeElement?.closest("dialog[open]"))); }
check("التركيز يبقى داخل النافذة", inside);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("Escape يقفل النافذة", (await page.locator("dialog[open]").count()) === 0);
check("التركيز يرجع للزر اللي فتحها", await page.evaluate(() => document.activeElement?.textContent?.includes("استلمت الفلوس") ?? false));

// الجوال: RTL وبدون سكرول أفقي، وأهداف اللمس
const mobile = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "ar" })).newPage();
await login(mobile);
for (const u of ["/", "/s/nada-perfume", "/dashboard", "/dashboard/orders", "/dashboard/products/new"]) {
  await mobile.goto(BASE + u);
  await mobile.waitForTimeout(400);
  const r = await mobile.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, over: document.documentElement.scrollWidth - innerWidth }));
  check(`RTL وبدون سكرول أفقي ${u}`, r.dir === "rtl" && r.lang === "ar" && r.over <= 1, JSON.stringify(r));
}
await finish(browser);
