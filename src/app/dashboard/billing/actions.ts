"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { stores } from "@/db/schema/platform";
import { actionContext } from "@/server/store-context";

/** إغلاق رسالة تحويل الباقة (تبان لين يقفلها) */
export async function dismissPlanNoticeAction() {
  const a = await actionContext("dashboard");
  if (!a.ok) return;
  await getDb().update(stores).set({ planNotice: null }).where(eq(stores.id, a.ctx.store.id));
  revalidatePath("/dashboard", "layout");
}
