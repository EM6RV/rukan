"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { dismissAnnouncement } from "@/server/admin/announcements";
import { getCurrentUser } from "@/server/auth/current";

/** البياع يغلق إعلان (لنفسه بس) */
export async function dismissAnnouncementAction(id: unknown) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "سجّل دخولك من جديد." };
  if (typeof id !== "string" || !id) return { ok: false as const, error: "البيانات غير صحيحة." };
  const r = await dismissAnnouncement(getDb(), user.id, id);
  if (r.ok) revalidatePath("/dashboard", "layout");
  return r;
}
