import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import type { Db } from "@/db";
import { phoneVerifications, users } from "@/db/schema/platform";
import { normalizeLibyanPhone } from "@/lib/phone";
import { fail, ok, type Result } from "../catalog/result";
import { hitRateLimit } from "../ratelimit";

export type Channel = "sms" | "whatsapp";
/** محوّل إرسال الكود. كل مزود يطبّق هذي الواجهة (ما نخترعش API لأي مزود: يتعبّى لما يكون عندنا اتفاق ومفاتيح). */
export interface CodeSender { channel: Channel | "console"; send(phone: string, code: string): Promise<void> }

const TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
export const hashCode = (phone: string, code: string) => createHash("sha256").update(`${phone}:${code}`).digest("hex");

/** الإرسال عن طريق console: للتجربة المحلية بس */
export const consoleSender: CodeSender = { channel: "console", async send(phone, code) { console.info(`[تحقق الهاتف] ${phone}: ${code}`); } };

/** محوّلات مجهزة وفاضية: تفشل بوضوح لو اتفعلت من غير ما يتعبّى مزود حقيقي */
export const smsSender: CodeSender = { channel: "sms", async send() { throw new Error("مزود SMS ما اتضبطش بعد (SMS_PROVIDER). عبّي المحوّل في src/server/auth/phone-verification.ts."); } };
export const whatsappSender: CodeSender = { channel: "whatsapp", async send() { throw new Error("مزود واتساب للأكواد ما اتضبطش بعد. عبّي المحوّل في src/server/auth/phone-verification.ts."); } };

/** المحوّل الفعّال من البيئة، أو null لو التحقق مطفي (الافتراضي) */
export function senderFor(channel: string | undefined): CodeSender | null {
  return channel === "sms" ? smsSender : channel === "whatsapp" ? whatsappSender : channel === "console" ? consoleSender : null;
}

/** التحقق مطلوب؟ لو مطفي، التسجيل يمشي بدون كود (الخطوة تتخطى بروحها) */
export const verificationRequired = (channel: string | undefined) => senderFor(channel) !== null;

/** يبعث كود من 6 أرقام (صالح 10 دقايق). حد: 3 أكواد في الساعة لكل رقم. */
export async function sendVerificationCode(db: Db, rawPhone: unknown, sender: CodeSender | null, now = Date.now()): Promise<Result<{ sent: boolean }>> {
  if (!sender) return ok({ sent: false }); // مطفي: ما فيش كود
  const phone = typeof rawPhone === "string" ? normalizeLibyanPhone(rawPhone) : null;
  if (!phone) return fail("اكتب رقم ليبي صحيح.");
  const rl = await hitRateLimit(db, `otp:${phone}`, { limit: 3, windowMs: 60 * 60_000 });
  if (!rl.allowed) return fail("طلبت أكواد كثيرة. جرّب بعد ساعة.");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(phoneVerifications).values({ phone, codeHash: hashCode(phone, code), channel: sender.channel === "console" ? "sms" : sender.channel, expiresAt: new Date(now + TTL_MS) });
  try { await sender.send(phone, code); } catch { return fail("ما قدرنا نبعث الكود. جرّب بعد شوية."); }
  return ok({ sent: true });
}

/** يتحقق من الكود (آخر كود للرقم، 5 محاولات، ويستعمل مرة وحدة) */
export async function checkVerificationCode(db: Db, rawPhone: unknown, rawCode: unknown, now = Date.now()): Promise<Result> {
  const phone = typeof rawPhone === "string" ? normalizeLibyanPhone(rawPhone) : null;
  const code = typeof rawCode === "string" ? rawCode.trim() : "";
  if (!phone || !/^\d{6}$/.test(code)) return fail("الكود 6 أرقام.");
  const row = await db.select().from(phoneVerifications)
    .where(and(eq(phoneVerifications.phone, phone), gt(phoneVerifications.expiresAt, new Date(now))))
    .orderBy(desc(phoneVerifications.createdAt)).get();
  if (!row || row.verifiedAt) return fail("الكود منتهي أو مش موجود. اطلب كود جديد.");
  if (row.attempts >= MAX_ATTEMPTS) return fail("محاولات كثيرة. اطلب كود جديد.");
  await db.update(phoneVerifications).set({ attempts: row.attempts + 1 }).where(eq(phoneVerifications.id, row.id));
  const a = Buffer.from(row.codeHash), b = Buffer.from(hashCode(phone, code));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return fail("الكود غلط.");
  await db.update(phoneVerifications).set({ verifiedAt: new Date(now) }).where(eq(phoneVerifications.id, row.id));
  await db.update(users).set({ phoneVerifiedAt: new Date(now) }).where(eq(users.phone, phone));
  return ok(undefined);
}

/** الرقم اتأكد بكود قبل التسجيل (آخر 30 دقيقة)؟ */
export async function isPhoneVerified(db: Db, rawPhone: string, now = Date.now()): Promise<boolean> {
  const phone = normalizeLibyanPhone(rawPhone);
  if (!phone) return false;
  const row = await db.select({ v: phoneVerifications.verifiedAt }).from(phoneVerifications)
    .where(and(eq(phoneVerifications.phone, phone), gt(phoneVerifications.expiresAt, new Date(now - 20 * 60_000)))).orderBy(desc(phoneVerifications.createdAt)).get();
  return !!row?.v;
}
