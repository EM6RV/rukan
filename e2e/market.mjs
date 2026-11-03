// رُكن ماركت: بيانات الصنف (كرتونة، باركود، موزون) → عرض → ملصقات → الكاشير (مسح الباركود والكرتونة والميزان، العرض،
// شاشة الزبون) → الصلاحية والإتلاف → اقتراح الشراء → الجرد بالمسح → التقارير وExcel. يشتغل بعد e2e/pos.mjs (الماركت مفعّل وفيه PIN).
import { BASE, check, db, finish, launch, login, resetRateLimits } from "./lib.mjs";

const SHOT = process.env.SHOT ?? "e2e/shots";
const ean = (body12) => { let s = 0; for (let i = 0; i < 12; i++) s += Number(body12[11 - i]) * (i % 2 === 0 ? 3 : 1); return `${body12}${(10 - (s % 10)) % 10}`; };
const PIECE = "6291041500213", CARTON = "16291041500210", SCALE = ean("200012301250"); // صنف 123 بوزن 1.250 كغ

await resetRateLimits();
{
  const c = db();
  await c.execute(`INSERT INTO platform_settings (key, value, updated_at) VALUES ('line_launch', '{"market":"live","lounge":"soon","gym":"soon"}', 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  // وحدة المشتريات لاقتراح الشراء
  await c.execute(`UPDATE stores SET enabled_modules = '["purchasing"]' WHERE slug = 'nada-perfume'`);
  c.close();
}
// صنفين عاديين (مش باقة، متغير واحد) بمخزون كافي
const picked = await (async () => {
  const c = db();
  const r = await c.execute(`SELECT p.id, p.name FROM products p JOIN stores s ON s.id = p.store_id WHERE s.slug = 'nada-perfume' AND p.kind = 'simple' AND p.deleted_at IS NULL
    AND (SELECT count(*) FROM product_variants v WHERE v.product_id = p.id) = 1 ORDER BY p.name LIMIT 2`);
  for (const row of r.rows) await c.execute({ sql: "UPDATE product_variants SET stock = 5000 WHERE product_id = ?", args: [row.id] });
  c.close();
  return r.rows.map((row) => ({ id: String(row.id), name: String(row.name) }));
})();
const [first, second] = picked;

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "ar" });
await ctx.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
const toast = async (text) => { for (let i = 0; i < 30; i++) { if ((await page.locator("body").innerText()).includes(text)) return true; await page.waitForTimeout(250); } return false; };
const main = () => page.locator("main").innerText();

await login(page);
await page.goto(`${BASE}/dashboard/lines`);
await page.waitForSelector("main h1", { timeout: 20000 });
const start = page.getByRole("button", { name: /ابدا تجربة مجانية/ }).first();
if (await start.count()) { await start.click(); await page.waitForURL(/\/dashboard\/market/); }

// ===== الرئيسية =====
await page.goto(`${BASE}/dashboard/market`);
await page.waitForSelector("h1:has-text('رُكن ماركت')");
check("رئيسية الماركت (مبيعات اليوم والبلاطات)", (await main()).includes("مبيعات اليوم") && (await main()).includes("اقتراح الشراء"));
await page.getByRole("button", { name: "أضف الأقسام" }).click();
check("أقسام البقالة الجاهزة", await toast("تمت إضافة الأقسام"));

// ===== بيانات الصنف =====
const firstName = first.name;
await page.goto(`${BASE}/dashboard/market/products/${first.id}`);
await page.waitForSelector("text=الوحدات");
await page.getByRole("button", { name: "وحدة" }).click();
await page.getByLabel("فيها (حبة)").fill("24");
await page.getByLabel("سعرها (د.ل)").fill("1000");
await page.getByRole("button", { name: "باركود", exact: true }).click();
await page.getByRole("button", { name: "باركود", exact: true }).click();
const codeInputs = page.getByLabel("الباركود", { exact: true });
await codeInputs.nth(0).fill(PIECE);
await codeInputs.nth(1).fill(CARTON);
await page.getByLabel("الوحدة").nth(1).selectOption({ label: "كرتونة" });
await page.getByLabel("الرف / المكان").fill("A1");
await page.getByLabel("ترتيبه في الأزرار السريعة").fill("1");
await page.getByRole("button", { name: "حفظ", exact: true }).click();
check("حفظ الكرتونة والباركودات", await toast("تم الحفظ"));
await page.screenshot({ path: `${SHOT}/market-product.png`, fullPage: true });

await page.goto(`${BASE}/dashboard/market/products/${second.id}`);
await page.waitForSelector("text=رقم الصنف في الميزان");
await page.getByLabel("يتباع").selectOption("weight");
await page.getByLabel("رقم الصنف في الميزان (PLU)").fill("123");
await page.getByRole("button", { name: "حفظ", exact: true }).click();
check("صنف موزون برقم ميزان", await toast("تم الحفظ"));

// ===== العرض =====
await page.goto(`${BASE}/dashboard/market/promotions`);
await page.getByRole("button", { name: "عرض جديد" }).click();
await page.getByLabel("اسم العرض").fill("الثانية بنص السعر");
await page.getByLabel("زيد صنف").fill(firstName);
await page.getByRole("button", { name: "زيد", exact: true }).click();
await page.getByRole("button", { name: "حفظ العرض" }).click();
check("إنشاء عرض «الحبة الثانية»", await toast("تم حفظ العرض") && (await main()).includes("شغّال"));

// ===== الملصقات =====
await page.goto(`${BASE}/dashboard/market/products`);
await page.getByLabel(`اختار ${firstName}`).check();
const href = await page.getByRole("link", { name: "اطبع الملصقات" }).getAttribute("href");
const labels = await ctx.newPage();
await labels.goto(`${BASE}${href}`);
check("ملصقات الرف بباركود SVG", (await labels.locator("svg[aria-label^='باركود']").count()) >= 1);
await labels.screenshot({ path: `${SHOT}/market-labels.png` });
await labels.close();

// ===== الكاشير =====
await page.goto(`${BASE}/dashboard/branches`);
await page.getByRole("button", { name: "فعّل الجهاز هذا ككاشير" }).first().click();
await page.getByLabel("اسم الجهاز").fill("كاشير الماركت");
await page.getByRole("button", { name: "تفعيل وفتح الكاشير" }).click();
await page.waitForURL(/\/pos/);
await page.waitForSelector("text=دخّل الـ PIN", { timeout: 15000 }).catch(() => {});
await page.getByRole("button", { name: /نادى|نورة/ }).first().click();
await page.keyboard.type("4821");
await page.waitForSelector("text=افتح وردية جديدة, text=ادفع (F4)", { timeout: 10000 }).catch(() => {});
if (await page.getByRole("button", { name: "فتح الوردية" }).count()) {
  await page.getByLabel("الرصيد الافتتاحي في الدرج (د.ل)").fill("0");
  await page.getByRole("button", { name: "فتح الوردية" }).click();
}
await page.waitForSelector("text=ادفع (F4)");
// شاشة الزبون في نافذة ثانية
const display = await ctx.newPage();
await display.goto(`${BASE}/pos/display`);
await display.waitForSelector("text=نورتنا");
await page.bringToFront();

const search = page.getByLabel("بحث أو باركود");
const scan = async (code) => { await search.fill(code); await search.press("Enter"); await page.waitForTimeout(300); };
await scan(PIECE); await scan(PIECE);
const cart = () => page.locator("section[aria-label='الفاتورة']").innerText();
check("مسح الباركود مرتين = حبتين بعرض الثانية", (await cart()).includes("عرض:") && (await cart()).includes("وفّرت من العروض"));
await scan(CARTON);
check("باركود الكرتونة يدخل الكرتونة", (await cart()).includes("كرتونة 24"));
await scan(SCALE);
check("باركود الميزان يدخل الوزن", (await cart()).includes("1.25 كغ"));
check("الأزرار السريعة", (await page.getByRole("tab", { name: /سريع/ }).count()) === 1);
{
  const c = db();
  const hasImage = Number((await c.execute({ sql: "SELECT count(*) AS n FROM product_images WHERE product_id = ?", args: [first.id] })).rows[0].n) > 0;
  c.close();
  await page.getByRole("tab", { name: /سريع/ }).click();
  const imgs = await page.locator("section[aria-label='المنتجات'] ul img").count();
  check("الأزرار السريعة بالصور", hasImage ? imgs >= 1 : imgs === 0, `صورة المنتج: ${hasImage}`);
  await page.screenshot({ path: `${SHOT}/market-quick.png` });
  await page.getByRole("tab", { name: "الكل" }).click();
}
let shown = false;
for (let i = 0; i < 20 && !shown; i++) { shown = (await display.locator("main").innerText()).includes("الإجمالي"); if (!shown) await page.waitForTimeout(250); }
check("شاشة الزبون تعرض الفاتورة", shown);
await display.screenshot({ path: `${SHOT}/market-display.png` });
await page.screenshot({ path: `${SHOT}/market-pos.png` });
await page.keyboard.press("F4");
await page.getByRole("button", { name: "تأكيد الدفع (Enter)" }).click();
await page.waitForSelector("text=تم البيع");
let thanks = false;
for (let i = 0; i < 40 && !thanks; i++) { thanks = (await display.locator("main").innerText()).includes("شكراً"); if (!thanks) await page.waitForTimeout(250); }
if (!thanks) console.log("display:", (await display.locator("main").innerText()).slice(0, 200));
check("شاشة الزبون بعد الدفع", thanks);
await page.getByRole("button", { name: "فاتورة جديدة (Enter)" }).click();
let synced = false;
for (let i = 0; i < 40 && !synced; i++) { const h = await page.locator("header").innerText(); synced = h.includes("متصل") && !h.includes("تتزامن"); if (!synced) await page.waitForTimeout(500); }
check("الفاتورة اتزامنت", synced);
await display.close();

// الفاتورة في اللوحة بدون مراجعة (العرض والكرتونة والموزون اتقبلوا)
await page.goto(`${BASE}/dashboard/sales`);
await page.waitForSelector("h1:has-text('فواتير الكاشير')");
await page.locator("main a[href^='/dashboard/sales/']").first().click();
await page.waitForSelector("text=الإجمالي");
const saleText = await main();
check("الفاتورة بدون «تحتاج مراجعة»", !saleText.includes("تحتاج مراجعة"), saleText.slice(0, 300));

// ===== الصلاحية والإتلاف =====
await page.goto(`${BASE}/dashboard/market/expiry`);
await page.waitForSelector("h1:has-text('الصلاحية والهالك')");
const soon = new Date(Date.now() + 5 * 86_400_000 + 7_200_000).toISOString().slice(0, 10);
const batchCard = page.locator("form", { hasText: "سجّل الدفعة" });
await batchCard.getByLabel("الصنف").fill(firstName);
await batchCard.getByLabel("تاريخ الانتهاء").fill(soon);
await batchCard.getByLabel("الكمية (بالحبة)").fill("3");
await batchCard.getByRole("button", { name: "سجّل الدفعة" }).click();
check("تسجيل دفعة بصلاحية", await toast("تم تسجيل الدفعة"));
await page.goto(`${BASE}/dashboard/market/expiry?days=7`);
await page.waitForSelector("h1:has-text('الصلاحية والهالك')");
check("قربت تخلص بخصم مقترح", (await main()).includes("خصم مقترح 30%"));
await page.locator("main li", { hasText: firstName }).getByRole("button", { name: "إتلاف" }).first().click();
await page.getByRole("dialog").getByLabel("الكمية").fill("1");
await page.getByRole("dialog").getByRole("button", { name: "إتلاف" }).click();
check("الإتلاف بتكلفته", await toast("تم تسجيل الإتلاف"));
await page.screenshot({ path: `${SHOT}/market-expiry.png`, fullPage: true });

// ===== اقتراح الشراء =====
await page.goto(`${BASE}/dashboard/market/purchase`);
await page.waitForSelector("h1:has-text('اقتراح الشراء')");
check("صفحة اقتراح الشراء", (await main()).includes("طلبات الشراء") && (await main()).includes("مستحقات الموردين"));

// ===== الجرد بالمسح =====
await page.goto(`${BASE}/dashboard/market/stocktake`);
await page.getByLabel("النطاق").selectOption("shelf");
await page.getByRole("button", { name: "ابدا الجرد" }).click();
await page.waitForURL(/\/dashboard\/market\/stocktake\/.+/);
await page.getByLabel("الباركود", { exact: true }).fill(CARTON);
await page.getByRole("button", { name: "عدّ", exact: true }).first().click();
let counted = false;
for (let i = 0; i < 20 && !counted; i++) { counted = (await main()).includes("المعدود 24"); if (!counted) await page.waitForTimeout(250); }
check("مسح الكرتونة في الجرد = 24", counted);
page.once("dialog", (d) => d.accept());
await page.getByRole("button", { name: "اعتمد الفروقات" }).click();
check("اعتماد الجرد", await toast("تم اعتماد الجرد"));

// ===== التقارير =====
await page.goto(`${BASE}/dashboard/market/reports`);
await page.waitForSelector("h1:has-text('تقارير الماركت')");
const rep = await main();
check("تقارير الماركت (الربح والكاشير والقسم)", rep.includes("الربح الإجمالي") && rep.includes("بالكاشير") && rep.includes("بالقسم"));
const xlsx = await page.request.get(`${BASE}/dashboard/market/reports/export`);
check("تصدير Excel", xlsx.status() === 200 && (xlsx.headers()["content-type"] ?? "").includes("spreadsheet"));
await page.screenshot({ path: `${SHOT}/market-reports.png`, fullPage: true });

// ===== إعدادات الميزان =====
await page.goto(`${BASE}/dashboard/pos-settings`);
check("إعدادات الميزان في الكاشير", (await page.getByLabel("بادئات باركود الميزان").count()) === 1);

check("ما فيش أخطاء جافاسكربت", errs.length === 0, errs.join(" | "));
await finish(browser);
