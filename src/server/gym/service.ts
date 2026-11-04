// خدمات النادي: الأعضاء، الاشتراكات (تجديد/تجميد/ترقية/نقل/إلغاء)، الأقساط والدفعات، الدخول، الحصص والمدربين، والتقدم.
// كل مبالغ بالدرهم، والأوقات بتوقيت ليبيا. الدفعات تتسجل في الدفتر المحاسبي لو وحدة الحسابات شغالة.
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { PAY_METHODS, type PayMethod } from "@/lib/constants";
import {
  canFreeze, checkEntry, classMoment, currentMembership, DEFAULT_GYM_CONFIG, endOfMembership, installmentSchedule, libyaDay, libyaDayStart, nextClassDays, overdueInstallments,
  prorateUpgrade, ptCommission, unfreeze, type EntryResult, type GymConfig, type Section,
} from "@/lib/gym";
import { normalizeLibyanPhone } from "@/lib/phone";
import { firstError } from "@/lib/validation";
import { defaultAccountId, postEntry } from "../accounting/ledger";
import { fail, ok, type Result } from "../catalog/result";
import { hashPassword } from "../auth/password";
import { isUniqueViolation } from "../db-errors";
import { upsertCustomer } from "../pos/customers";
import { posConfigOf } from "../pos/sync";
import { t, type StoreScope, type StoreScopeCore } from "../tenant";

const DAY = 86_400_000;
type Core = Pick<StoreScopeCore, "from" | "insert" | "update" | "delete" | "count" | "aggregate">;
const money = z.number({ error: "المبلغ لازم يكون رقم" }).int().min(0, "المبلغ ما يكونش بالسالب").max(1_000_000_000);

export async function gymConfigOf(scope: Pick<StoreScope, "from">): Promise<GymConfig> {
  const [s] = await scope.from(t.storeSettings).limit(1);
  return { ...DEFAULT_GYM_CONFIG, ...((posConfigOf(s?.posConfig) as { gym?: Partial<GymConfig> }).gym ?? {}) };
}
const gymConfigSchema = z.object({
  antiPassbackHours: z.number().int().min(0).max(24),
  installmentGraceDays: z.number().int().min(0).max(60),
  expiryNoticeDays: z.number().int().min(1).max(30),
  absentDays: z.number().int().min(3).max(90),
  womenHours: z.array(z.object({ days: z.array(z.number().int().min(0).max(6)).max(7), fromMinute: z.number().int().min(0).max(1439), toMinute: z.number().int().min(1).max(1440) })).max(14),
  autoCheckout: z.boolean().default(true),
});
export async function saveGymConfig(scope: StoreScope, input: unknown): Promise<Result> {
  const p = gymConfigSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const [cur] = await scope.from(t.storeSettings).limit(1);
  await scope.update(t.storeSettings, { posConfig: { ...(cur?.posConfig ?? {}), gym: p.data } as never });
  return ok(undefined);
}

// ===== أنواع الاشتراكات =====
const planSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string({ error: "اكتب اسم الاشتراك" }).trim().min(2, "اكتب اسم الاشتراك").max(40),
  kind: z.enum(["duration", "visits", "day"]),
  days: z.number().int().min(1, "يوم على الأقل").max(800),
  visits: z.number().int().min(1).max(1000).nullish().transform((v) => v ?? null),
  price: money, joinFee: money.default(0),
  section: z.enum(["men", "women", "mixed"]).default("mixed"),
  fromMinute: z.number().int().min(0).max(1439).nullish().transform((v) => v ?? null),
  toMinute: z.number().int().min(1).max(1440).nullish().transform((v) => v ?? null),
  maxFreezeDays: z.number().int().min(0).max(120).default(0),
  familySize: z.number().int().min(0).max(8).default(0),
  isActive: z.boolean().default(true),
}).refine((v) => v.kind !== "visits" || (v.visits ?? 0) > 0, { message: "اكتب عدد الحصص", path: ["visits"] })
  .refine((v) => (v.fromMinute === null) === (v.toMinute === null), { message: "حدد بداية ونهاية الوقت المسموح", path: ["fromMinute"] });

export const listPlans = (scope: StoreScope) => scope.from(t.gymPlans).orderBy(asc(t.gymPlans.position), asc(t.gymPlans.price));
export async function savePlan(scope: StoreScope, input: unknown): Promise<Result<{ id: string }>> {
  const p = planSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, ...d } = p.data;
  const row = { ...d, days: d.kind === "day" ? 1 : d.days, visits: d.kind === "visits" ? d.visits : d.kind === "day" ? 1 : null };
  if (id) { const [r] = await scope.update(t.gymPlans, row, eq(t.gymPlans.id, id)); return r ? ok({ id: r.id }) : fail("ما لقينا الاشتراك."); }
  const [r] = await scope.insert(t.gymPlans, { ...row, position: await scope.count(t.gymPlans) });
  return ok({ id: r!.id });
}
/** ينشئ أنواع الاشتراكات من إعداد التسجيل (مرة وحدة) */
export async function seedPlansFromSetup(scope: StoreScope, setup: { sections?: Section[]; membershipTypes?: { name: string; months: number; price: number }[] } | undefined) {
  if (!setup?.membershipTypes?.length || (await scope.count(t.gymPlans)) > 0) return 0;
  const section: Section = setup.sections?.length === 1 ? setup.sections[0]! : "mixed";
  let n = 0;
  for (const m of setup.membershipTypes) await scope.insert(t.gymPlans, { name: m.name, kind: "duration", days: m.months * 30, price: m.price, section, maxFreezeDays: Math.min(30, m.months * 5), position: n++ });
  return n;
}

// ===== الأعضاء =====
const memberSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string({ error: "اكتب اسم العضو" }).trim().min(2, "اكتب اسم العضو").max(80),
  phone: z.string({ error: "اكتب رقم الهاتف" }).trim().min(6).max(20),
  section: z.enum(["men", "women", "mixed"]).default("men"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ الميلاد غير صحيح").nullish().transform((v) => v || null),
  heightCm: z.number().int().min(80).max(250).nullish().transform((v) => v ?? null),
  weightKg: z.number().int().min(20).max(400).nullish().transform((v) => v ?? null),
  emergencyName: z.string().trim().max(60).nullish().transform((v) => v || null),
  emergencyPhone: z.string().trim().max(20).nullish().transform((v) => v || null),
  healthNotes: z.string().trim().max(500).nullish().transform((v) => v || null),
  photoMediaId: z.string().min(1).nullish().transform((v) => v ?? null),
  termsAccepted: z.boolean().default(false),
  parentMemberId: z.string().min(1).nullish().transform((v) => v ?? null),
  photosConsent: z.boolean().default(false),
});
const token = () => randomBytes(18).toString("base64url");

export async function saveMember(scope: StoreScope, maxMembers: number | null | undefined, input: unknown): Promise<Result<{ id: string; qrToken: string }>> {
  const p = memberSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const phone = normalizeLibyanPhone(p.data.phone);
  if (!phone) return fail("رقم الهاتف مش رقم ليبي صحيح.");
  if (p.data.emergencyPhone && !normalizeLibyanPhone(p.data.emergencyPhone)) return fail("رقم الطوارئ مش صحيح.");
  const { id, termsAccepted, ...d } = p.data;
  try {
    return await scope.transaction(async (tx) => {
      if (d.parentMemberId && !(await tx.count(t.gymMembers, eq(t.gymMembers.id, d.parentMemberId)))) return fail("العضو الرئيسي غير موجود.");
      if (id) {
        const [cur] = await tx.from(t.gymMembers, eq(t.gymMembers.id, id)).limit(1);
        if (!cur) return fail("ما لقينا العضو.");
        const [r] = await tx.update(t.gymMembers, { ...d, phone, termsAcceptedAt: cur.termsAcceptedAt ?? (termsAccepted ? new Date() : null) }, eq(t.gymMembers.id, id));
        return ok({ id: r!.id, qrToken: r!.qrToken });
      }
      if (typeof maxMembers === "number" && (await tx.count(t.gymMembers, eq(t.gymMembers.status, "active"))) >= maxMembers) return fail(`باقتك تسمح بـ ${maxMembers} عضو. رقّي الباقة أو اشترِ «100 عضو إضافي».`);
      const customer = await upsertCustomer(tx, { phone, name: d.name });
      const [r] = await tx.insert(t.gymMembers, { ...d, phone, customerId: customer.id, qrToken: token(), termsAcceptedAt: termsAccepted ? new Date() : null });
      return ok({ id: r!.id, qrToken: r!.qrToken });
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("الرقم هذا مسجّل لعضو ثاني.");
    throw e;
  }
}

/** يؤرشف عضو أو يمسح بياناته الحساسة (صورة وملاحظات صحية وقياسات) بطلبه */
export async function eraseMemberData(scope: StoreScope, id: string): Promise<Result> {
  const [m] = await scope.from(t.gymMembers, eq(t.gymMembers.id, id)).limit(1);
  if (!m) return fail("ما لقينا العضو.");
  await scope.transaction(async (tx) => {
    await tx.update(t.gymMembers, { healthNotes: null, photoMediaId: null, emergencyName: null, emergencyPhone: null, birthDate: null, heightCm: null, weightKg: null, photosConsent: false, status: "archived", portalHash: null, portalSessions: [] }, eq(t.gymMembers.id, id));
    await tx.delete(t.gymMeasurements, eq(t.gymMeasurements.memberId, id));
    await tx.delete(t.gymPrograms, eq(t.gymPrograms.memberId, id));
  });
  return ok(undefined);
}

export async function setPortalPassword(scope: StoreScope, id: string, password: string): Promise<Result> {
  if (typeof password !== "string" || password.length < 6 || password.length > 64) return fail("كلمة السر 6 حروف على الأقل.");
  const rows = await scope.update(t.gymMembers, { portalHash: await hashPassword(password), portalSessions: [] }, eq(t.gymMembers.id, id));
  return rows.length ? ok(undefined) : fail("ما لقينا العضو.");
}

export type MemberRow = { id: string; name: string; phone: string; section: Section; status: string; membership: { planName: string; endsAt: number; daysLeft: number; status: string; visitsLeft: number | null } | null; overdue: number; lastVisit: number | null };

/** قائمة الأعضاء بحالة اشتراك كل واحد (بحث بالاسم/الهاتف) */
export async function listMembers(scope: StoreScope, o: { q?: string; filter?: "active" | "expired" | "expiring" | "overdue" | "archived"; now?: number; limit?: number } = {}): Promise<MemberRow[]> {
  const now = o.now ?? Date.now();
  const cfg = await gymConfigOf(scope);
  const [members, ships, inst, last] = await Promise.all([
    scope.from(t.gymMembers).orderBy(desc(t.gymMembers.createdAt)), scope.from(t.gymMemberships), scope.from(t.gymInstallments, isNull(t.gymInstallments.paidAt)),
    scope.from(t.gymCheckins, eq(t.gymCheckins.result, "ok")).orderBy(desc(t.gymCheckins.at)).limit(5000),
  ]);
  const q = o.q?.trim().toLowerCase();
  const rows: MemberRow[] = [];
  for (const m of members) {
    if (q && !m.name.toLowerCase().includes(q) && !m.phone.includes(q.replace(/^\+?218/, "0"))) continue;
    const cur = currentMembership(ships.filter((s) => s.memberId === m.id).map((s) => ({ ...s, startsAt: s.startsAt.getTime(), endsAt: s.endsAt.getTime() })), now);
    const overdue = overdueInstallments(inst.filter((i) => i.memberId === m.id).map((i) => ({ dueAt: i.dueAt.getTime(), paidAt: null })), now, cfg.installmentGraceDays).length;
    rows.push({
      id: m.id, name: m.name, phone: m.phone, section: m.section, status: m.status,
      membership: cur ? { planName: cur.planName, endsAt: cur.endsAt, daysLeft: Math.ceil((libyaDayStart(cur.endsAt) - libyaDayStart(now)) / DAY), status: cur.status, visitsLeft: cur.visitsLeft } : null,
      overdue, lastVisit: last.find((c) => c.memberId === m.id)?.at.getTime() ?? null,
    });
  }
  const f = o.filter;
  const out = rows.filter((r) => {
    if (f === "archived") return r.status === "archived";
    if (r.status === "archived") return false;
    if (f === "active") return r.membership && r.membership.daysLeft >= 0 && r.membership.status !== "cancelled";
    if (f === "expired") return !r.membership || r.membership.daysLeft < 0;
    if (f === "expiring") return r.membership && r.membership.daysLeft >= 0 && r.membership.daysLeft <= cfg.expiryNoticeDays;
    if (f === "overdue") return r.overdue > 0;
    return true;
  });
  return out.slice(0, o.limit ?? 500);
}

// ===== الاشتراكات والدفع =====
const subscribeSchema = z.object({
  memberId: z.string().min(1), planId: z.string().min(1, "اختار نوع الاشتراك"),
  startsAt: z.number().int().positive().optional(),
  /** يبدا من تاريخ انتهاء الحالي (لو لسه ساري) بدل اليوم */
  fromCurrentEnd: z.boolean().default(false),
  discount: money.default(0),
  addons: z.array(z.object({ name: z.string().trim().min(1).max(40), price: money })).max(6).default([]),
  /** المدفوع الحين وطريقته، والباقي يتقسم أقساط */
  paid: money.default(0), method: z.enum(PAY_METHODS).default("cash"),
  installments: z.number().int().min(0).max(12).default(0),
  note: z.string().trim().max(200).nullish().transform((v) => v || null),
});
export type SubscribeInput = z.input<typeof subscribeSchema>;

async function postPayment(tx: Core, o: { amount: number; method: PayMethod; refId: string; memo: string; actorUserId: string | null; accounting: boolean }) {
  if (!o.accounting || o.amount === 0 || o.method === "credit" || o.method === "wallet") return;
  const kind = o.method === "cash" ? "cash" : "bank";
  await postEntry(tx, { accountId: await defaultAccountId(tx, kind), amount: o.amount, kind: "pos_sale", refType: "gym_payment", refId: o.refId, memo: o.memo, actorUserId: o.actorUserId });
}

export async function subscribe(scope: StoreScope, input: unknown, o: { actorUserId: string | null; accounting: boolean; now?: number }): Promise<Result<{ membershipId: string; total: number; due: number }>> {
  const p = subscribeSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const now = o.now ?? Date.now();
  return scope.transaction(async (tx) => {
    const [member] = await tx.from(t.gymMembers, eq(t.gymMembers.id, p.data.memberId)).limit(1);
    const [plan] = await tx.from(t.gymPlans, eq(t.gymPlans.id, p.data.planId)).limit(1);
    if (!member || member.status === "archived") return fail("العضو غير موجود.");
    if (!plan || !plan.isActive) return fail("نوع الاشتراك غير موجود أو موقوف.");
    const ships = (await tx.from(t.gymMemberships, eq(t.gymMemberships.memberId, member.id))).map((s) => ({ ...s, startsAt: s.startsAt.getTime(), endsAt: s.endsAt.getTime() }));
    const cur = currentMembership(ships, now);
    const first = ships.length === 0;
    const start = p.data.startsAt ?? (p.data.fromCurrentEnd && cur && cur.endsAt > now ? cur.endsAt + 1 : now);
    const addons = p.data.addons.reduce((a, x) => a + x.price, 0);
    const total = Math.max(0, plan.price + addons + (first ? plan.joinFee : 0) - p.data.discount);
    if (p.data.paid > total) return fail("المدفوع أكبر من إجمالي الاشتراك.");
    const due = total - p.data.paid;
    if (due > 0 && p.data.installments < 1) return fail("فيه باقي بدون أقساط: سجّل دفعة كاملة أو قسّم الباقي على أقساط.");
    const [ms] = await tx.insert(t.gymMemberships, {
      memberId: member.id, planId: plan.id, planName: plan.name, startsAt: new Date(start), endsAt: new Date(endOfMembership(start, plan.days)), visitsLeft: plan.visits,
      price: total, section: plan.section, fromMinute: plan.fromMinute, toMinute: plan.toMinute, maxFreezeDays: plan.maxFreezeDays, addons: p.data.addons, note: p.data.note,
    });
    if (p.data.paid > 0) {
      await tx.insert(t.gymInstallments, { membershipId: ms!.id, memberId: member.id, dueAt: new Date(now), amount: p.data.paid, paidAt: new Date(now), method: p.data.method, note: "دفعة عند الاشتراك" });
      await postPayment(tx, { amount: p.data.paid, method: p.data.method, refId: ms!.id, memo: `اشتراك ${member.name} (${plan.name})`, actorUserId: o.actorUserId, accounting: o.accounting });
    }
    if (due > 0) for (const s of installmentSchedule(due, p.data.installments, now + 30 * DAY)) await tx.insert(t.gymInstallments, { membershipId: ms!.id, memberId: member.id, dueAt: new Date(s.dueAt), amount: s.amount });
    // العائلي: التابعين يشاركوا الاشتراك الرئيسي (يدخلوا باشتراكه)
    return ok({ membershipId: ms!.id, total, due });
  });
}

/** يدفع قسط (أو دفعة على اشتراك) */
export async function payInstallment(scope: StoreScope, id: string, method: PayMethod, o: { actorUserId: string | null; accounting: boolean; now?: number }): Promise<Result> {
  if (!(PAY_METHODS as readonly string[]).includes(method)) return fail("طريقة الدفع غير صحيحة.");
  const now = o.now ?? Date.now();
  return scope.transaction(async (tx) => {
    const [i] = await tx.from(t.gymInstallments, eq(t.gymInstallments.id, id)).limit(1);
    if (!i || i.paidAt) return fail("القسط مدفوع أو غير موجود.");
    const [m] = await tx.from(t.gymMembers, eq(t.gymMembers.id, i.memberId)).limit(1);
    await tx.update(t.gymInstallments, { paidAt: new Date(now), method }, eq(t.gymInstallments.id, id));
    await postPayment(tx, { amount: i.amount, method, refId: i.id, memo: `قسط ${m?.name ?? ""}`, actorUserId: o.actorUserId, accounting: o.accounting });
    return ok(undefined);
  });
}

export async function freezeMembership(scope: StoreScope, id: string, now = Date.now()): Promise<Result> {
  const [m] = await scope.from(t.gymMemberships, eq(t.gymMemberships.id, id)).limit(1);
  if (!m) return fail("ما لقينا الاشتراك.");
  if (!canFreeze({ status: m.status, maxFreezeDays: m.maxFreezeDays, frozenDays: m.frozenDays, endsAt: m.endsAt.getTime() }, now)) return fail(m.status !== "active" ? "الاشتراك مش ساري." : "خلصت أيام التجميد المسموحة لهذا الاشتراك.");
  await scope.update(t.gymMemberships, { status: "frozen", frozenSince: new Date(now) }, eq(t.gymMemberships.id, id));
  return ok(undefined);
}
export async function unfreezeMembership(scope: StoreScope, id: string, now = Date.now()): Promise<Result<{ added: number }>> {
  const [m] = await scope.from(t.gymMemberships, eq(t.gymMemberships.id, id)).limit(1);
  if (!m || m.status !== "frozen") return fail("الاشتراك مش مجمّد.");
  const u = unfreeze({ endsAt: m.endsAt.getTime(), frozenDays: m.frozenDays, frozenSince: m.frozenSince?.getTime() ?? null, maxFreezeDays: m.maxFreezeDays }, now);
  await scope.update(t.gymMemberships, { status: "active", frozenSince: null, frozenDays: u.frozenDays, endsAt: new Date(u.endsAt) }, eq(t.gymMemberships.id, id));
  return ok({ added: u.added });
}

/** ترقية في نص المدة: الاشتراك القديم يتقفل بقيمته الباقية تتخصم من سعر الجديد */
export async function upgradeMembership(scope: StoreScope, id: string, planId: string, o: { actorUserId: string | null; accounting: boolean; paid: number; method: PayMethod; now?: number }): Promise<Result<{ due: number; credit: number }>> {
  const now = o.now ?? Date.now();
  return scope.transaction(async (tx) => {
    const [old] = await tx.from(t.gymMemberships, eq(t.gymMemberships.id, id)).limit(1);
    const [plan] = await tx.from(t.gymPlans, eq(t.gymPlans.id, planId)).limit(1);
    if (!old || old.status !== "active" || old.endsAt.getTime() < now) return fail("الاشتراك مش ساري للترقية.");
    if (!plan || !plan.isActive) return fail("نوع الاشتراك الجديد غير موجود.");
    const calc = prorateUpgrade({ price: old.price, startsAt: old.startsAt.getTime(), endsAt: old.endsAt.getTime() }, plan.price, now);
    if (o.paid < 0 || o.paid > calc.due) return fail(`المدفوع لازم يكون بين 0 و${calc.due}.`);
    await tx.update(t.gymMemberships, { status: "replaced", endsAt: new Date(now) }, eq(t.gymMemberships.id, id));
    const [ms] = await tx.insert(t.gymMemberships, { memberId: old.memberId, planId: plan.id, planName: plan.name, startsAt: new Date(now), endsAt: new Date(endOfMembership(now, plan.days)), visitsLeft: plan.visits, price: calc.due, section: plan.section, fromMinute: plan.fromMinute, toMinute: plan.toMinute, maxFreezeDays: plan.maxFreezeDays, note: `ترقية من ${old.planName}` });
    const [member] = await tx.from(t.gymMembers, eq(t.gymMembers.id, old.memberId)).limit(1);
    if (o.paid > 0) { await tx.insert(t.gymInstallments, { membershipId: ms!.id, memberId: old.memberId, dueAt: new Date(now), amount: o.paid, paidAt: new Date(now), method: o.method, note: "ترقية" }); await postPayment(tx, { amount: o.paid, method: o.method, refId: ms!.id, memo: `ترقية ${member?.name ?? ""}`, actorUserId: o.actorUserId, accounting: o.accounting }); }
    if (calc.due - o.paid > 0) await tx.insert(t.gymInstallments, { membershipId: ms!.id, memberId: old.memberId, dueAt: new Date(now + 30 * DAY), amount: calc.due - o.paid });
    await tx.update(t.gymInstallments, { paidAt: new Date(now), note: "اتنقلت للاشتراك الجديد" }, and(eq(t.gymInstallments.membershipId, id), isNull(t.gymInstallments.paidAt))!);
    return ok({ due: calc.due, credit: calc.credit });
  });
}

/** نقل الاشتراك لعضو ثاني برسوم (الرسوم تتسجل كدفعة) */
export async function transferMembership(scope: StoreScope, id: string, toMemberId: string, fee: number, o: { actorUserId: string | null; accounting: boolean; method: PayMethod; now?: number }): Promise<Result> {
  const now = o.now ?? Date.now();
  if (!Number.isInteger(fee) || fee < 0 || fee > 100_000_000) return fail("الرسوم غير صحيحة.");
  return scope.transaction(async (tx) => {
    const [m] = await tx.from(t.gymMemberships, eq(t.gymMemberships.id, id)).limit(1);
    const [to] = await tx.from(t.gymMembers, eq(t.gymMembers.id, toMemberId)).limit(1);
    if (!m || m.status !== "active" || m.endsAt.getTime() < now) return fail("الاشتراك مش ساري للنقل.");
    if (!to || to.status === "archived" || to.id === m.memberId) return fail("العضو الجديد غير صحيح.");
    await tx.update(t.gymMemberships, { memberId: to.id, note: [m.note, "منقول من عضو ثاني"].filter(Boolean).join(" · ") }, eq(t.gymMemberships.id, id));
    await tx.update(t.gymInstallments, { memberId: to.id }, eq(t.gymInstallments.membershipId, id));
    if (fee > 0) { await tx.insert(t.gymInstallments, { membershipId: id, memberId: to.id, dueAt: new Date(now), amount: fee, paidAt: new Date(now), method: o.method, note: "رسوم نقل الاشتراك" }); await postPayment(tx, { amount: fee, method: o.method, refId: id, memo: `نقل اشتراك إلى ${to.name}`, actorUserId: o.actorUserId, accounting: o.accounting }); }
    return ok(undefined);
  });
}

/** إلغاء الاشتراك واسترجاع مبلغ (يتسجل خارج من الخزنة) */
export async function cancelMembership(scope: StoreScope, id: string, refund: number, o: { actorUserId: string | null; accounting: boolean; method: PayMethod; now?: number }): Promise<Result> {
  const now = o.now ?? Date.now();
  if (!Number.isInteger(refund) || refund < 0) return fail("مبلغ الاسترجاع غير صحيح.");
  return scope.transaction(async (tx) => {
    const [m] = await tx.from(t.gymMemberships, eq(t.gymMemberships.id, id)).limit(1);
    if (!m || (m.status !== "active" && m.status !== "frozen")) return fail("الاشتراك مش ساري.");
    const paid = (await tx.from(t.gymInstallments, and(eq(t.gymInstallments.membershipId, id), gte(t.gymInstallments.amount, 0))!)).filter((i) => i.paidAt).reduce((a, i) => a + i.amount, 0);
    if (refund > paid) return fail("الاسترجاع أكبر من المدفوع.");
    await tx.update(t.gymMemberships, { status: "cancelled", endsAt: new Date(Math.min(m.endsAt.getTime(), now)), frozenSince: null }, eq(t.gymMemberships.id, id));
    await tx.delete(t.gymInstallments, and(eq(t.gymInstallments.membershipId, id), isNull(t.gymInstallments.paidAt))!);
    if (refund > 0) {
      const [member] = await tx.from(t.gymMembers, eq(t.gymMembers.id, m.memberId)).limit(1);
      await tx.insert(t.gymInstallments, { membershipId: id, memberId: m.memberId, dueAt: new Date(now), amount: -refund, paidAt: new Date(now), method: o.method, note: "استرجاع عند الإلغاء" });
      if (o.accounting && o.method !== "credit" && o.method !== "wallet") await postEntry(tx, { accountId: await defaultAccountId(tx, o.method === "cash" ? "cash" : "bank"), amount: -refund, kind: "pos_refund", refType: "gym_payment", refId: id, memo: `استرجاع اشتراك ${member?.name ?? ""}`, actorUserId: o.actorUserId });
    }
    return ok(undefined);
  });
}

export async function memberDetail(scope: StoreScope, id: string, now = Date.now()) {
  const [m] = await scope.from(t.gymMembers, eq(t.gymMembers.id, id)).limit(1);
  if (!m) return null;
  const cfg = await gymConfigOf(scope);
  const [ships, inst, checks, meas, progs, packs, family, bookings] = await Promise.all([
    scope.from(t.gymMemberships, eq(t.gymMemberships.memberId, id)).orderBy(desc(t.gymMemberships.startsAt)), scope.from(t.gymInstallments, eq(t.gymInstallments.memberId, id)).orderBy(asc(t.gymInstallments.dueAt)),
    scope.from(t.gymCheckins, eq(t.gymCheckins.memberId, id)).orderBy(desc(t.gymCheckins.at)).limit(40), scope.from(t.gymMeasurements, eq(t.gymMeasurements.memberId, id)).orderBy(asc(t.gymMeasurements.at)),
    scope.from(t.gymPrograms, eq(t.gymPrograms.memberId, id)).orderBy(desc(t.gymPrograms.createdAt)), scope.from(t.gymPtPacks, eq(t.gymPtPacks.memberId, id)),
    scope.from(t.gymMembers, eq(t.gymMembers.parentMemberId, id)), scope.from(t.gymClassBookings, eq(t.gymClassBookings.memberId, id)).orderBy(desc(t.gymClassBookings.day)).limit(20),
  ]);
  const cur = currentMembership(ships.map((s) => ({ ...s, startsAt: s.startsAt.getTime(), endsAt: s.endsAt.getTime() })), now);
  return { member: m, config: cfg, current: cur, memberships: ships, installments: inst, checkins: checks, measurements: meas, programs: progs, ptPacks: packs, family, bookings,
    overdue: overdueInstallments(inst.map((i) => ({ dueAt: i.dueAt.getTime(), paidAt: i.paidAt?.getTime() ?? null })), now, cfg.installmentGraceDays).length };
}

// ===== الدخول =====
export type CheckinOutcome = { result: EntryResult; member: { id: string; name: string; section: Section; photoMediaId: string | null } | null; inside: number };

/** يلقى العضو بالـ QR أو رقم الهاتف */
export async function findMember(scope: Pick<StoreScope, "from">, code: string) {
  const c = code.trim();
  if (!c || c.length > 80) return null;
  const phone = normalizeLibyanPhone(c);
  const [m] = await scope.from(t.gymMembers, phone ? eq(t.gymMembers.phone, phone) : eq(t.gymMembers.qrToken, c)).limit(1);
  return m ?? null;
}

export async function insideCount(scope: Pick<StoreScope, "from">, now = Date.now()) {
  const rows = await scope.from(t.gymCheckins, and(eq(t.gymCheckins.result, "ok"), isNull(t.gymCheckins.outAt), gte(t.gymCheckins.at, new Date(now - 6 * 3_600_000)))!);
  return rows.length;
}

/** تسجيل دخول: الفحوصات من السيرفر، النتيجة تتسجل (مقبول/مرفوض بسببه)، والحصة تنقص للاشتراك بالحصص */
export async function checkin(scope: StoreScope, code: string, via: "qr" | "phone" | "kiosk" | "manual", o: { deviceId?: string | null; now?: number } = {}): Promise<CheckinOutcome> {
  const now = o.now ?? Date.now();
  const m = await findMember(scope, code);
  if (!m) return { result: { ok: false, code: "none", reason: "ما لقينا عضو بالكود أو الرقم هذا." }, member: null, inside: await insideCount(scope, now) };
  const cfg = await gymConfigOf(scope);
  const out = await scope.transaction(async (tx) => {
    // الاشتراك العائلي: التابع يدخل باشتراك الرئيسي
    const ownerId = m.parentMemberId ?? m.id;
    const ships = (await tx.from(t.gymMemberships, eq(t.gymMemberships.memberId, ownerId))).map((s) => ({ ...s, startsAt: s.startsAt.getTime(), endsAt: s.endsAt.getTime() }));
    const cur = currentMembership(ships, now);
    const [lastOk] = await tx.from(t.gymCheckins, and(eq(t.gymCheckins.memberId, m.id), eq(t.gymCheckins.result, "ok"))!).orderBy(desc(t.gymCheckins.at)).limit(1);
    const inst = await tx.from(t.gymInstallments, and(eq(t.gymInstallments.memberId, ownerId), isNull(t.gymInstallments.paidAt))!);
    const overdue = overdueInstallments(inst.map((i) => ({ dueAt: i.dueAt.getTime(), paidAt: null })), now, cfg.installmentGraceDays).length;
    const result = checkEntry({ now, member: { section: m.section, status: m.status }, membership: cur ? { ...cur, planName: cur.planName } : null, lastOkAt: lastOk?.at.getTime() ?? null, overdue, config: cfg });
    await tx.insert(t.gymCheckins, { memberId: m.id, membershipId: cur?.id ?? null, at: new Date(now), result: result.ok ? "ok" : "denied", reason: result.ok ? null : result.reason, via, deviceId: o.deviceId ?? null });
    if (result.ok && cur && cur.visitsLeft !== null) await tx.update(t.gymMemberships, { visitsLeft: cur.visitsLeft - 1 }, eq(t.gymMemberships.id, cur.id));
    return result;
  });
  return { result: out, member: { id: m.id, name: m.name, section: m.section, photoMediaId: m.photoMediaId }, inside: await insideCount(scope, now) };
}

export async function checkout(scope: StoreScope, memberId: string, now = Date.now()): Promise<Result> {
  const [c] = await scope.from(t.gymCheckins, and(eq(t.gymCheckins.memberId, memberId), eq(t.gymCheckins.result, "ok"), isNull(t.gymCheckins.outAt))!).orderBy(desc(t.gymCheckins.at)).limit(1);
  if (!c) return fail("العضو مش داخل.");
  await scope.update(t.gymCheckins, { outAt: new Date(now) }, eq(t.gymCheckins.id, c.id));
  return ok(undefined);
}

export async function recentCheckins(scope: StoreScope, limit = 40) {
  const [rows, ms] = await Promise.all([scope.from(t.gymCheckins).orderBy(desc(t.gymCheckins.at)).limit(limit), scope.from(t.gymMembers)]);
  return rows.map((c) => ({ id: c.id, memberId: c.memberId, name: ms.find((m) => m.id === c.memberId)?.name ?? "؟", at: c.at.getTime(), outAt: c.outAt?.getTime() ?? null, result: c.result, reason: c.reason, via: c.via }));
}

// ===== المدربين =====
const trainerSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string({ error: "اكتب اسم المدرب" }).trim().min(2).max(60),
  phone: z.string().trim().max(20).nullish().transform((v) => v || null),
  specialty: z.string().trim().max(80).nullish().transform((v) => v || null),
  bio: z.string().trim().max(400).nullish().transform((v) => v || null),
  hours: z.string().trim().max(80).nullish().transform((v) => v || null),
  photoMediaId: z.string().min(1).nullish().transform((v) => v ?? null),
  commissionKind: z.enum(["percent", "fixed"]).default("percent"),
  commissionValue: z.number().int().min(0).max(100_000_000).default(0),
  isActive: z.boolean().default(true),
}).refine((v) => v.commissionKind !== "percent" || v.commissionValue <= 100, { message: "النسبة 100 على الأكثر", path: ["commissionValue"] });
export const listTrainers = (scope: StoreScope) => scope.from(t.gymTrainers).orderBy(asc(t.gymTrainers.name));
export async function saveTrainer(scope: StoreScope, input: unknown): Promise<Result<{ id: string }>> {
  const p = trainerSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, ...d } = p.data;
  if (id) { const [r] = await scope.update(t.gymTrainers, d, eq(t.gymTrainers.id, id)); return r ? ok({ id: r.id }) : fail("ما لقينا المدرب."); }
  const [r] = await scope.insert(t.gymTrainers, d);
  return ok({ id: r!.id });
}

export async function sellPtPack(scope: StoreScope, input: { memberId: string; trainerId: string; sessions: number; price: number; days?: number }, o: { actorUserId: string | null; accounting: boolean; method: PayMethod; now?: number }): Promise<Result<{ id: string }>> {
  const now = o.now ?? Date.now();
  if (!Number.isInteger(input.sessions) || input.sessions < 1 || input.sessions > 200) return fail("عدد الحصص من 1 لـ 200.");
  if (!Number.isInteger(input.price) || input.price < 0) return fail("السعر غير صحيح.");
  return scope.transaction(async (tx) => {
    const [m] = await tx.from(t.gymMembers, eq(t.gymMembers.id, input.memberId)).limit(1);
    const [tr] = await tx.from(t.gymTrainers, eq(t.gymTrainers.id, input.trainerId)).limit(1);
    if (!m || !tr) return fail("العضو أو المدرب غير موجود.");
    const [pack] = await tx.insert(t.gymPtPacks, { memberId: m.id, trainerId: tr.id, sessions: input.sessions, price: input.price, expiresAt: input.days ? new Date(now + input.days * DAY) : null });
    if (input.price > 0) { await tx.insert(t.gymInstallments, { membershipId: (await ensureShadowMembership(tx, m.id, now)), memberId: m.id, dueAt: new Date(now), amount: input.price, paidAt: new Date(now), method: o.method, note: `باقة حصص خاصة مع ${tr.name}` }); await postPayment(tx, { amount: input.price, method: o.method, refId: pack!.id, memo: `PT ${m.name} مع ${tr.name}`, actorUserId: o.actorUserId, accounting: o.accounting }); }
    return ok({ id: pack!.id });
  });
}
/** الدفعات مربوطة باشتراك: لو العضو ما عندوش اشتراك نعمل سجل «حصص خاصة» بدون مدة علشان الدفعة تلقى مكانها */
async function ensureShadowMembership(tx: Core, memberId: string, now: number): Promise<string> {
  const [existing] = await tx.from(t.gymMemberships, and(eq(t.gymMemberships.memberId, memberId), eq(t.gymMemberships.planName, "حصص خاصة"))!).limit(1);
  if (existing) return existing.id;
  let [plan] = await tx.from(t.gymPlans, eq(t.gymPlans.name, "حصص خاصة")).limit(1);
  if (!plan) [plan] = await tx.insert(t.gymPlans, { name: "حصص خاصة", kind: "day", days: 1, price: 0, isActive: false });
  const [m] = await tx.insert(t.gymMemberships, { memberId, planId: plan!.id, planName: "حصص خاصة", startsAt: new Date(now), endsAt: new Date(now), price: 0, status: "cancelled" });
  return m!.id;
}

export async function scheduleOrCompletePt(scope: StoreScope, input: { packId: string; at: number; status: "scheduled" | "done" | "no_show" | "cancelled" }, sessionId?: string): Promise<Result<{ commission: number }>> {
  return scope.transaction(async (tx) => {
    const [pack] = await tx.from(t.gymPtPacks, eq(t.gymPtPacks.id, input.packId)).limit(1);
    if (!pack) return fail("ما لقينا الباقة.");
    const [tr] = await tx.from(t.gymTrainers, eq(t.gymTrainers.id, pack.trainerId)).limit(1);
    const used = (await tx.from(t.gymPtSessions, eq(t.gymPtSessions.packId, pack.id))).filter((s) => s.status === "done" || s.status === "scheduled" || s.status === "no_show");
    const perSession = Math.round(pack.price / pack.sessions);
    const commission = input.status === "done" && tr ? ptCommission(tr.commissionKind, tr.commissionValue, perSession) : 0;
    if (sessionId) {
      const [s] = await tx.from(t.gymPtSessions, eq(t.gymPtSessions.id, sessionId)).limit(1);
      if (!s || s.packId !== pack.id) return fail("ما لقينا الحصة.");
      if (s.status === "done") return fail("الحصة اتمّت قبل.");
      await tx.update(t.gymPtSessions, { status: input.status, commission }, eq(t.gymPtSessions.id, sessionId));
    } else {
      if (used.length >= pack.sessions && input.status !== "cancelled") return fail("خلصت حصص الباقة.");
      if (pack.expiresAt && input.at > pack.expiresAt.getTime()) return fail("الباقة تنتهي قبل الموعد هذا.");
      await tx.insert(t.gymPtSessions, { packId: pack.id, at: new Date(input.at), status: input.status, commission });
    }
    return ok({ commission });
  });
}

/** عمولات المدربين في فترة */
export async function commissionReport(scope: StoreScope, range: { from: number; to: number }) {
  const [sessions, packs, trainers, members] = await Promise.all([
    scope.from(t.gymPtSessions, and(eq(t.gymPtSessions.status, "done"), gte(t.gymPtSessions.at, new Date(range.from)), lte(t.gymPtSessions.at, new Date(range.to)))!),
    scope.from(t.gymPtPacks), scope.from(t.gymTrainers), scope.from(t.gymMembers),
  ]);
  return trainers.map((tr) => {
    const mine = sessions.filter((s) => packs.find((p) => p.id === s.packId)?.trainerId === tr.id);
    return { trainerId: tr.id, name: tr.name, sessions: mine.length, commission: mine.reduce((a, s) => a + s.commission, 0), members: [...new Set(mine.map((s) => members.find((m) => m.id === packs.find((p) => p.id === s.packId)?.memberId)?.name ?? "؟"))] };
  }).filter((r) => r.sessions > 0 || true).sort((a, b) => b.commission - a.commission);
}

// ===== الحصص (الجدول الأسبوعي والحجز) =====
const classSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string({ error: "اكتب اسم الحصة" }).trim().min(2).max(60),
  trainerId: z.string().min(1).nullish().transform((v) => v ?? null),
  room: z.string().trim().max(40).nullish().transform((v) => v || null),
  weekday: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439), durationMin: z.number().int().min(15).max(240).default(60),
  capacity: z.number().int().min(1).max(500), section: z.enum(["men", "women", "mixed"]).default("mixed"),
  cancelBeforeMin: z.number().int().min(0).max(1440).default(120), isActive: z.boolean().default(true),
});
export const listClasses = (scope: StoreScope) => scope.from(t.gymClasses).orderBy(asc(t.gymClasses.weekday), asc(t.gymClasses.startMinute));
export async function saveClass(scope: StoreScope, input: unknown): Promise<Result<{ id: string }>> {
  const p = classSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, ...d } = p.data;
  if (d.trainerId && !(await scope.count(t.gymTrainers, eq(t.gymTrainers.id, d.trainerId)))) return fail("المدرب غير موجود.");
  if (id) { const [r] = await scope.update(t.gymClasses, d, eq(t.gymClasses.id, id)); return r ? ok({ id: r.id }) : fail("ما لقينا الحصة."); }
  const [r] = await scope.insert(t.gymClasses, d);
  return ok({ id: r!.id });
}
export async function deleteClass(scope: StoreScope, id: string): Promise<Result> {
  const rows = await scope.delete(t.gymClasses, eq(t.gymClasses.id, id));
  return rows.length ? ok(undefined) : fail("ما لقينا الحصة.");
}

/** الحصص القادمة (تاريخين لكل حصة أسبوعية) بالمحجوز والسعة */
export async function upcomingClasses(scope: StoreScope, now = Date.now(), weeks = 1) {
  const [classes, trainers, bookings] = await Promise.all([scope.from(t.gymClasses, eq(t.gymClasses.isActive, true)), scope.from(t.gymTrainers), scope.from(t.gymClassBookings, inArray(t.gymClassBookings.status, ["booked", "waitlist", "attended"]))]);
  const out = [];
  for (const c of classes) for (const day of nextClassDays(c.weekday, now, weeks)) {
    const at = classMoment(day, c.startMinute);
    if (at + c.durationMin * 60_000 < now) continue;
    const mine = bookings.filter((b) => b.classId === c.id && b.day === day);
    out.push({ id: c.id, name: c.name, day, at, durationMin: c.durationMin, room: c.room, section: c.section, capacity: c.capacity, trainer: trainers.find((x) => x.id === c.trainerId)?.name ?? null, booked: mine.filter((b) => b.status !== "waitlist").length, waitlist: mine.filter((b) => b.status === "waitlist").length, cancelBeforeMin: c.cancelBeforeMin });
  }
  return out.sort((a, b) => a.at - b.at);
}

export async function bookClass(scope: StoreScope, classId: string, memberId: string, day: string, now = Date.now()): Promise<Result<{ status: "booked" | "waitlist" }>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail("اليوم غير صحيح.");
  return scope.transaction(async (tx) => {
    const [c] = await tx.from(t.gymClasses, eq(t.gymClasses.id, classId)).limit(1);
    const [m] = await tx.from(t.gymMembers, eq(t.gymMembers.id, memberId)).limit(1);
    if (!c || !c.isActive || !m || m.status === "archived") return fail("الحصة أو العضو غير موجود.");
    if (libyaDay(classMoment(day, 12 * 60)) !== day || new Date(`${day}T12:00:00Z`).getUTCDay() !== c.weekday) return fail("اليوم هذا مش يوم الحصة.");
    const at = classMoment(day, c.startMinute);
    if (at < now) return fail("الحصة فاتت.");
    if (at > now + 21 * DAY) return fail("الحجز لحد 3 أسابيع بس.");
    if (c.section !== "mixed" && m.section !== c.section) return fail("الحصة هذي لقسم ثاني.");
    const ships = (await tx.from(t.gymMemberships, eq(t.gymMemberships.memberId, m.parentMemberId ?? m.id))).map((s) => ({ ...s, startsAt: s.startsAt.getTime(), endsAt: s.endsAt.getTime() }));
    const cur = currentMembership(ships, at);
    if (!cur || cur.status === "cancelled" || cur.endsAt < at) return fail("ما عندكش اشتراك ساري وقت الحصة.");
    const [dup] = await tx.from(t.gymClassBookings, and(eq(t.gymClassBookings.classId, classId), eq(t.gymClassBookings.memberId, memberId), eq(t.gymClassBookings.day, day))!).limit(1);
    if (dup && dup.status !== "cancelled") return fail("حاجز الحصة هذي قبل.");
    const taken = (await tx.from(t.gymClassBookings, and(eq(t.gymClassBookings.classId, classId), eq(t.gymClassBookings.day, day), eq(t.gymClassBookings.status, "booked"))!)).length;
    const status = taken >= c.capacity ? "waitlist" : "booked";
    if (dup) await tx.update(t.gymClassBookings, { status }, eq(t.gymClassBookings.id, dup.id));
    else await tx.insert(t.gymClassBookings, { classId, memberId, day, status });
    return ok({ status });
  });
}

/** إلغاء الحجز (قبل الوقت المحدد) وترقية أول واحد في الانتظار */
export async function cancelClassBooking(scope: StoreScope, bookingId: string, now = Date.now(), staff = false): Promise<Result<{ promoted: string | null }>> {
  return scope.transaction(async (tx) => {
    const [b] = await tx.from(t.gymClassBookings, eq(t.gymClassBookings.id, bookingId)).limit(1);
    if (!b || b.status === "cancelled" || b.status === "attended") return fail("ما لقينا الحجز.");
    const [c] = await tx.from(t.gymClasses, eq(t.gymClasses.id, b.classId)).limit(1);
    if (!c) return fail("الحصة غير موجودة.");
    const at = classMoment(b.day, c.startMinute);
    if (!staff && at - now < c.cancelBeforeMin * 60_000) return fail(`الإلغاء قبل الحصة بـ ${c.cancelBeforeMin} دقيقة على الأقل.`);
    await tx.update(t.gymClassBookings, { status: "cancelled" }, eq(t.gymClassBookings.id, bookingId));
    let promoted: string | null = null;
    if (b.status === "booked") {
      const [next] = await tx.from(t.gymClassBookings, and(eq(t.gymClassBookings.classId, b.classId), eq(t.gymClassBookings.day, b.day), eq(t.gymClassBookings.status, "waitlist"))!).orderBy(asc(t.gymClassBookings.createdAt)).limit(1);
      if (next) { await tx.update(t.gymClassBookings, { status: "booked" }, eq(t.gymClassBookings.id, next.id)); promoted = next.memberId; }
    }
    return ok({ promoted });
  });
}

/** حضور الحصة: الغايبين يتعلموا «ما حضرش» */
export async function markAttendance(scope: StoreScope, bookingId: string, attended: boolean): Promise<Result> {
  const rows = await scope.update(t.gymClassBookings, { status: attended ? "attended" : "no_show" }, and(eq(t.gymClassBookings.id, bookingId), inArray(t.gymClassBookings.status, ["booked", "attended", "no_show"]))!);
  return rows.length ? ok(undefined) : fail("ما لقينا الحجز.");
}

export async function classRoster(scope: StoreScope, classId: string, day: string) {
  const [rows, ms] = await Promise.all([scope.from(t.gymClassBookings, and(eq(t.gymClassBookings.classId, classId), eq(t.gymClassBookings.day, day))!).orderBy(asc(t.gymClassBookings.createdAt)), scope.from(t.gymMembers)]);
  return rows.filter((r) => r.status !== "cancelled").map((r) => ({ id: r.id, memberId: r.memberId, name: ms.find((m) => m.id === r.memberId)?.name ?? "؟", phone: ms.find((m) => m.id === r.memberId)?.phone ?? "", status: r.status }));
}

// ===== متابعة التقدم =====
const measureSchema = z.object({
  memberId: z.string().min(1), at: z.number().int().positive().optional(),
  weightKg: z.number().min(20).max(400).nullish(), fatPct: z.number().min(2).max(70).nullish(), muscleKg: z.number().min(5).max(200).nullish(),
  chestCm: z.number().min(40).max(250).nullish(), waistCm: z.number().min(30).max(250).nullish(), hipsCm: z.number().min(40).max(250).nullish(), armCm: z.number().min(10).max(80).nullish(), thighCm: z.number().min(20).max(120).nullish(),
  source: z.enum(["manual", "inbody"]).default("manual"),
}).refine((v) => [v.weightKg, v.fatPct, v.muscleKg, v.chestCm, v.waistCm, v.hipsCm, v.armCm, v.thighCm].some((x) => x !== null && x !== undefined), { message: "دخّل قياس واحد على الأقل" });
export async function addMeasurement(scope: StoreScope, input: unknown, actorUserId: string | null): Promise<Result> {
  const p = measureSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const d = p.data;
  if (!(await scope.count(t.gymMembers, eq(t.gymMembers.id, d.memberId)))) return fail("العضو غير موجود.");
  const mm = (cm?: number | null) => (cm == null ? null : Math.round(cm * 10));
  await scope.insert(t.gymMeasurements, { memberId: d.memberId, at: new Date(d.at ?? Date.now()), weightG: d.weightKg == null ? null : Math.round(d.weightKg * 1000), fatPct10: d.fatPct == null ? null : Math.round(d.fatPct * 10), muscleG: d.muscleKg == null ? null : Math.round(d.muscleKg * 1000), chestMm: mm(d.chestCm), waistMm: mm(d.waistCm), hipsMm: mm(d.hipsCm), armMm: mm(d.armCm), thighMm: mm(d.thighCm), source: d.source, actorUserId });
  return ok(undefined);
}
const programSchema = z.object({ memberId: z.string().min(1), trainerId: z.string().min(1).nullish().transform((v) => v ?? null), kind: z.enum(["workout", "nutrition"]), title: z.string().trim().min(2, "اكتب عنوان البرنامج").max(80), content: z.string().trim().min(5, "اكتب البرنامج").max(6000) });
export async function saveProgram(scope: StoreScope, input: unknown): Promise<Result<{ id: string }>> {
  const p = programSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  if (!(await scope.count(t.gymMembers, eq(t.gymMembers.id, p.data.memberId)))) return fail("العضو غير موجود.");
  const [r] = await scope.insert(t.gymPrograms, p.data);
  return ok({ id: r!.id });
}
export const PROGRAM_TEMPLATES = [
  { kind: "workout" as const, title: "برنامج مبتدئين (3 أيام)", content: "اليوم 1: صدر وتراي\n- بنش 3×10\n- دمبل فلاي 3×12\n- تراي حبل 3×12\n\nاليوم 2: ظهر وباي\n- سحب أمامي 3×10\n- تجديف 3×10\n- باي بار 3×12\n\nاليوم 3: أرجل وكتف\n- سكوات 3×10\n- ضغط أرجل 3×12\n- كتف دمبل 3×12\n\nإحماء 10 دقايق قبل كل تمرين، وتمدد بعده." },
  { kind: "workout" as const, title: "حرق دهون (4 أيام)", content: "يوم 1: أرجل + 20 دقيقة كارديو\nيوم 2: علوي (صدر/ظهر) + 15 دقيقة مشي سريع\nيوم 3: راحة أو مشي خفيف\nيوم 4: كتف وذراعين + كور 15 دقيقة\nيوم 5: دائرة كاملة الجسم (Circuit) 30 دقيقة" },
  { kind: "nutrition" as const, title: "نظام تغذية متوازن", content: "الفطور: بيض مع خبز كامل وخضار\nوجبة خفيفة: فاكهة أو لبن\nالغدا: صدر دجاج أو سمك مع رز أو مكرونة كامل وسلطة\nوجبة قبل التمرين: تمر وموز\nالعشا: خفيف (تونة/جبنة قليلة الدسم) وخضار\nالماء: 2.5 لتر في اليوم" },
];
export const deleteProgram = async (scope: StoreScope, id: string): Promise<Result> => ((await scope.delete(t.gymPrograms, eq(t.gymPrograms.id, id))).length ? ok(undefined) : fail("ما لقينا البرنامج."));
