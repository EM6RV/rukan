// صفحة المندوب (جوال): ملخص الكاش، أزرار اتصال وخريطة وواتساب، وتسجيل «تم التوصيل» بتأكيد. وبيان PWA.
import { BASE, check, db, finish, launch, login, resetRateLimits } from "./lib.mjs";

await resetRateLimits();
const c = db();
const store = (await c.execute("select id from stores where slug='nada-perfume'")).rows[0].id;
const courierUser = (await c.execute("select id from users where phone='0930000011'")).rows[0].id;
const courierRow = (await c.execute({ sql: "select id from couriers where store_id=? and user_id=?", args: [store, courierUser] })).rows[0].id;
// طلبية جديدة تتعيّن للمندوب ويستلمها
const target = (await c.execute({ sql: "select id, number, total, payment_method from orders where store_id=? and status in ('new','confirmed') limit 1", args: [store] })).rows[0];
await c.execute({ sql: "update orders set status='with_courier', courier_id=?, payment_method='cod', payment_status='pending' where id=?", args: [courierRow, target.id] });
await c.execute({ sql: "delete from courier_cash_entries where order_id=?", args: [target.id] });

const browser = await launch();
const ctx = await browser.newContext({ locale: "ar", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();

const mf = await ctx.request.get(`${BASE}/manifest.webmanifest`);
const manifest = await mf.json();
check("PWA: manifest بوضع standalone وRTL واختصار الطلبيات", manifest.display === "standalone" && manifest.dir === "rtl" && manifest.shortcuts?.[0]?.url === "/dashboard/orders" && manifest.icons.some((i) => i.purpose === "maskable"));

await login(page, "0930000011");
await page.goto(`${BASE}/dashboard`);
await page.waitForURL(/\/dashboard\/orders/);
check("المندوب يتحول لصفحة الطلبيات", true);
await page.waitForSelector("text=معاك الحين");
const body = await page.innerText("body");
check("ملخص: معاك الحين وكاش متوقع وكاش عندك", body.includes("معاك الحين") && body.includes("كاش متوقع") && body.includes("كاش عندك"));
check("بطاقة إشعارات طلبياته", body.includes("فعّل إشعارات طلبياتك"));

const card = page.locator("li", { hasText: `#${target.number}` }).first();
check("الطلبية المعيّنة ظاهرة مع «حصّل من الزبون»", (await card.count()) === 1 && (await card.innerText()).includes("حصّل من الزبون"));
check("زر اتصال tel:", (await card.locator('a[href^="tel:"]').count()) === 1);
check("زر الخريطة (Google Maps) بالعنوان", ((await card.locator('a:has-text("الخريطة")').getAttribute("href")) ?? "").startsWith("https://www.google.com/maps/search/?api=1&query="));
check("زر واتساب للزبون", ((await card.locator('a:has-text("واتساب")').getAttribute("href")) ?? "").startsWith("https://wa.me/218"));
const heights = await card.locator("a, button").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
check("أهداف اللمس في البطاقة ≥ 44px", heights.every((h) => h >= 44), heights.join(","));

await card.getByRole("button", { name: "تم التوصيل" }).click();
await page.waitForSelector("dialog[open]");
const msg = await page.innerText("dialog[open]");
check("تأكيد قبل التسجيل يذكر المبلغ", msg.includes("استلمت") && msg.includes("كاش عندك"));
await page.locator('dialog[open] button:has-text("تم التوصيل")').click();
await page.waitForSelector("dialog[open]", { state: "detached" });
await page.waitForTimeout(800);
const after = (await c.execute({ sql: "select status, payment_status from orders where id=?", args: [target.id] })).rows[0];
const cash = (await c.execute({ sql: "select count(*) n, sum(amount) a from courier_cash_entries where order_id=? and type='collected'", args: [target.id] })).rows[0];
check("الطلبية صارت «تم التوصيل» ومدفوعة", after.status === "delivered" && after.payment_status === "paid");
check("الكاش اتسجل على المندوب بالمبلغ الكامل", Number(cash.n) === 1 && Number(cash.a) === Number(target.total));
check("البطاقة ما عاد فيها زر التوصيل", (await page.locator("li", { hasText: `#${target.number}` }).first().getByRole("button", { name: "تم التوصيل" }).count()) === 0);
c.close();
await finish(browser);
