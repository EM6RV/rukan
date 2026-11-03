// الكاشير: تفعيل الجهاز → PIN → وردية → بيع كاش بالباقي → بيع بدون نت + إعادة تحميل بدون نت → المزامنة → تقفيل الوردية
import { BASE, check, db, finish, launch, login, resetRateLimits } from "./lib.mjs";

await resetRateLimits();
// تجهيز: ماركت مطلق للتجربة، وصاحب «عطور الندى» يبدا تجربة ماركت
{
  const c = db();
  await c.execute(`INSERT INTO platform_settings (key, value, updated_at) VALUES ('line_launch', '{"market":"live","lounge":"soon","gym":"soon"}', 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  c.close();
}

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ar" });
await ctx.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));

await login(page);
await page.goto(`${BASE}/dashboard/lines`);
const start = page.getByRole("button", { name: /ابدا تجربة مجانية/ }).first();
if (await start.count()) { await start.click(); await page.waitForURL(/\/dashboard\/market/); }
check("الماركت مفعّل للنشاط", page.url().includes("/dashboard/market") || (await page.locator("main").innerText()).includes("رُكن ماركت"));

// PIN للمالك
await page.goto(`${BASE}/dashboard/staff`);
await page.locator("li", { hasText: "المالك" }).getByRole("button", { name: /PIN/ }).click();
await page.getByRole("dialog").getByRole("textbox").first().fill("4821");
await page.getByRole("dialog").getByRole("button", { name: "حفظ" }).click();
await page.waitForTimeout(800);

// تفعيل الجهاز
await page.goto(`${BASE}/dashboard/branches`);
await page.getByRole("button", { name: "فعّل الجهاز هذا ككاشير" }).first().click();
await page.getByLabel("اسم الجهاز").fill("تابلت الاختبار");
await page.getByRole("button", { name: "تفعيل وفتح الكاشير" }).click();
await page.waitForURL(/\/pos/);
await page.waitForSelector("text=دخّل الـ PIN", { timeout: 15000 }).catch(() => {});
// القفل: اختيار المالك والـ PIN
await page.getByRole("button", { name: /نادى|نورة/ }).first().click();
await page.keyboard.type("4821");
await page.waitForSelector("text=افتح وردية جديدة", { timeout: 10000 });
check("الدخول بالـ PIN", true);
await page.getByLabel("الرصيد الافتتاحي في الدرج (د.ل)").fill("50");
await page.getByRole("button", { name: "فتح الوردية" }).click();
await page.waitForSelector("text=ادفع (F4)");
await page.screenshot({ path: `${process.env.SHOT ?? "e2e/shots"}/pos-main.png` });

// بيع كاش بالباقي (بالكيبورد: F4 ثم Enter)
const firstProduct = page.locator("section[aria-label='المنتجات'] ul button").first();
const t0 = Date.now(); await firstProduct.click(); await page.waitForSelector("section[aria-label='الفاتورة'] li button[aria-label='زيد']");
check("الإضافة للسلة سريعة", Date.now() - t0 < 1500, `${Date.now() - t0}ms`);
await page.keyboard.press("F4");
await page.getByRole("dialog").getByLabel("المبلغ").first().fill("1000");
await page.getByRole("button", { name: "تأكيد الدفع (Enter)" }).click();
await page.waitForSelector("text=الباقي:");
check("الباقي للزبون ظهر", true);
check("الفاتورة انطبعت", (await page.evaluate(() => window.__printed)) >= 1);
await page.getByRole("button", { name: "فاتورة جديدة (Enter)" }).click();
await page.waitForTimeout(1500);
check("المزامنة أونلاين", (await page.locator("header").innerText()).includes("متصل"));

// الـ service worker يتحكم في الصفحة (للتشغيل بدون نت)
await page.reload(); await page.waitForSelector("text=ادفع (F4)"); await page.waitForTimeout(1000);
check("service worker مسجّل", await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));

// بدون نت: بيع ← المؤشر ← إعادة تحميل بدون نت
await ctx.setOffline(true);
await page.locator("section[aria-label='المنتجات'] ul button").nth(1).click();
await page.keyboard.press("F4");
await page.getByRole("button", { name: "تأكيد الدفع (Enter)" }).click();
await page.waitForSelector("text=تم البيع");
await page.getByRole("button", { name: "فاتورة جديدة (Enter)" }).click();
await page.waitForSelector("text=بدون نت");
check("مؤشر بدون نت + عملية تستنى", (await page.locator("header").innerText()).includes("تستنى المزامنة"));
await page.reload();
await page.waitForSelector("text=ادفع (F4)", { timeout: 15000 });
check("الكاشير يفتح بعد إعادة تحميل بدون نت", (await page.locator("header").innerText()).includes("بدون نت"));
await page.screenshot({ path: `${process.env.SHOT ?? "e2e/shots"}/pos-offline.png` });

// رجوع النت ← المزامنة
await ctx.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event("online")));
let synced = false;
for (let i = 0; i < 40 && !synced; i++) { const h = await page.locator("header").innerText(); synced = h.includes("متصل") && !h.includes("تتزامن"); if (!synced) await page.waitForTimeout(500); }
check("المزامنة بعد رجوع النت", synced);

// تقفيل الوردية
await page.getByRole("button", { name: "القائمة" }).click();
await page.getByRole("button", { name: "تقفيل الوردية" }).click();
await page.getByLabel("50 دينار").fill("1");
await page.getByRole("button", { name: "تقفيل وطباعة Z" }).click();
await page.waitForSelector("text=افتح وردية جديدة");
await page.waitForTimeout(1500);

// اللوحة: الفواتير والوردية
await page.goto(`${BASE}/dashboard/sales`);
await page.waitForSelector("h1:has-text('فواتير الكاشير')");
const salesText = await page.locator("main").innerText();
check("فواتير الكاشير في اللوحة (2)", (salesText.match(/#\d+/g) ?? []).length >= 2, salesText.slice(0, 200));
await page.goto(`${BASE}/dashboard/shifts`);
await page.waitForSelector("h1:has-text('الورديات')");
await page.screenshot({ path: `${process.env.SHOT ?? "e2e/shots"}/pos-shifts.png`, fullPage: true });
check("الوردية مقفولة بتقرير Z", (await page.locator("main").innerText()).includes("Z1"));
check("ما فيش أخطاء جافاسكربت", errs.length === 0, errs.join(" | "));
await finish(browser);
