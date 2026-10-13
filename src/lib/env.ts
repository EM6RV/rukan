import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  ROOT_DOMAIN: z.string().min(1).default("localhost:3000"),
  DATABASE_URL: z.string().min(1).default("file:./data/dev.db"),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  STORAGE_DRIVER: z.enum(["turso", "r2"]).default("turso"),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),
  ADMIN_NAME: z.string().default("مدير رُكن"),
  ADMIN_PHONE: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  // خلف البروكسي: عدد البروكسيات الموثوقة (Render = 1). TRUST_CLOUDFLARE=1 لو Cloudflare قدام Render.
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(5).default(1),
  TRUST_CLOUDFLARE: z.enum(["1", "0"]).optional(),
  // هدف CNAME للدومينات الخاصة (مثلاً rukn-web.onrender.com). الافتراضي: cname.ROOT_DOMAIN
  CUSTOM_DOMAIN_TARGET: z.string().optional(),
  // إشعارات Web Push (اختيارية): نولّد المفاتيح بـ: pnpm push:keys. بدونها الإشعارات تتعطل بهدوء.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  // استثناءات الإنتاج المقصودة
  ALLOW_LOCAL_DB: z.enum(["1", "0"]).optional(),
  STRICT_PRODUCTION: z.enum(["1", "0"]).optional(),
});

export type Env = z.infer<typeof schema>;

/** الإنتاج الفعلي: على Render (RENDER=true) أو بتفعيل STRICT_PRODUCTION=1 */
export const isDeployed = (env: Pick<Env, "NODE_ENV" | "STRICT_PRODUCTION">, raw: Record<string, string | undefined> = process.env) =>
  env.NODE_ENV === "production" && (raw.RENDER === "true" || env.STRICT_PRODUCTION === "1");

/** مشاكل إعداد خطيرة في الإنتاج الفعلي (يوقف التشغيل برسالة واضحة بدل ما يشتغل غلط بصمت) */
export function productionProblems(env: Env, raw: Record<string, string | undefined> = process.env): string[] {
  if (!isDeployed(env, raw)) return [];
  const p: string[] = [];
  if (!env.APP_URL.startsWith("https://")) p.push("APP_URL لازم يبدأ بـ https:// في الإنتاج");
  if (/^(localhost|127\.|0\.0\.0\.0)/.test(env.ROOT_DOMAIN) || env.ROOT_DOMAIN.includes(":")) p.push("ROOT_DOMAIN لازم يكون دومين حقيقي بدون منفذ (مثال: rukn.ly)");
  if (env.DATABASE_URL.startsWith("file:") && env.ALLOW_LOCAL_DB !== "1") p.push("DATABASE_URL ملف محلي: قرص Render يتمسح مع كل نشر! استعمل Turso (libsql://…) أو ALLOW_LOCAL_DB=1 لو عندك قرص دائم");
  if (env.DATABASE_URL.startsWith("libsql://") && !env.DATABASE_AUTH_TOKEN) p.push("DATABASE_AUTH_TOKEN مطلوب مع قاعدة Turso");
  return p;
}

let cached: Env | undefined;

/** يقرا ويتحقق من متغيرات البيئة أول مرة بس. أي خطأ يوقف التطبيق برسالة واضحة. */
export function getEnv(): Env {
  if (cached) return cached;
  const empty = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ""),
  );
  const parsed = schema.safeParse(empty);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`متغيرات البيئة غير صحيحة:\n${issues}`);
  }
  const env = parsed.data;
  if (env.STORAGE_DRIVER === "r2") {
    const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"].filter(
      (k) => !env[k as keyof Env],
    );
    if (missing.length) throw new Error(`STORAGE_DRIVER=r2 يحتاج: ${missing.join(", ")}`);
  }
  const problems = productionProblems(env);
  if (problems.length) throw new Error(`إعدادات الإنتاج غير آمنة:\n${problems.map((x) => `- ${x}`).join("\n")}`);
  cached = env;
  return env;
}
