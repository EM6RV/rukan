// السلة المتروكة: الزبون يكتب رقمه ويسيب، البياع يشوفها ويذكّره، والطلب يقفلها
import { BASE, check, db, finish, launch, login, resetRateLimits } from "./lib.mjs";

const PHONE = "0912888777";
await resetRateLimits();
const c = db();
await c.execute({ sql: "delete from abandoned_carts where phone = ?", args: [PHONE] });

const browser = await launch();
const customer = await (await browser.newContext({ locale: "ar", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
await customer.goto(`${BASE}/s/nada-perfume`);
const href = await customer.locator('a[href*="/product/"]').first().getAttribute("href");
await customer.goto(`${BASE}${href}`);
await customer.getByRole("button", { name: "أضف للسلة" }).first().click();
await customer.waitForTimeout(600);
await customer.goto(`${BASE}/s/nada-perfume/checkout`);
await customer.waitForSelector("text=بيانات التوصيل");
check("تنبيه الخصوصية ظاهر تحت الهاتف", (await customer.innerText("body")).includes("ممكن المتجر يتواصل معاك على واتساب"));
await customer.getByLabel("الاسم", { exact: true }).fill("سالم التجريبي");
await customer.getByLabel("رقم الهاتف").fill(PHONE);
await customer.getByLabel("رقم الهاتف").blur();
let row;
for (let i = 0; i < 20 && !row; i++) { await customer.waitForTimeout(300); row = (await c.execute({ sql: "select * from abandoned_carts where phone = ?", args: [PHONE] })).rows[0]; }
check("السلة انحفظت بعد ما كتب الرقم", !!row && row.name === "سالم التجريبي" && Number(row.item_count) >= 1);

// نخلي السلة «خاملة» 40 دقيقة
await c.execute({ sql: "update abandoned_carts set last_activity_at = ? where phone = ?", args: [Date.now() - 40 * 60_000, PHONE] });

const owner = await (await browser.newContext({ locale: "ar", viewport: { width: 1280, height: 800 } })).newPage();
await login(owner);
await owner.goto(`${BASE}/dashboard/abandoned-carts`);
const card = owner.locator("li", { hasText: PHONE }).first();
await card.waitFor({ timeout: 8000 });
check("البياع يشوف السلة المتروكة باسم الزبون", (await card.innerText()).includes("سالم التجريبي"));
const wa = await card.locator('a:has-text("ذكّره على واتساب")').getAttribute("href");
check("رابط واتساب للزبون برسالة فيها اسم المتجر والرابط", !!wa && wa.startsWith("https://wa.me/218912888777") && decodeURIComponent(wa).includes("عطور الندى") && decodeURIComponent(wa).includes("/cart"), wa?.slice(0, 80));
await card.locator('a:has-text("ذكّره على واتساب")').evaluate((a) => a.removeAttribute("target")); // علشان ما يفتح تبويب خارجي
await owner.route("https://wa.me/**", (r) => r.fulfill({ status: 200, body: "ok" }));
await card.locator('a:has-text("ذكّره على واتساب")').click();
await owner.waitForTimeout(800);
await owner.goto(`${BASE}/dashboard/abandoned-carts`);
check("بعد الضغط: علامة «تم التذكير»", (await owner.locator("li", { hasText: PHONE }).first().innerText()).includes("تم التذكير"));

// الزبون يكمل الطلب: السلة تنقفل
await customer.getByLabel("المنطقة / العنوان").fill("حي الأندلس، شارع الجمهورية");
const city = customer.locator("#co-city");
if (!(await city.inputValue())) await city.selectOption({ index: 1 });
await customer.getByRole("button", { name: "أكّد الطلب" }).click();
await customer.waitForURL(/\/order\//, { timeout: 15000 });
await owner.goto(`${BASE}/dashboard/abandoned-carts`);
check("بعد الطلب: السلة اختفت من القائمة", (await owner.locator("li", { hasText: PHONE }).count()) === 0);
c.close();
await finish(browser);
