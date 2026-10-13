// تدفق استرجاع كلمة السر كاملاً: البياع يطلب، الأدمن يصدر الرابط، البياع يعيّن كلمة جديدة ويدخل بها
import { BASE, check, finish, launch, resetRateLimits } from "./lib.mjs";

const ADMIN_PHONE = process.env.ADMIN_PHONE ?? "0910000000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ci-admin-password-123";
const SELLER = "0910000013"; // ليلى — لمسة (seed:demo)

await resetRateLimits();
const browser = await launch();
const seller = await (await browser.newContext({ locale: "ar" })).newPage();
const admin = await (await browser.newContext({ locale: "ar" })).newPage();

await seller.goto(`${BASE}/login`);
check("رابط «نسيت كلمة السر» في صفحة الدخول", (await seller.locator('a:has-text("نسيت كلمة السر")').count()) === 1);
await seller.goto(`${BASE}/forgot-password`);
await seller.fill('input[name="phone"]', SELLER);
await seller.click('button[type="submit"]');
await seller.waitForSelector("text=وصلنا طلبك");
check("رسالة «وصلنا طلبك» بعد الطلب", true);

await admin.goto(`${BASE}/login`);
await admin.fill('input[name="phone"]', ADMIN_PHONE);
await admin.fill('input[name="password"]', ADMIN_PASSWORD);
await admin.click('button[type="submit"]');
await admin.waitForURL((u) => !u.pathname.startsWith("/login"));
await admin.goto(`${BASE}/admin/password-resets`);
const card = admin.locator("li", { hasText: SELLER }).first();
check("الأدمن يشوف الطلب بانتظار الرابط", (await card.count()) === 1 && (await card.innerText()).includes("بانتظار الرابط"));
await card.locator('button:has-text("جهّز الرابط")').click();
await admin.waitForSelector("dialog[open]");
const url = (await admin.locator("dialog[open] p[dir=ltr]").innerText()).trim();
check("الرابط من نوع /reset-password/<token>", /\/reset-password\/[\w-]{40,}$/.test(url), url.slice(0, 60));
check("زر «ابعثه على واتساب» موجود", (await admin.locator('dialog[open] a:has-text("واتساب")').count()) === 1);

const link = new URL(url);
await seller.goto(`${BASE}${link.pathname}`);
await seller.waitForSelector('input[name="password"]');
await seller.fill('input[name="password"]', "kalimat-jadida-77");
await seller.fill('input[name="confirm"]', "mukhtalif-77");
await seller.click('button[type="submit"]');
await seller.waitForSelector("text=مش متطابقتين");
check("كلمتان مختلفتان: رسالة عربية", true);
await seller.fill('input[name="password"]', "kalimat-jadida-77");
await seller.fill('input[name="confirm"]', "kalimat-jadida-77");
await seller.click('button[type="submit"]');
await seller.waitForURL(/\/login\?reset=1/);
check("بعد التعيين: تحويل للدخول مع رسالة نجاح", (await seller.innerText("body")).includes("تم تغيير كلمة السر"));

await seller.fill('input[name="phone"]', SELLER);
await seller.fill('input[name="password"]', "kalimat-jadida-77");
await seller.click('button[type="submit"]');
await seller.waitForURL((u) => u.pathname.startsWith("/dashboard"));
check("الدخول بكلمة السر الجديدة يشتغل", true);

const again = await (await browser.newContext({ locale: "ar" })).newPage();
await again.goto(`${BASE}${link.pathname}`);
check("الرابط ما يشتغل مرتين", (await again.innerText("body")).includes("الرابط ما يشتغلش"));

// نرجّع كلمة السر الأصلية علشان باقي الاختبارات ما تتأثر
await seller.goto(`${BASE}/dashboard`);
await finish(browser);
