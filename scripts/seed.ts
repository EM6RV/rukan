import { eq } from "drizzle-orm";
import { createDb } from "../src/db";
import { cities, platformSettings, plans, storeMembers, stores, users } from "../src/db/schema/platform";
import { storeSettings } from "../src/db/schema/tenant";
import { getEnv, isDeployed } from "../src/lib/env";
import { LIBYA_CITIES } from "../src/lib/libya-cities";
import { DEFAULT_TRIAL_DAYS } from "../src/lib/constants";
import { hashPassword } from "../src/server/auth/password";
import { normalizeLibyanPhone } from "../src/lib/phone";

const env = getEnv();
const { db, client } = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);

// الباقات: ثلاث باقات، لكل وحدة مدة وحدة (شهرية، ست شهور، سنوية) وسعر واحد (بالدرهم: 250 د.ل = 250000)
const PLANS = [
  {
    slug: "monthly", nameAr: "شهرية", billingPeriod: "monthly" as const, price: 250_000, sortOrder: 1,
    descriptionAr: "نص المزايا: كل القوالب والكوبونات والتقارير",
    limits: { maxProducts: 200, maxStaff: 2, allTemplates: true, coupons: true, reports: true, customDomain: false, pixels: false, removeBranding: false },
  },
  {
    slug: "semiannual", nameAr: "ست شهور", billingPeriod: "semiannual" as const, price: 650_000, sortOrder: 2,
    descriptionAr: "أغلب المزايا مع Pixels للإعلانات",
    limits: { maxProducts: 1000, maxStaff: 5, allTemplates: true, coupons: true, reports: true, customDomain: false, pixels: true, removeBranding: false },
  },
  {
    slug: "yearly", nameAr: "سنوية", billingPeriod: "yearly" as const, price: 1_250_000, sortOrder: 3, isFeatured: true,
    descriptionAr: "فل مزايا: كل شي غير محدود، دومين خاص وPixels وبدون شعار رُكن",
    limits: { maxProducts: null, maxStaff: null, allTemplates: true, coupons: true, reports: true, customDomain: true, pixels: true, removeBranding: true, freeDesigns: 1 },
  },
];

for (const p of PLANS) {
  await db.insert(plans).values(p).onConflictDoNothing({ target: plans.slug });
}

for (const [i, c] of LIBYA_CITIES.entries()) {
  await db.insert(cities).values({ nameAr: c.name, region: c.region, sortOrder: i }).onConflictDoNothing({ target: cities.nameAr });
}

await db.insert(platformSettings).values({ key: "trial_days", value: DEFAULT_TRIAL_DAYS }).onConflictDoNothing();

if (env.ADMIN_PHONE && env.ADMIN_PASSWORD) {
  const phone = normalizeLibyanPhone(env.ADMIN_PHONE);
  if (!phone) throw new Error("ADMIN_PHONE مش رقم ليبي صحيح");
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).get();
  if (!existing) {
    if (isDeployed(env) && (env.ADMIN_PASSWORD.length < 12 || /غيّر|change|password|12345/i.test(env.ADMIN_PASSWORD))) {
      throw new Error("ADMIN_PASSWORD ضعيفة أو افتراضية. استعمل كلمة سر قوية (12 حرف على الأقل) قبل إنشاء الأدمن في الإنتاج.");
    }
    await db.insert(users).values({
      phone, name: env.ADMIN_NAME, passwordHash: await hashPassword(env.ADMIN_PASSWORD), platformRole: "admin",
    });
    console.log(`تم إنشاء حساب الأدمن: ${phone}`);
  }
} else {
  console.log("ADMIN_PHONE/ADMIN_PASSWORD مش موجودين، تخطينا إنشاء الأدمن.");
}

// متجر تجريبي بسيط لتجربة التوجيه (/s/demo و demo.localhost). المتاجر التجريبية الكاملة تجي مع المراحل 3 و4.
if (process.env.SEED_DEMO === "1") {
  const demoPhone = "0910000001";
  let demoUser = await db.select().from(users).where(eq(users.phone, demoPhone)).get();
  if (!demoUser) {
    [demoUser] = await db.insert(users).values({ phone: demoPhone, name: "بياع تجريبي", passwordHash: await hashPassword("demo-password-123") }).returning();
  }
  if (!(await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, "demo")).get())) {
    const growth = await db.select().from(plans).where(eq(plans.slug, "semiannual")).get();
    const [store] = await db.insert(stores).values({
      slug: "demo", name: "متجر تجريبي", ownerUserId: demoUser!.id, planId: growth?.id, template: "elegant",
      trialEndsAt: new Date(Date.now() + DEFAULT_TRIAL_DAYS * 86_400_000),
      onboardedAt: new Date(), onboardingStep: 6,
    }).returning();
    await db.insert(storeMembers).values({ storeId: store!.id, userId: demoUser!.id, role: "owner" });
    await db.insert(storeSettings).values({ storeId: store!.id });
    console.log(`تم إنشاء المتجر التجريبي demo (دخول: ${demoPhone} / demo-password-123)`);
  }
}

console.log("تم الـ seed ✓");
client.close();
