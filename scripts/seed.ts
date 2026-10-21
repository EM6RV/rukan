import { eq } from "drizzle-orm";
import { createDb } from "../src/db";
import { addons, cities, platformSettings, plans, storeMembers, stores, users } from "../src/db/schema/platform";
import { DEFAULT_ADDONS, DEFAULT_PLANS } from "../src/lib/plan-catalog";
import { storeSettings } from "../src/db/schema/tenant";
import { getEnv, isDeployed } from "../src/lib/env";
import { LIBYA_CITIES } from "../src/lib/libya-cities";
import { DEFAULT_TRIAL_DAYS, DEFAULT_TRIAL_PLAN_SLUG } from "../src/lib/constants";
import { hashPassword } from "../src/server/auth/password";
import { normalizeLibyanPhone } from "../src/lib/phone";

const env = getEnv();
const { db, client } = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);

// الباقات: بداية / نمو / احترافي (سعر لكل مدة) + المجانية المخفية. القيم من src/lib/plan-catalog.ts وتتعدل بعدين من الأدمن.
// onConflictDoNothing: ما نغطّوش على تعديلات الأدمن في قاعدة موجودة.
for (const p of DEFAULT_PLANS) {
  const base = p.prices.m1 ?? p.prices.m6 ?? 0; // الأعمدة القديمة (للتوافق بس)
  await db.insert(plans).values({ ...p, billingPeriod: "monthly", price: base }).onConflictDoNothing({ target: plans.slug });
}

// الإضافات الافتراضية (أسعار شهرية مبدئية تتعدل من الأدمن)
for (const a of DEFAULT_ADDONS) await db.insert(addons).values(a).onConflictDoNothing({ target: addons.slug });

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
    const growth = await db.select().from(plans).where(eq(plans.slug, DEFAULT_TRIAL_PLAN_SLUG)).get();
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
