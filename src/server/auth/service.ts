import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { users } from "@/db/schema/platform";
import { loginSchema, registerSchema, firstError } from "@/lib/validation";
import { hashPassword, verifyPassword } from "./password";
import { hitRateLimit, resetRateLimit } from "../ratelimit";

export type AuthResult<T = { userId: string }> = { ok: true; data: T } | { ok: false; error: string };

const LOGIN_PHONE_LIMIT = { limit: 8, windowMs: 15 * 60_000 };
const LOGIN_IP_LIMIT = { limit: 40, windowMs: 15 * 60_000 };
const REGISTER_IP_LIMIT = { limit: 10, windowMs: 60 * 60_000 };

// hash وهمي علشان وقت الرد يبقى نفسه سواء الرقم موجود أو لا (منع تخمين الأرقام المسجلة)
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("dummy-password-for-timing"));

export async function registerUser(db: Db, input: unknown, ip: string | null): Promise<AuthResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const limit = await hitRateLimit(db, `register:ip:${ip ?? "unknown"}`, REGISTER_IP_LIMIT);
  if (!limit.allowed) return { ok: false, error: "محاولات كثيرة. استنى شوية وجرّب مرة ثانية." };

  const { name, phone, password } = parsed.data;
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).get();
  if (existing) return { ok: false, error: "هذا الرقم مسجّل من قبل. جرّب تسجل دخول." };

  const [created] = await db
    .insert(users)
    .values({ name, phone, passwordHash: await hashPassword(password) })
    .onConflictDoNothing({ target: users.phone })
    .returning({ id: users.id });
  if (!created) return { ok: false, error: "هذا الرقم مسجّل من قبل. جرّب تسجل دخول." };
  return { ok: true, data: { userId: created.id } };
}

export async function authenticate(db: Db, input: unknown, ip: string | null): Promise<AuthResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { phone, password } = parsed.data;

  const phoneKey = `login:phone:${phone}`;
  const [byPhone, byIp] = await Promise.all([
    hitRateLimit(db, phoneKey, LOGIN_PHONE_LIMIT),
    hitRateLimit(db, `login:ip:${ip ?? "unknown"}`, LOGIN_IP_LIMIT),
  ]);
  if (!byPhone.allowed || !byIp.allowed) {
    const wait = Math.ceil(Math.max(byPhone.allowed ? 0 : byPhone.retryAfterSeconds, byIp.allowed ? 0 : byIp.retryAfterSeconds) / 60);
    return { ok: false, error: `محاولات دخول كثيرة. جرّب بعد ${wait} دقيقة.` };
  }

  const user = await db.select().from(users).where(eq(users.phone, phone)).get();
  const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);
  if (!user || !valid) return { ok: false, error: "رقم الهاتف أو كلمة السر غلط." };
  if (user.status !== "active") return { ok: false, error: "حسابك موقوف. تواصل مع الدعم." };

  await resetRateLimit(db, phoneKey);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return { ok: true, data: { userId: user.id } };
}
