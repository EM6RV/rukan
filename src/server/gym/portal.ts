// صفحة العضو الشخصية: دخول بالهاتف + كلمة سر يحددها الاستقبال. الجلسة توكن عشوائي (نخزن hash فقط) في كوكي httpOnly.
// عامة بالتصميم: كل شي محدود بعضو واحد وبمتجر واحد، وكل نقطة دخول عليها rate limit.
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { stores } from "@/db/schema/platform";
import { canUse } from "@/lib/entitlements";
import { normalizeLibyanPhone } from "@/lib/phone";
import { loadLines } from "../lines";
import { hitRateLimit } from "../ratelimit";
import { verifyPassword } from "../auth/password";
import { fail, ok, type Result } from "../catalog/result";
import { forStore, t, type StoreScope } from "../tenant";
import { bookClass, cancelClassBooking, memberDetail, upcomingClasses } from "./service";

const DAY = 86_400_000, TTL = 30 * DAY;
const DUMMY_HASH = "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const portalCookie = (slug: string) => `rukn_gm_${slug}`.replace(/[^a-zA-Z0-9_-]/g, "_");

/** المتجر + سكوبه لو الصفحة الشخصية متاحة في باقته، وإلا null */
export async function portalStore(db: Db, key: string): Promise<{ store: typeof stores.$inferSelect; scope: StoreScope } | null> {
  const [store] = await db.select().from(stores).where(eq(stores.slug, key.toLowerCase())).limit(1);
  if (!store || !store.onboardedAt) return null;
  const g = (await loadLines(db, store)).gym;
  if (!g.subscribed || g.state === "suspended" || g.state === "expired" || !canUse(g.limits ?? {}, "memberPortal")) return null;
  return { store, scope: forStore(db, store.id) };
}

export async function portalLogin(db: Db, key: string, phoneRaw: string, password: string, ip: string, now = Date.now()): Promise<Result<{ cookie: string; exp: number }>> {
  const s = await portalStore(db, key);
  if (!s) return fail("الصفحة الشخصية مش متاحة.");
  const phone = normalizeLibyanPhone(String(phoneRaw ?? ""));
  if (!phone || typeof password !== "string" || password.length > 64) return fail("الرقم أو كلمة السر غلط.");
  const [byIp, byPhone] = await Promise.all([hitRateLimit(db, `gym-portal:ip:${s.store.id}:${ip}`, { limit: 20, windowMs: 10 * 60_000 }), hitRateLimit(db, `gym-portal:ph:${s.store.id}:${phone}`, { limit: 8, windowMs: 10 * 60_000 })]);
  if (!byIp.allowed || !byPhone.allowed) return fail("محاولات كثيرة. جرّب بعد شوية.");
  const [m] = await s.scope.from(t.gymMembers, eq(t.gymMembers.phone, phone)).limit(1);
  // نفس المسار الزمني حتى لو العضو مش موجود (ما نكشفش الأرقام المسجلة)
  let good = false;
  if (m?.portalHash && m.status === "active") good = await verifyPassword(m.portalHash, password);
  else await verifyPassword(DUMMY_HASH, password).catch(() => false);
  if (!good || !m) return fail("الرقم أو كلمة السر غلط.");
  const token = randomBytes(24).toString("base64url"), exp = now + TTL;
  const keep = m.portalSessions.filter((x) => x.exp > now).slice(-4);
  await s.scope.update(t.gymMembers, { portalSessions: [...keep, { h: sha(token), exp }] }, eq(t.gymMembers.id, m.id));
  return ok({ cookie: `${m.id}.${token}`, exp });
}

export async function portalMember(scope: StoreScope, cookie: string | undefined, now = Date.now()) {
  if (!cookie || cookie.length > 120) return null;
  const [id, token] = cookie.split(".");
  if (!id || !token) return null;
  const [m] = await scope.from(t.gymMembers, eq(t.gymMembers.id, id)).limit(1);
  const h = sha(token);
  return m && m.status === "active" && m.portalSessions.some((x) => x.h === h && x.exp > now) ? m : null;
}

export async function portalLogout(scope: StoreScope, cookie: string | undefined) {
  const m = await portalMember(scope, cookie);
  if (!m) return;
  const h = sha(cookie!.split(".")[1]!);
  await scope.update(t.gymMembers, { portalSessions: m.portalSessions.filter((x) => x.h !== h) }, eq(t.gymMembers.id, m.id));
}

/** ما يطلع للعضو إلا بياناته (بدون ملاحظات داخلية) */
export async function portalView(scope: StoreScope, memberId: string, now = Date.now()) {
  // now يرجع مع النتيجة (الصفحة ما تنادي Date.now في الريندر)
  const d = await memberDetail(scope, memberId, now);
  if (!d) return null;
  const [classes, bookings] = await Promise.all([upcomingClasses(scope, now, 2), scope.from(t.gymClassBookings, eq(t.gymClassBookings.memberId, memberId))]);
  const mine = bookings.filter((b) => b.status === "booked" || b.status === "waitlist");
  return {
    now, name: d.member.name, qrToken: d.member.qrToken, current: d.current,
    installments: d.installments.filter((i) => i.amount > 0).map((i) => ({ amount: i.amount, dueAt: i.dueAt.getTime(), paidAt: i.paidAt?.getTime() ?? null })),
    checkins: d.checkins.filter((c) => c.result === "ok").slice(0, 20).map((c) => c.at.getTime()),
    measurements: d.measurements.map((x) => ({ at: x.at.getTime(), weightG: x.weightG, fatPct10: x.fatPct10 })),
    programs: d.programs.map((p) => ({ title: p.title, content: p.content, kind: p.kind })),
    classes: classes.slice(0, 20).map((c) => ({ id: c.id, name: c.name, day: c.day, at: c.at, left: c.capacity - c.booked, booking: mine.find((b) => b.classId === c.id && b.day === c.day)?.id ?? null })),
  };
}

export async function portalBook(scope: StoreScope, memberId: string, classId: string, day: string) { return bookClass(scope, String(classId), memberId, String(day)); }
export async function portalCancel(scope: StoreScope, memberId: string, bookingId: string) {
  const [b] = await scope.from(t.gymClassBookings, eq(t.gymClassBookings.id, bookingId)).limit(1);
  return b && b.memberId === memberId ? cancelClassBooking(scope, bookingId) : fail("الحجز مش لك.");
}
