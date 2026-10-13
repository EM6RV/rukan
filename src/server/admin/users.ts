import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { users } from "@/db/schema/platform";
import { firstError, passwordSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { hashPassword } from "../auth/password";
import { destroyAllUserSessions } from "../auth/session";
import { fail, ok, type Result } from "../catalog/result";

/** إعادة تعيين كلمة سر مستخدم (لما البياع ينسى كلمة السر: ما عندنا استرجاع بالرسائل). يلغي كل جلساته. حسابات الأدمن مستثناة. */
export async function adminResetPassword(db: Db, userId: string, password: unknown, actor: { id: string }, storeId: string | null = null): Promise<Result> {
  const p = passwordSchema.safeParse(password);
  if (!p.success) return fail(firstError(p.error));
  const u = await db.select({ id: users.id, platformRole: users.platformRole, status: users.status }).from(users).where(eq(users.id, userId)).get();
  if (!u) return fail("ما لقينا المستخدم. يمكن انحذف، حدّث الصفحة.");
  if (u.platformRole === "admin") return fail("ما ينفعش تغيّر كلمة سر حساب أدمن من هنا.");
  if (u.status === "blocked") return fail("حسابك موقوف. تواصل مع الدعم.");
  await db.update(users).set({ passwordHash: await hashPassword(p.data) }).where(eq(users.id, userId));
  await destroyAllUserSessions(db, userId);
  await writeAudit(db, { actorUserId: actor.id, storeId, action: "user.reset_password", entityType: "user", entityId: userId });
  return ok(undefined);
}
