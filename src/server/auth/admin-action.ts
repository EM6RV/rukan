import "server-only";
import { getDb } from "@/db";
import { getCurrentUser } from "./current";
import type { SessionUser } from "./session";

export type AdminResult = { ok: true; user: SessionUser; db: ReturnType<typeof getDb> } | { ok: false; error: string };

/** للـ server actions وAPI الأدمن: يتأكد إن المستخدم أدمن المنصة (يرجع خطأ بدل redirect) */
export async function adminContext(): Promise<AdminResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "انتهت الجلسة. سجّل دخولك من جديد." };
  if (user.platformRole !== "admin") return { ok: false, error: "هذا الإجراء للأدمن فقط." };
  return { ok: true, user, db: getDb() };
}
