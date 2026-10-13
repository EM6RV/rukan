import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { sessions, users } from "@/db/schema/platform";
import { SESSION_DAYS } from "@/lib/constants";

const DAY_MS = 86_400_000;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type SessionUser = {
  id: string;
  name: string;
  phone: string;
  platformRole: "admin" | null;
};

export async function createSession(db: Db, userId: string, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 255) ?? null,
  });
  // تنظيف الجلسات المنتهية بشكل انتهازي
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { token, expiresAt };
}

/** يتحقق من التوكن ويرجع المستخدم. يجدد الجلسة لو باقي لها أقل من نصف المدة. */
export async function validateSession(db: Db, token: string): Promise<SessionUser | null> {
  const id = hashToken(token);
  const row = await db
    .select({
      expiresAt: sessions.expiresAt,
      id: users.id,
      name: users.name,
      phone: users.phone,
      platformRole: users.platformRole,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .get();

  if (!row || row.status !== "active") return null;

  if (row.expiresAt.getTime() - Date.now() < (SESSION_DAYS / 2) * DAY_MS) {
    await db.update(sessions).set({ expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS) }).where(eq(sessions.id, id));
  }
  return { id: row.id, name: row.name, phone: row.phone, platformRole: row.platformRole };
}

export async function destroySession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function destroyAllUserSessions(db: Db, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
