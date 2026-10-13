// إشعارات الطلبيات: service worker متاح، وبطاقة التفعيل تظهر للبياع (لما VAPID مفعّل)، وما تظهر للمندوب
import { BASE, check, finish, launch, login, resetRateLimits } from "./lib.mjs";

await resetRateLimits();
const browser = await launch();
const ctx = await browser.newContext({ locale: "ar" });
const page = await ctx.newPage();

const sw = await ctx.request.get(`${BASE}/sw.js`);
check("/sw.js يرجع جافاسكربت", sw.status() === 200 && /javascript/.test(sw.headers()["content-type"] ?? "") && (await sw.text()).includes("showNotification"));

await login(page);
await page.goto(`${BASE}/dashboard`);
await page.waitForSelector("text=فعّل إشعارات الطلبيات", { timeout: 8000 });
check("بطاقة «فعّل إشعارات الطلبيات» تظهر للبياع", true);
check("زر التفعيل موجود", (await page.locator('button:has-text("فعّل الإشعارات")').count()) === 1);

const courier = await (await browser.newContext({ locale: "ar" })).newPage();
await login(courier, "0930000011"); // مندوب المتجر (seed:demo)
await courier.goto(`${BASE}/dashboard/orders`);
await courier.waitForTimeout(800);
check("المندوب يشوف بطاقة إشعارات طلبياته (مش «الطلبيات الجديدة»)", (await courier.locator("text=فعّل إشعارات طلبياتك").count()) === 1 && (await courier.locator("text=فعّل إشعارات الطلبيات").count()) === 0);
await finish(browser);
