"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { deleteAnnouncement, saveAnnouncement } from "@/server/admin/announcements";
import { savePlan } from "@/server/admin/plans";
import { SITE_TAG } from "@/server/admin/site-cache";
import { savePlatformConfig } from "@/server/admin/settings";
import { resetSiteContent, saveSiteContent } from "@/server/admin/site-content";
import { changePlan, extendTrial, recordPayment, setSuspended, type TouchedStore } from "@/server/admin/subscriptions";
import { adminResetPassword } from "@/server/admin/users";
import { adminSetDomainStatus } from "@/server/domains";
import { adminContext } from "@/server/auth/admin-action";
import type { Result } from "@/server/catalog/result";
import { invalidateStore } from "@/server/storefront/data";

const bad = () => ({ ok: false as const, error: "البيانات غير صحيحة." });
const id = z.string().min(1);

async function run<T>(fn: (a: { userId: string; db: Parameters<typeof savePlan>[0] }) => Promise<Result<T>>, after?: (data: T) => void): Promise<Result<T>> {
  const a = await adminContext();
  if (!a.ok) return a;
  const r = await fn({ userId: a.user.id, db: a.db });
  if (r.ok) {
    revalidatePath("/admin", "layout");
    after?.(r.data);
  }
  return r;
}
const touch = (s: TouchedStore) => invalidateStore(s);

// ===== المتاجر والاشتراكات =====
export async function recordPaymentAction(input: unknown) {
  return run(({ db, userId }) => recordPayment(db, input, { id: userId }), (d) => touch(d.store));
}
export async function extendTrialAction(storeId: unknown, days: unknown) {
  const s = id.safeParse(storeId);
  if (!s.success) return bad();
  return run(({ db, userId }) => extendTrial(db, s.data, days, { id: userId }), (d) => touch(d.store));
}
export async function setSuspendedAction(storeId: unknown, suspended: unknown, reason: unknown) {
  const p = z.object({ storeId: id, suspended: z.boolean(), reason: z.string().max(200).nullish() }).safeParse({ storeId, suspended, reason });
  if (!p.success) return bad();
  return run(({ db, userId }) => setSuspended(db, p.data.storeId, p.data.suspended, { id: userId }, p.data.reason), (d) => touch(d.store));
}
export async function changePlanAction(storeId: unknown, planId: unknown) {
  const p = z.object({ storeId: id, planId: id }).safeParse({ storeId, planId });
  if (!p.success) return bad();
  return run(({ db, userId }) => changePlan(db, p.data.storeId, p.data.planId, { id: userId }), (d) => touch(d.store));
}

// ===== الباقات =====
export async function savePlanAction(input: unknown) {
  // الباقات تظهر في الموقع التسويقي أيضاً
  return run(({ db, userId }) => savePlan(db, input, userId), (d) => { d.affectedStores.forEach(touch); revalidateTag(SITE_TAG, { expire: 0 }); revalidatePath("/"); });
}

// ===== الإعلانات =====
export async function saveAnnouncementAction(input: unknown) {
  return run(({ db, userId }) => saveAnnouncement(db, input, userId));
}
export async function deleteAnnouncementAction(announcementId: unknown) {
  const p = id.safeParse(announcementId);
  if (!p.success) return bad();
  return run(({ db, userId }) => deleteAnnouncement(db, p.data, userId));
}

// ===== الموقع التسويقي والإعدادات =====
const refreshSite = () => { revalidateTag(SITE_TAG, { expire: 0 }); revalidatePath("/"); };
export async function saveSiteContentAction(input: unknown) {
  return run(({ db, userId }) => saveSiteContent(db, input, userId), refreshSite);
}
export async function resetSiteContentAction() {
  return run(({ db, userId }) => resetSiteContent(db, userId), refreshSite);
}
export async function savePlatformConfigAction(input: unknown) {
  return run(({ db, userId }) => savePlatformConfig(db, input, userId), refreshSite);
}


// ===== الدومين الخاص (اعتماد يدوي للدعم) =====
export async function adminDomainStatusAction(domainId: unknown, status: unknown) {
  const p = z.object({ domainId: id, status: z.enum(["verified", "failed"]) }).safeParse({ domainId, status });
  if (!p.success) return bad();
  return run(({ db, userId }) => adminSetDomainStatus(db, p.data.domainId, p.data.status, userId), (d) => { touch({ id: d.storeId, slug: d.domain }); });
}

// ===== كلمة سر المالك (نسيها) =====
export async function adminResetPasswordAction(userId: unknown, storeId: unknown, password: unknown) {
  const p = z.object({ userId: id, storeId: id.nullish() }).safeParse({ userId, storeId });
  if (!p.success) return bad();
  return run(({ db, userId: actor }) => adminResetPassword(db, p.data.userId, password, { id: actor }, p.data.storeId ?? null));
}
