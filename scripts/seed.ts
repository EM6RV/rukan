import { eq } from "drizzle-orm";
import { createDb } from "../src/db";
import { cities, platformSettings, plans, storeMembers, stores, users } from "../src/db/schema/platform";
import { storeSettings } from "../src/db/schema/tenant";
import { getEnv } from "../src/lib/env";
import { LIBYA_CITIES } from "../src/lib/libya-cities";
import { DEFAULT_TRIAL_DAYS } from "../src/lib/constants";
import { hashPassword } from "../src/server/auth/password";
import { normalizeLibyanPhone } from "../src/lib/phone";

const env = getEnv();
const { db, client } = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);

// الباقات (الأسعار بالدرهم: 49 د.ل = 49000)
const PLANS = [
  {
    slug: "starter", nameAr: "بداية", priceMonthly: 49_000, priceYearly: 490_000, sortOrder: 1,
    descriptionAr: "للبداية: متجر بسيط برابط rukn.ly",
    limits: { maxProducts: 50, maxStaff: 1, allTemplates: false, coupons: false, reports: false, customDomain: false, pixels: false, removeBranding: false },
  },
  {
    slug: "growth", nameAr: "نمو", priceMonthly: 99_000, priceYearly: 990_000, sortOrder: 2,
    descriptionAr: "كل القوالب والكوبونات والتقارير",
    limits: { maxProducts: 500, maxStaff: 3, allTemplates: true, coupons: true, reports: true, customDomain: false, pixels: false, removeBranding: false },
  },
  {
    slug: "pro", nameAr: "احترافي", priceMonthly: 199_000, priceYearly: 1_990_000, sortOrder: 3,
    descriptionAr: "غير محدود، دومين خاص وPixels وبدون شعار رُكن",
    limits: { maxProducts: null, maxStaff: null, allTemplates: true, coupons: true, reports: true, customDomain: true, pixels: true, removeBranding: true },
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
    const growth = await db.select().from(plans).where(eq(plans.slug, "growth")).get();
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
