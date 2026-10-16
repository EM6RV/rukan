// متاجر تجريبية (براندات وهمية من تصميمنا) لتجربة القوالب الثلاثة: pnpm db:seed:demo
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { createDb } from "../src/db";
import { plans, stores, users } from "../src/db/schema/platform";
import { getEnv } from "../src/lib/env";
import { hashPassword } from "../src/server/auth/password";
import { saveCategory } from "../src/server/catalog/categories";
import { saveProduct } from "../src/server/catalog/products";
import { saveImage } from "../src/server/media";
import { listHomeSections, saveHomeSections } from "../src/server/content-service";
import { addStaff } from "../src/server/staff-service";
import { saveCourier } from "../src/server/orders/couriers";
import { createOrder } from "../src/server/orders/create";
import { changeOrderStatus, registerReturn } from "../src/server/orders/manage";
import { adapters } from "../src/server/storage";
import { completeOnboarding, createStoreForUser, saveBusinessType, saveDelivery, saveIdentity } from "../src/server/store-service";
import { saveContactSettings, savePaymentSettings } from "../src/server/settings-service";
import { forStore, t } from "../src/server/tenant";
import { cities } from "../src/db/schema/platform";

const env = getEnv();
const { db, client } = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);
const PASSWORD = "demo-password-123";

// صورة تجريدية بدون نص (SVG → PNG → نمرها على نفس خط معالجة الصور الحقيقي)
async function art(seed: number, base: string, accent: string, kind: "bottle" | "shirt" | "bag" | "ring" | "watch" | "box" = "box") {
  const r = (n: number) => ((Math.sin(seed * 9301 + n * 49297) + 1) / 2);
  const shapes: Record<string, string> = {
    bottle: `<rect x="390" y="330" width="220" height="520" rx="46" fill="${accent}"/><rect x="450" y="230" width="100" height="120" rx="18" fill="#222"/><rect x="415" y="470" width="170" height="200" rx="14" fill="#fff" opacity=".35"/>`,
    shirt: `<path d="M330 330 L430 290 Q500 340 570 290 L670 330 L760 470 L680 520 L650 470 L650 800 L350 800 L350 470 L320 520 L240 470 Z" fill="${accent}"/>`,
    bag: `<path d="M360 460 Q360 280 500 280 Q640 280 640 460" stroke="#222" stroke-width="30" fill="none"/><rect x="290" y="440" width="420" height="380" rx="36" fill="${accent}"/>`,
    ring: `<circle cx="500" cy="560" r="170" fill="none" stroke="${accent}" stroke-width="48"/><circle cx="500" cy="380" r="46" fill="${accent}"/>`,
    watch: `<rect x="440" y="180" width="120" height="180" fill="#333"/><rect x="440" y="740" width="120" height="180" fill="#333"/><circle cx="500" cy="550" r="190" fill="${accent}"/><circle cx="500" cy="550" r="150" fill="#fff" opacity=".9"/><path d="M500 550 L500 450 M500 550 L570 580" stroke="#222" stroke-width="12" stroke-linecap="round"/>`,
    box: `<rect x="300" y="380" width="400" height="400" rx="28" fill="${accent}"/><rect x="300" y="380" width="400" height="90" rx="28" fill="#000" opacity=".15"/>`,
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1250" viewBox="0 0 1000 1250">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${base}"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>
    <rect width="1000" height="1250" fill="url(#g)"/>
    <circle cx="${200 + r(1) * 600}" cy="${200 + r(2) * 300}" r="${120 + r(3) * 120}" fill="#fff" opacity=".25"/>
    <g transform="translate(0,90)">${shapes[kind]}</g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function ownerFor(phone: string, name: string) {
  const existing = await db.select().from(users).where(eq(users.phone, phone)).get();
  if (existing) return existing;
  const [u] = await db.insert(users).values({ phone, name, passwordHash: await hashPassword(PASSWORD) }).returning();
  return u!;
}

type ProductSpec = {
  name: string; price: number; compareAt?: number; cost?: number; cat: number; kind: Parameters<typeof art>[3]; hue: [string, string];
  description: string; featured?: boolean; images?: number;
  options?: { name: string; values: { v: string; color?: string }[] }[]; stock?: number; hidden?: boolean;
};

async function buildStore(spec: {
  phone: string; owner: string; slug: string; name: string; type: Parameters<typeof saveBusinessType>[2]; template: "elegant" | "bold" | "simple" | "warm" | "editorial" | "noir" | "pop" | "gallery";
  primary: string; accent: string; whatsapp: string; announcement: string; city: string; freeOver: number | null; bank?: boolean;
  categories: string[]; products: ProductSpec[]; coupon: { code: string; value: number };
}) {
  if (await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, spec.slug)).get()) { console.log(`- ${spec.slug}: موجود، تخطينا`); return; }
  const owner = await ownerFor(spec.phone, spec.owner);
  const created = await createStoreForUser(db, { userId: owner.id, name: spec.name, slug: spec.slug });
  if (!created.ok) throw new Error(created.error);
  const storeId = created.data.storeId;
  const scope = forStore(db, storeId);
  const growth = await db.select().from(plans).where(eq(plans.slug, "yearly")).get();
  const limits = growth!.limits;

  await saveBusinessType(db, storeId, spec.type, limits);
  const logo = await saveImage(db, adapters.turso, { storeId, buffer: await art(1, spec.primary, spec.accent, "ring"), preset: { maxDimension: 600, quality: 90 } });
  await saveIdentity(db, storeId, { template: spec.template, primaryColor: spec.primary, accentColor: spec.accent, logoMediaId: logo.id }, limits);
  const city = (await db.select().from(cities).where(eq(cities.nameAr, spec.city)).get())!;
  await saveDelivery(db, storeId, {
    cityId: city.id, feeInCity: 8_000, feeOther: 20_000, freeDeliveryOver: spec.freeOver, bankTransfer: !!spec.bank,
    bankName: spec.bank ? "مصرف الجمهورية" : null, accountNumber: spec.bank ? "0010-123456-789" : null, accountHolder: spec.bank ? spec.owner : null,
  });
  const must = <T extends { ok: boolean; error?: string }>(r: T, what: string) => { if (!r.ok) throw new Error(`${what}: ${(r as { error?: string }).error}`); return r; };
  must(await saveContactSettings(db, storeId, { whatsapp: spec.whatsapp, contactPhone: spec.whatsapp, instagram: spec.slug, address: `${spec.city}، ليبيا` }), "contact");
  if (spec.bank) must(await savePaymentSettings(db, storeId, { bankTransfer: true, bankName: "مصرف الجمهورية", accountNumber: "0010-123456-789", accountHolder: spec.owner, note: "اكتب رقم الطلبية في خانة الملاحظات" }), "payment");
  await scope.update(t.storeSettings, { announcementBar: spec.announcement, seoDescription: `${spec.name}: ${spec.announcement}` });

  const catIds: string[] = [];
  for (const c of spec.categories) {
    const r = await saveCategory(scope, { name: c });
    if (!r.ok) throw new Error(r.error);
    catIds.push(r.data.id);
  }

  let seed = 10;
  for (const p of spec.products) {
    const imgs: string[] = [];
    for (let i = 0; i < (p.images ?? 2); i++) {
      const im = await saveImage(db, adapters.turso, { storeId, buffer: await art(++seed, p.hue[i % 2]!, p.hue[(i + 1) % 2]!, p.kind) });
      imgs.push(im.id);
    }
    const options = (p.options ?? []).map((o, oi) => ({ id: `o${oi}`, name: o.name, values: o.values.map((v, vi) => ({ id: `o${oi}v${vi}`, value: v.v, colorHex: v.color ?? null })) }));
    const combos = options.reduce<string[][]>((acc, o) => acc.flatMap((c) => o.values.map((v) => [...c, v.id])), [[]]);
    const r = await saveProduct(scope, {
      name: p.name, description: p.description, price: p.price, compareAtPrice: p.compareAt ?? null, costPrice: p.cost ?? null,
      isFeatured: !!p.featured, isVisible: !p.hidden, categoryIds: [catIds[p.cat]!], imageMediaIds: imgs, options,
      variants: combos.map((valueIds, i) => ({ valueIds, stock: p.stock !== undefined ? p.stock : i % 5 === 3 ? 0 : 4 + ((i * 7) % 11) })),
    }, { limits });
    if (!r.ok) throw new Error(`${p.name}: ${r.error}`);
  }

  await scope.insert(t.coupons, { code: spec.coupon.code, type: "percent", value: spec.coupon.value, minOrder: 30_000 });
  await db.update(stores).set({ onboardedAt: null }).where(eq(stores.id, storeId)); // completeOnboarding يرجّعه
  const done = await completeOnboarding(db, storeId);
  if (!done.ok) throw new Error(done.error);

  // موظفين تجريبيين (نفس كلمة السر): موظف طلبيات ومندوب، وأقسام رئيسية فيها بانر ونص
  const tail = spec.phone.slice(3);
  must(await addStaff(db, storeId, owner.id, { name: "موظف الطلبيات", phone: `092${tail}`, password: PASSWORD, role: "orders_staff" }, limits), "staff");
  must(await addStaff(db, storeId, owner.id, { name: "مندوب المتجر", phone: `093${tail}`, password: PASSWORD, role: "courier" }, limits), "courier staff");
  const banner = await saveImage(db, adapters.turso, { storeId, buffer: await art(7, spec.primary, spec.accent, "box"), preset: { maxDimension: 1600, quality: 85 } });
  const sections = await listHomeSections(scope);
  must(await saveHomeSections(db, storeId, [
    ...sections.map((x) => ({ id: x.id, type: x.type, isVisible: x.isVisible, config: x.config })),
    { type: "banner", config: { imageMediaId: banner.id, title: spec.announcement, linkUrl: "/search" } },
    { type: "text", config: { title: `عن ${spec.name}`, body: "نختار منتجاتنا بعناية ونوصلها لباب بيتك في كل ليبيا. الدفع عند الاستلام." } },
  ]), "home sections");

  // طلبيات وهمية بحالات مختلفة
  const variants = await scope.from(t.productVariants);
  const people: [string, string][] = [["أحمد المصراتي", "0912000111"], ["مريم الزاوي", "0921000222"], ["سالم البرعصي", "0931000333"], ["فاطمة الورفلي", "0941000444"], ["يوسف التاجوري", "0951000555"]];
  const statuses = ["new", "new", "confirmed", "with_courier", "delivered", "delivered", "returned", "cancelled", "delivered", "with_courier"] as const;
  const couriers: string[] = [];
  for (const c of [{ name: "علي المندوب", kind: "person" as const, phone: "0913334444" }, { name: "شركة السريع للتوصيل", kind: "company" as const, phone: "0923334444" }]) {
    const r = await saveCourier(scope, c);
    if (r.ok) couriers.push(r.data.id);
  }
  for (let i = 0; i < statuses.length; i++) {
    const v = variants[(i * 3) % variants.length]!;
    const [name, phone] = people[i % people.length]!;
    const o = await createOrder(db, storeId, { items: [{ variantId: v.id, quantity: 1 + (i % 2) }], name, phone, cityId: city.id, address: "حي الأندلس، شارع الجمهورية", paymentMethod: "cod" });
    if (!o.ok) { console.log(`  ! طلبية ${i}: ${o.error}`); continue; }
    // نمر على نفس خدمات اللوحة علشان الكاش والمخزون والزبائن تتحدث صح
    const st = statuses[i]!;
    const go = (to: "confirmed" | "with_courier" | "delivered" | "cancelled", extra: { courierId?: string } = {}) =>
      changeOrderStatus(scope, { orderId: o.data.orderId, to, actorUserId: null, note: "بيانات تجريبية", ...extra });
    if (st === "cancelled") await go("cancelled");
    if (st !== "new" && st !== "cancelled") {
      await go("confirmed");
      if (st !== "confirmed") await go("with_courier", { courierId: couriers[i % couriers.length]! });
      if (st === "delivered") await go("delivered");
      if (st === "returned") await registerReturn(scope, { orderId: o.data.orderId, reason: "refused", reasonNote: "الزبون رفض الاستلام", shippingLoss: 10_000 }, null);
    }
  }
  console.log(`✓ ${spec.name}  →  /s/${spec.slug}   (دخول: ${spec.phone} / ${PASSWORD})`);
}

const L = (n: string, c?: string) => ({ v: n, color: c });

await buildStore({
  phone: "0910000011", owner: "نورة الفيتوري", slug: "nada-perfume", name: "عطور الندى", type: "perfume", template: "elegant",
  primary: "#2B1B3D", accent: "#C19E58", whatsapp: "0910000011", announcement: "توصيل مجاني للطلبيات فوق 150 د.ل ✨", city: "طرابلس", freeOver: 150_000, bank: true,
  categories: ["عود وبخور", "عطور رجالية", "عطور نسائية"], coupon: { code: "NADA10", value: 10 },
  products: [
    { name: "عود ملكي فاخر", price: 185_000, compareAt: 230_000, cost: 120_000, cat: 0, kind: "bottle", hue: ["#d9c2a0", "#7a4b1e"], featured: true, description: "عود كمبودي معتّق بدخانية ناعمة وثبات يدوم أكثر من 12 ساعة.\nيُرش على الملابس والشعر.", options: [{ name: "الحجم", values: [L("50 مل"), L("100 مل")] }] },
    { name: "بخور المساء", price: 45_000, cost: 22_000, cat: 0, kind: "box", hue: ["#c9a98a", "#4a2d17"], description: "بخور معطّر بالصندل والمسك، 12 قطعة في العلبة.", stock: 25 },
    { name: "مسك الرجال", price: 95_000, cost: 55_000, cat: 1, kind: "bottle", hue: ["#bfd1e0", "#1f3b57"], featured: true, description: "مسك أبيض بلمسة خشبية وحمضيات منعشة. مناسب للدوام والمناسبات.", options: [{ name: "الحجم", values: [L("50 مل"), L("100 مل")] }] },
    { name: "ليل الشرق", price: 120_000, compareAt: 150_000, cost: 70_000, cat: 1, kind: "bottle", hue: ["#c8b8d9", "#2b1b3d"], description: "عطر شرقي دافئ بالعنبر والفانيلا والعود.", stock: 9 },
    { name: "وردة الصباح", price: 88_000, cost: 48_000, cat: 2, kind: "bottle", hue: ["#f3cfd6", "#9b3a58"], featured: true, description: "عطر زهري ناعم بالورد الطائفي والفاوانيا.", options: [{ name: "الحجم", values: [L("30 مل"), L("50 مل"), L("100 مل")] }] },
    { name: "ياسمين الليل", price: 76_000, cost: 40_000, cat: 2, kind: "bottle", hue: ["#e4e9d6", "#556b2f"], description: "ياسمين أبيض مع لمسة مسك دافئة.", stock: 14 },
    { name: "طقم هدايا الندى", price: 210_000, compareAt: 260_000, cost: 130_000, cat: 2, kind: "box", hue: ["#e9d8c0", "#8a5a2b"], featured: true, description: "طقم يضم 3 عطور صغيرة في علبة هدية أنيقة.", stock: 6 },
    { name: "زيت عطري (مخفي)", price: 30_000, cat: 0, kind: "bottle", hue: ["#ddd", "#999"], description: "منتج مخفي للتجربة.", hidden: true, stock: 3 },
  ],
});

await buildStore({
  phone: "0910000012", owner: "محمد الشريف", slug: "street-218", name: "شارع 218", type: "clothing", template: "bold",
  primary: "#111111", accent: "#E4572E", whatsapp: "0910000012", announcement: "تشكيلة الصيف وصلت — خصم 20% بكود STREET20", city: "بنغازي", freeOver: 120_000, bank: false,
  categories: ["تيشرتات", "هوديز", "بناطيل"], coupon: { code: "STREET20", value: 20 },
  products: [
    { name: "تيشرت أوفرسايز أسود", price: 55_000, compareAt: 70_000, cost: 25_000, cat: 0, kind: "shirt", hue: ["#2a2a2a", "#e4572e"], featured: true, description: "قطن 100% بقصة واسعة وطباعة خلفية.", options: [{ name: "المقاس", values: [L("S"), L("M"), L("L"), L("XL")] }, { name: "اللون", values: [L("أسود", "#111111"), L("أبيض", "#ffffff")] }] },
    { name: "تيشرت ستريت", price: 48_000, cost: 22_000, cat: 0, kind: "shirt", hue: ["#e4572e", "#111"], description: "تيشرت بطبعة شبابية، خامة مريحة للصيف.", options: [{ name: "المقاس", values: [L("S"), L("M"), L("L")] }] },
    { name: "هودي شتوي", price: 135_000, compareAt: 165_000, cost: 70_000, cat: 1, kind: "shirt", hue: ["#555", "#e4572e"], featured: true, description: "هودي فليس سميك بجيب أمامي وغطاء رأس.", options: [{ name: "المقاس", values: [L("M"), L("L"), L("XL")] }, { name: "اللون", values: [L("رمادي", "#808080"), L("كحلي", "#1b2a49"), L("أسود", "#111111")] }] },
    { name: "هودي زِب", price: 150_000, cost: 80_000, cat: 1, kind: "shirt", hue: ["#1b2a49", "#f4a261"], description: "هودي بسحاب كامل وخامة قطنية ثقيلة.", options: [{ name: "المقاس", values: [L("M"), L("L"), L("XL")] }] },
    { name: "بنطلون كارجو", price: 98_000, cost: 50_000, cat: 2, kind: "box", hue: ["#6b705c", "#e4572e"], featured: true, description: "بنطلون كارجو بجيوب جانبية وقصة مريحة.", options: [{ name: "المقاس", values: [L("30"), L("32"), L("34"), L("36")] }] },
    { name: "جينز سكيني", price: 88_000, compareAt: 110_000, cost: 45_000, cat: 2, kind: "box", hue: ["#4a6fa5", "#111"], description: "جينز مرن بقصة ضيقة.", options: [{ name: "المقاس", values: [L("30"), L("32"), L("34")] }] },
  ],
});

await buildStore({
  phone: "0910000013", owner: "ليلى القذافي", slug: "lamsa", name: "لمسة", type: "accessories", template: "simple",
  primary: "#0D263E", accent: "#C19E58", whatsapp: "0910000013", announcement: "هدية مجانية مع كل طلبية فوق 80 د.ل 🎁", city: "مصراتة", freeOver: null, bank: true,
  categories: ["ساعات", "شنط", "خواتم وإكسسوارات"], coupon: { code: "LAMSA15", value: 15 },
  products: [
    { name: "ساعة كلاسيك ذهبية", price: 165_000, compareAt: 199_000, cost: 90_000, cat: 0, kind: "watch", hue: ["#e6dcc6", "#c19e58"], featured: true, description: "ساعة نسائية بسوار معدني وضد الرذاذ.", stock: 7 },
    { name: "ساعة رجالية جلد", price: 140_000, cost: 75_000, cat: 0, kind: "watch", hue: ["#d4d4d4", "#0d263e"], description: "ساعة رجالية بسوار جلد طبيعي.", stock: 5 },
    { name: "شنطة يد أنيقة", price: 120_000, cost: 60_000, cat: 1, kind: "bag", hue: ["#e9dcd0", "#8b5e3c"], featured: true, description: "شنطة يد جلد صناعي فاخر بمقصورتين.", options: [{ name: "اللون", values: [L("بني", "#8b5e3c"), L("أسود", "#111111"), L("بيج", "#d9c7a8")] }] },
    { name: "شنطة ظهر صغيرة", price: 75_000, compareAt: 95_000, cost: 38_000, cat: 1, kind: "bag", hue: ["#cfd8e3", "#0d263e"], description: "شنطة ظهر خفيفة للمشاوير اليومية.", stock: 12 },
    { name: "خاتم فضة 925", price: 58_000, cost: 28_000, cat: 2, kind: "ring", hue: ["#eef0f3", "#9aa5b1"], description: "خاتم فضة عيار 925 بتصميم عصري.", options: [{ name: "المقاس", values: [L("16"), L("17"), L("18"), L("19")] }] },
    { name: "سلسلة وقلادة", price: 64_000, cost: 30_000, cat: 2, kind: "ring", hue: ["#f2e6c8", "#c19e58"], featured: true, description: "سلسلة مطلية ذهب مع قلادة صغيرة.", stock: 20 },
  ],
});

console.log("\nتم. افتح /s/nada-perfume و /s/street-218 و /s/lamsa");
client.close();
