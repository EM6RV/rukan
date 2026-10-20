"use server";

import { searchDashboard } from "@/server/dashboard-search";
import { actionContext } from "@/server/store-context";

export async function searchDashboardAction(query: unknown) {
  // أي موظف عنده طلبيات على الأقل (المندوب كذلك). الصلاحيات التفصيلية تتفحص داخل searchDashboard.
  const auth = await actionContext("orders");
  if (!auth.ok) return auth;
  if (typeof query !== "string") return { ok: false as const, error: "اكتب كلمة البحث" };
  return { ok: true as const, data: await searchDashboard(auth.ctx, query) };
}
