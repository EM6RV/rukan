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
});

export type Env = z.infer<typeof schema>;

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
  cached = env;
  return env;
}
