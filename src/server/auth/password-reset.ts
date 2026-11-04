import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, isNotNull, or } from "drizzle-orm";
import type { Db } from "@/db";
import { passwordResetRequests, stores, users } from "@/db/schema/platform";
import { phoneSchema, firstError, passwordSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { fail, ok, type Result } from "../catalog/result";
import { hitRateLimit } from "../ratelimit";
import { hashPassword } from "./password";
import { destroyAllUserSessions, hashToken } from "./session";

/** رابط الاسترجاع صالح ساعة، ولمرة وحدة */
export const RESET_TTL_MS = 60 * 60_000;
/** ما نكرر طلب لنفس المستخدم لو عنده طلب مفتوح بآخر 15 دقيقة (منع الإزعاج) */
const DUPLICATE_WINDOW_MS = 15 * 60_000;

const REQUEST_IP_LIMIT = { limit: 5, windowMs: 60 * 60_000 };
const REQUEST_PHONE_LIMIT = { limit: 3, windowMs: 60 * 60_000 };
const COMPLETE_IP_LIMIT = { limit: 20, windowMs: 15 * 60_000 };

/**
 * طلب استرجاع من صفحة «نسيت كلمة السر». الرد دايماً نفسه سواء الرقم مسجل أو لا
 * (علشان ما نكشفش الأرقام المسجلة). حسابات الأدمن والموقوفة ما تنفتح لها طلبات.
 */
export async function requestPasswordReset(db: Db, input: unknown, ip: string | null): Promise<Result<{ phone: string }>> {
  const parsed = phoneSchema.safeParse((input as { phone?: unknown } | null)?.phone);
  if (!parsed.success) return fail(firstError(parsed.error));
  const phone = parsed.data;

  const byIp = await hitRateLimit(db, `pwreset:ip:${ip ?? "unknown"}`, REQUEST_IP_LIMIT);
  const byPhone = await hitRateLimit(db, `pwreset:phone:${phone}`, REQUEST_PHONE_LIMIT);
  if (!byIp.allowed || !byPhone.allowed) return fail("محاولات كثيرة. استنى شوية وجرّب مرة ثانية.");

  const user = await db.select({ id: users.id, platformRole: users.platformRole, status: users.status }).from(users).where(eq(users.phone, phone)).get();
  if (user && user.platformRole !== "admin" && user.status === "active") {
    const recent = await db
      .select({ id: passwordResetRequests.id })
      .from(passwordResetRequests)
      .where(and(eq(passwordResetRequests.userId, user.id), inArray(passwordResetRequests.status, ["pending", "issued"]), gt(passwordResetRequests.createdAt, new Date(Date.now() - DUPLICATE_WINDOW_MS))))
      .get();
    if (!recent) await db.insert(passwordResetRequests).values({ userId: user.id });
  }
  return ok({ phone });
}

export type ResetRequestRow = {
  id: string; status: "pending" | "issued"; createdAt: number; expiresAt: number | null;
  user: { id: string; name: string; phone: string }; stores: string[];
};

/** الطلبات المفتوحة للأدمن: المنتظرة، والمصدرة اللي رابطها ما انتهى */
export async function listResetRequests(db: Db, now = Date.now()): Promise<ResetRequestRow[]> {
  const rows = await db
    .select({ r: passwordResetRequests, u: users })
    .from(passwordResetRequests)
    .innerJoin(users, eq(users.id, passwordResetRequests.userId))
    .where(or(eq(passwordResetRequests.status, "pending"), and(eq(passwordResetRequests.status, "issued"), gt(passwordResetRequests.expiresAt, new Date(now)))))
    .orderBy(desc(passwordResetRequests.createdAt))
    .limit(100);
  if (!rows.length) return [];
  const owned = await db.select({ ownerUserId: stores.ownerUserId, name: stores.name }).from(stores).where(inArray(stores.ownerUserId, rows.map((x) => x.u.id)));
  return rows.map(({ r, u }) => ({
    id: r.id, status: r.status as "pending" | "issued", createdAt: r.createdAt.getTime(), expiresAt: r.expiresAt?.getTime() ?? null,
    user: { id: u.id, name: u.name, phone: u.phone }, stores: owned.filter((s) => s.ownerUserId === u.id).map((s) => s.name),
  }));
}

/** الأدمن يصدر رابط (التوكن يرجع هنا مرة وحدة بس؛ ما ينحفظش). يلغي أي رابط قديم مفتوح لنفس المستخدم. */
export async function issueResetLink(db: Db, requestId: string, actor: { id: string }, now = Date.now()): Promise<Result<{ token: string; expiresAt: number; user: { name: string; phone: string } }>> {
  const row = await db
    .select({ r: passwordResetRequests, u: users })
    .from(passwordResetRequests)
    .innerJoin(users, eq(users.id, passwordResetRequests.userId))
    .where(eq(passwordResetRequests.id, requestId))
    .get();
  if (!row) return fail("ما لقينا الطلب. يمكن انحذف، حدّث الصفحة.");
  if (row.r.status === "used" || row.r.status === "dismissed") return fail("هذا الطلب انتهى. اطلب من البياع طلب جديد.");
  if (row.u.platformRole === "admin") return fail("ما ينفعش تغيّر كلمة سر حساب أدمن من هنا.");
  if (row.u.status === "blocked") return fail("حسابك موقوف. تواصل مع الدعم.");

  await db
    .update(passwordResetRequests)
    .set({ status: "dismissed", tokenHash: null })
    .where(and(eq(passwordResetRequests.userId, row.u.id), eq(passwordResetRequests.status, "issued")));
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now + RESET_TTL_MS);
  await db.update(passwordResetRequests).set({ status: "issued", tokenHash: hashToken(token), expiresAt, issuedBy: actor.id }).where(eq(passwordResetRequests.id, requestId));
  await writeAudit(db, { actorUserId: actor.id, storeId: null, action: "password.reset_issue", entityType: "user", entityId: row.u.id });
  return ok({ token, expiresAt: expiresAt.getTime(), user: { name: row.u.name, phone: row.u.phone } });
}

export async function dismissResetRequest(db: Db, requestId: string, actor: { id: string }): Promise<Result> {
  const res = await db
    .update(passwordResetRequests)
    .set({ status: "dismissed", tokenHash: null })
    .where(and(eq(passwordResetRequests.id, requestId), inArray(passwordResetRequests.status, ["pending", "issued"])))
    .returning({ id: passwordResetRequests.id, userId: passwordResetRequests.userId });
  if (!res.length) return fail("ما لقينا الطلب. يمكن انحذف، حدّث الصفحة.");
  await writeAudit(db, { actorUserId: actor.id, storeId: null, action: "password.reset_dismiss", entityType: "user", entityId: res[0]!.userId });
  return ok(undefined);
}

async function findValid(db: Db, token: string, now: number) {
  if (!token || token.length < 20 || token.length > 100) return null;
  return db
    .select({ r: passwordResetRequests, u: users })
    .from(passwordResetRequests)
    .innerJoin(users, eq(users.id, passwordResetRequests.userId))
    .where(and(eq(passwordResetRequests.tokenHash, hashToken(token)), eq(passwordResetRequests.status, "issued"), isNotNull(passwordResetRequests.expiresAt), gt(passwordResetRequests.expiresAt, new Date(now))))
    .get();
}

/** للصفحة: هل الرابط صالح؟ (يرجع الاسم الأول بس) */
export async function checkResetToken(db: Db, token: string, now = Date.now()): Promise<Result<{ name: string }>> {
  const v = await findValid(db, token, now);
  if (!v || v.u.status === "blocked" || v.u.platformRole === "admin") return fail("الرابط غير صالح أو انتهت صلاحيته. اطلب رابط جديد.");
  return ok({ name: v.u.name });
}

/** تعيين كلمة السر الجديدة بالرابط: لمرة وحدة، ويلغي كل جلسات المستخدم */
export async function completePasswordReset(db: Db, token: string, password: unknown, ip: string | null, now = Date.now()): Promise<Result> {
  const limit = await hitRateLimit(db, `pwreset:complete:${ip ?? "unknown"}`, COMPLETE_IP_LIMIT);
  if (!limit.allowed) return fail("محاولات كثيرة. استنى شوية وجرّب مرة ثانية.");
  const p = passwordSchema.safeParse(password);
  if (!p.success) return fail(firstError(p.error));
  const v = await findValid(db, token, now);
  if (!v || v.u.status === "blocked" || v.u.platformRole === "admin") return fail("الرابط غير صالح أو انتهت صلاحيته. اطلب رابط جديد.");

  // نستهلك الرابط أول (شرط status=issued يمنع الاستعمال المزدوج لو جا طلبين مع بعض)
  const claimed = await db
    .update(passwordResetRequests)
    .set({ status: "used", usedAt: new Date(now), tokenHash: null })
    .where(and(eq(passwordResetRequests.id, v.r.id), eq(passwordResetRequests.status, "issued")))
    .returning({ id: passwordResetRequests.id });
  if (!claimed.length) return fail("الرابط غير صالح أو انتهت صلاحيته. اطلب رابط جديد.");

  await db.update(users).set({ passwordHash: await hashPassword(p.data) }).where(eq(users.id, v.u.id));
  await destroyAllUserSessions(db, v.u.id);
  await writeAudit(db, { actorUserId: v.u.id, storeId: null, action: "password.reset_done", entityType: "user", entityId: v.u.id });
  return ok(undefined);
}
