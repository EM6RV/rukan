"use server";

import { revalidatePath } from "next/cache";
import { canUse, type Feature } from "@/lib/entitlements";
import { PAY_METHODS, type PayMethod } from "@/lib/constants";
import { fail, type Result } from "@/server/catalog/result";
import { markMessageSent, saveGymTemplate, type GymMessageKind } from "@/server/gym/messages";
import {
  addMeasurement, bookClass, cancelClassBooking, cancelMembership, checkin, checkout, deleteClass, deleteProgram, eraseMemberData, freezeMembership, markAttendance, payInstallment, saveClass, saveGymConfig,
  saveMember, savePlan, saveProgram, saveTrainer, scheduleOrCompletePt, sellPtPack, setPortalPassword, subscribe, transferMembership, unfreezeMembership, upgradeMembership, type CheckinOutcome, seedPlansFromSetup,
} from "@/server/gym/service";
import { isModuleOn } from "@/server/modules";
import type { Permission } from "@/server/permissions";
import { hasPermission } from "@/server/permissions";
import { auditStore } from "@/server/store-audit";
import { lineActionContext, type StoreContext } from "@/server/store-context";

const LOCKED: Partial<Record<Feature, string>> = {
  classes: "الحصص والحجز مش في باقة رُكن فِت الحالية.", trainers: "المدربين وحصص PT مش في باقة رُكن فِت الحالية.", installments: "الأقساط مش في باقة رُكن فِت الحالية.",
  kiosk: "الكشك مش في باقة رُكن فِت الحالية.", memberPortal: "صفحة العضو مش في باقة رُكن فِت الحالية.", progress: "القياسات والبرامج مش في باقة رُكن فِت الحالية.", advancedMessages: "الرسائل المتقدمة مش في باقة رُكن فِت الحالية.",
};
async function run<T>(perm: Permission, action: string, fn: (c: StoreContext) => Promise<Result<T>>, feature?: Feature, audit = true): Promise<Result<T>> {
  const auth = await lineActionContext("gym", perm, { write: true });
  if (!auth.ok) return auth;
  if (feature && !canUse(auth.ctx.lines.gym.limits ?? {}, feature)) return fail(LOCKED[feature] ?? "الميزة هذي مش في باقتك.");
  const r = await fn(auth.ctx);
  if (r.ok) { if (audit) void auditStore(auth.ctx, action); revalidatePath("/dashboard/gym", "layout"); }
  return r;
}
const acct = (c: StoreContext) => isModuleOn(c.store, c.limits, "accounting");
const O = (c: StoreContext) => ({ actorUserId: c.user.id, accounting: acct(c) });
const method = (m: unknown): PayMethod => ((PAY_METHODS as readonly string[]).includes(String(m)) ? (m as PayMethod) : "cash");

export async function saveMemberAction(input: unknown) { return run("customers", "gym.member", (c) => saveMember(c.scope, c.lines.gym.limits?.maxMembers ?? null, input)); }
export async function eraseMemberAction(id: string) { return run("staff", "gym.member_erase", (c) => eraseMemberData(c.scope, String(id))); }
export async function portalPasswordAction(id: string, password: string) { return run("customers", "gym.portal_password", (c) => setPortalPassword(c.scope, String(id), String(password)), "memberPortal"); }

export async function savePlanAction(input: unknown) { return run("settings", "gym.plan", (c) => savePlan(c.scope, input)); }
export async function seedPlansAction() {
  return run("settings", "gym.seed_plans", async (c) => {
    const [{ lineSetups }, { getDb }] = await Promise.all([import("@/server/lines"), import("@/db")]);
    const n = await seedPlansFromSetup(c.scope, (await lineSetups(getDb(), c.store.id)).gym?.gym);
    return n ? { ok: true as const, data: { created: n } } : fail("ما فيش إعداد مبدئي أو الأنواع موجودة.");
  });
}
export async function saveGymConfigAction(input: unknown) { return run("settings", "gym.config", (c) => saveGymConfig(c.scope, input)); }

export async function subscribeAction(input: unknown) {
  const i = (input ?? {}) as { installments?: number };
  return run("customers", "gym.subscribe", async (c) => {
    if ((i.installments ?? 0) > 0 && !canUse(c.lines.gym.limits ?? {}, "installments")) return fail(LOCKED.installments!);
    return subscribe(c.scope, { ...(input as object), method: method((input as { method?: unknown })?.method) }, O(c));
  });
}
export async function payInstallmentAction(id: string, m: string) { return run("customers", "gym.pay", (c) => payInstallment(c.scope, String(id), method(m), O(c))); }
export async function freezeAction(id: string) { return run("customers", "gym.freeze", (c) => freezeMembership(c.scope, String(id))); }
export async function unfreezeAction(id: string) { return run("customers", "gym.unfreeze", (c) => unfreezeMembership(c.scope, String(id))); }
export async function upgradeAction(id: string, planId: string, paid: number, m: string) { return run("customers", "gym.upgrade", (c) => upgradeMembership(c.scope, String(id), String(planId), { ...O(c), paid: Number(paid) || 0, method: method(m) })); }
export async function transferAction(id: string, toMemberId: string, fee: number, m: string) {
  return run("customers", "gym.transfer", async (c) => (hasPermission({ role: c.role, customPermissions: c.customPermissions }, "pos_approve") ? transferMembership(c.scope, String(id), String(toMemberId), Number(fee) || 0, { ...O(c), method: method(m) }) : fail("نقل الاشتراك يحتاج موافقة المشرف.")));
}
export async function cancelMembershipAction(id: string, refund: number, m: string) {
  return run("customers", "gym.cancel", async (c) => (hasPermission({ role: c.role, customPermissions: c.customPermissions }, "pos_approve") ? cancelMembership(c.scope, String(id), Number(refund) || 0, { ...O(c), method: method(m) }) : fail("إلغاء الاشتراك واسترجاع الفلوس يحتاج موافقة المشرف.")));
}

export async function checkinAction(code: string, via: "qr" | "phone" | "manual"): Promise<Result<CheckinOutcome>> {
  const auth = await lineActionContext("gym", "pos", { write: true, pos: true });
  if (!auth.ok) return auth;
  return { ok: true, data: await checkin(auth.ctx.scope, String(code).slice(0, 80), via === "qr" || via === "phone" ? via : "manual") };
}
export async function checkoutAction(memberId: string) { return run("pos", "gym.checkout", (c) => checkout(c.scope, String(memberId)), undefined, false); }

export async function saveTrainerAction(input: unknown) { return run("settings", "gym.trainer", (c) => saveTrainer(c.scope, input), "trainers"); }
export async function sellPtAction(input: { memberId: string; trainerId: string; sessions: number; price: number; days?: number; method?: string }) {
  return run("customers", "gym.pt_sell", (c) => sellPtPack(c.scope, { memberId: String(input.memberId), trainerId: String(input.trainerId), sessions: Number(input.sessions), price: Number(input.price), days: input.days ? Number(input.days) : undefined }, { ...O(c), method: method(input.method) }), "trainers");
}
export async function ptSessionAction(packId: string, at: number, status: "scheduled" | "done" | "no_show" | "cancelled", sessionId?: string) {
  if (!["scheduled", "done", "no_show", "cancelled"].includes(status)) return fail("حالة غير صحيحة.");
  return run("customers", "gym.pt_session", (c) => scheduleOrCompletePt(c.scope, { packId: String(packId), at: Number(at) || Date.now(), status }, sessionId ? String(sessionId) : undefined), "trainers");
}

export async function saveClassAction(input: unknown) { return run("settings", "gym.class", (c) => saveClass(c.scope, input), "classes"); }
export async function deleteClassAction(id: string) { return run("settings", "gym.class_delete", (c) => deleteClass(c.scope, String(id)), "classes"); }
export async function bookClassAction(classId: string, memberId: string, day: string) { return run("customers", "gym.class_book", (c) => bookClass(c.scope, String(classId), String(memberId), String(day)), "classes"); }
export async function cancelBookingAction(id: string) { return run("customers", "gym.class_cancel", (c) => cancelClassBooking(c.scope, String(id), Date.now(), true), "classes"); }
export async function attendanceAction(id: string, attended: boolean) { return run("customers", "gym.attendance", (c) => markAttendance(c.scope, String(id), !!attended), "classes", false); }

export async function measurementAction(input: unknown) { return run("customers", "gym.measure", (c) => addMeasurement(c.scope, input, c.user.id), "progress", false); }
export async function programAction(input: unknown) { return run("customers", "gym.program", (c) => saveProgram(c.scope, input), "progress", false); }
export async function deleteProgramAction(id: string) { return run("customers", "gym.program_delete", (c) => deleteProgram(c.scope, String(id)), "progress", false); }

export async function messageSentAction(memberId: string, kind: string, refId: string) { return run("customers", "gym.message", (c) => markMessageSent(c.scope, String(memberId), kind as GymMessageKind, String(refId)), undefined, false); }
export async function saveTemplateAction(kind: string, body: string | null) { return run("settings", "gym.template", (c) => saveGymTemplate(c.scope, { kind: String(kind), body: body === null ? null : String(body) }), undefined, false); }

/** رابط كشك جديد (توكن جهاز «kiosk»: دخول بس) */
export async function createKioskAction(name: string): Promise<Result<{ token: string }>> {
  return run("settings", "gym.kiosk", async (c) => {
    const { createDevice, ensureDefaultBranch } = await import("@/server/pos/branches");
    const branch = await ensureDefaultBranch(c.scope);
    const r = await createDevice(c.scope, { kind: "kiosk", line: "gym", name: String(name || "كشك الباب").slice(0, 40), branchId: branch.id }, c.user.id);
    return r.ok ? { ok: true as const, data: { token: r.data.token } } : r;
  }, "kiosk");
}
export async function revokeKioskAction(id: string) {
  return run("settings", "gym.kiosk_revoke", async (c) => { const { revokeDevice } = await import("@/server/pos/branches"); return revokeDevice(c.scope, String(id)); });
}
