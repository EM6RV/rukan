import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { plans, stores, users } from "@/db/schema/platform";
import { LINE_PLANS } from "@/lib/plan-catalog";
import {
  addMeasurement, bookClass, cancelClassBooking, cancelMembership, checkin, commissionReport, eraseMemberData, freezeMembership, listMembers, memberDetail, payInstallment, saveClass, saveMember, savePlan,
  saveTrainer, scheduleOrCompletePt, sellPtPack, subscribe, transferMembership, unfreezeMembership, upgradeMembership, upcomingClasses,
} from "@/server/gym/service";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t, type StoreScope } from "@/server/tenant";
import { makeTestDb } from "./helpers/db";

const DAY = 86_400_000;
let db: Db;
let close: () => void;
let seq = 0;
type Gym = { storeId: string; scope: StoreScope; plan: string; plan3: string; visits: string };
const O = { actorUserId: null, accounting: false } as const;

async function gym(slug: string): Promise<Gym> {
  const [u] = await db.insert(users).values({ phone: `0919${String(++seq).padStart(6, "0")}`, name: slug, passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug, lines: ["gym"] });
  if (!r.ok) throw new Error(r.error);
  await db.update(stores).set({ onboardedAt: new Date() }).where(eq(stores.id, r.data.storeId));
  const scope = forStore(db, r.data.storeId);
  const p = async (x: object) => { const v = await savePlan(scope, x); if (!v.ok) throw new Error(v.error); return v.data.id; };
  return {
    storeId: r.data.storeId, scope,
    plan: await p({ name: "شهري", kind: "duration", days: 30, price: 30_000, joinFee: 5_000, maxFreezeDays: 10 }),
    plan3: await p({ name: "3 شهور", kind: "duration", days: 90, price: 80_000, maxFreezeDays: 20 }),
    visits: await p({ name: "12 حصة", kind: "visits", days: 60, visits: 12, price: 40_000 }),
  };
}
const member = async (g: Gym, name: string, phone: string, extra: object = {}) => { const m = await saveMember(g.scope, 100, { name, phone, termsAccepted: true, ...extra }); if (!m.ok) throw new Error(m.error); return m.data; };

let a: Gym, b: Gym;
beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  for (const p of LINE_PLANS) await db.insert(plans).values({ ...p, price: p.prices.m1 ?? 0 });
  a = await gym("fit-a"); b = await gym("fit-b");
});
afterAll(() => close());

describe("الأعضاء والاشتراكات", () => {
  it("عضو جديد برسوم تسجيل، دفعة وأقساط، والدخول بالـ QR والهاتف", async () => {
    const m = await member(a, "أحمد", "0911112222");
    expect((await saveMember(a.scope, 100, { name: "تكرار", phone: "0911112222" })).ok).toBe(false);
    const sub = await subscribe(a.scope, { memberId: m.id, planId: a.plan, paid: 15_000, installments: 2, note: "أول مرة" }, O);
    expect(sub).toMatchObject({ ok: true, data: { total: 35_000, due: 20_000 } }); // 30 + رسوم 5
    expect((await subscribe(a.scope, { memberId: m.id, planId: a.plan, paid: 0 }, O)).ok).toBe(false); // باقي بدون أقساط
    const inst = await a.scope.from(t.gymInstallments, eq(t.gymInstallments.memberId, m.id));
    expect(inst.map((i) => i.amount).sort((x, y) => x - y)).toEqual([10_000, 10_000, 15_000]);
    const ok1 = await checkin(a.scope, m.qrToken, "qr");
    expect(ok1.result).toMatchObject({ ok: true, daysLeft: expect.any(Number) });
    expect(ok1.inside).toBe(1);
    expect((await checkin(a.scope, "0911112222", "phone")).result).toMatchObject({ ok: false, code: "again" });
    expect((await checkin(a.scope, "nothing", "manual")).result.ok).toBe(false);
    expect((await checkin(b.scope, m.qrToken, "qr")).member).toBeNull(); // عزل
  });

  it("القسط المتأخر بعد المهلة يمنع الدخول، والدفع يفتح", async () => {
    const m = await member(a, "سالم", "0912223333");
    await subscribe(a.scope, { memberId: m.id, planId: a.plan, paid: 5_000, installments: 1 }, { ...O, now: Date.now() - 40 * DAY });
    const r = await checkin(a.scope, "0912223333", "phone");
    expect(r.result).toMatchObject({ ok: false, code: expect.stringMatching(/overdue|expired/) });
    const inst = (await a.scope.from(t.gymInstallments, eq(t.gymInstallments.memberId, m.id))).find((i) => !i.paidAt)!;
    expect((await payInstallment(a.scope, inst.id, "cash", O)).ok).toBe(true);
    expect((await payInstallment(a.scope, inst.id, "cash", O)).ok).toBe(false);
  });

  it("التجميد يمدد الانتهاء، والترقية بالفرق، والنقل والإلغاء مع الاسترجاع", async () => {
    const m = await member(a, "علي", "0913334444");
    const s = await subscribe(a.scope, { memberId: m.id, planId: a.plan, paid: 35_000 }, O);
    if (!s.ok) throw new Error(s.error);
    const id = s.data.membershipId;
    const before = (await a.scope.from(t.gymMemberships, eq(t.gymMemberships.id, id)))[0]!.endsAt.getTime();
    expect((await freezeMembership(a.scope, id)).ok).toBe(true);
    expect((await checkin(a.scope, "0913334444", "phone")).result).toMatchObject({ ok: false, code: "frozen" });
    expect((await unfreezeMembership(a.scope, id, Date.now() + 4 * DAY - 60_000))).toMatchObject({ ok: true, data: { added: 4 } });
    expect((await a.scope.from(t.gymMemberships, eq(t.gymMemberships.id, id)))[0]!.endsAt.getTime()).toBe(before + 4 * DAY);
    const up = await upgradeMembership(a.scope, id, a.plan3, { ...O, paid: 0, method: "cash" });
    expect(up).toMatchObject({ ok: true });
    if (up.ok) { expect(up.data.credit).toBeGreaterThan(20_000); expect(up.data.due).toBe(80_000 - up.data.credit); }
    const cur = (await memberDetail(a.scope, m.id))!.current!;
    expect(cur.planName).toBe("3 شهور");
    const other = await member(a, "ناصر", "0914445555");
    expect((await transferMembership(a.scope, cur.id, other.id, 2_000, { ...O, method: "cash" })).ok).toBe(true);
    expect((await memberDetail(a.scope, other.id))!.current?.id).toBe(cur.id);
    expect((await cancelMembership(a.scope, cur.id, 999_999, { ...O, method: "cash" })).ok).toBe(false);
    expect((await cancelMembership(a.scope, cur.id, 1_000, { ...O, method: "cash" })).ok).toBe(true);
    expect((await checkin(a.scope, "0914445555", "phone")).result.ok).toBe(false);
  });

  it("الاشتراك بالحصص ينقص مع كل دخول، والعائلي يدخل باشتراك الرئيسي", async () => {
    const dad = await member(a, "الأب", "0915556666");
    await subscribe(a.scope, { memberId: dad.id, planId: a.visits, paid: 40_000 }, O);
    const kid = await member(a, "الابن", "0916667777", { parentMemberId: dad.id });
    expect((await checkin(a.scope, "0916667777", "phone")).result).toMatchObject({ ok: true, visitsLeft: 11 });
    const [ms] = await a.scope.from(t.gymMemberships, eq(t.gymMemberships.memberId, dad.id));
    expect(ms!.visitsLeft).toBe(11);
    expect(kid.id).not.toBe(dad.id);
  });

  it("القائمة بالفلاتر، والحد الأقصى للأعضاء، ومسح البيانات الحساسة", async () => {
    const all = await listMembers(a.scope);
    expect(all.length).toBeGreaterThanOrEqual(5);
    expect((await listMembers(a.scope, { filter: "overdue" })).some((r) => r.name === "سالم")).toBe(false); // دفع
    expect((await listMembers(a.scope, { q: "0911112222" })).map((r) => r.name)).toEqual(["أحمد"]);
    expect(await listMembers(b.scope)).toHaveLength(0);
    expect((await saveMember(a.scope, 5, { name: "زايد", phone: "0917778888" })).ok).toBe(false); // حد الباقة
    const m = await member(a, "حساس", "0918889999", { healthNotes: "ضغط", emergencyPhone: "0911000000" });
    await addMeasurement(a.scope, { memberId: m.id, weightKg: 80, fatPct: 22 }, null);
    expect((await eraseMemberData(a.scope, m.id)).ok).toBe(true);
    const d = (await memberDetail(a.scope, m.id))!;
    expect(d.member).toMatchObject({ healthNotes: null, status: "archived", emergencyPhone: null });
    expect(d.measurements).toHaveLength(0);
  });
});

describe("الحصص والمدربين", () => {
  it("حجز بسعة وقائمة انتظار وترقية عند الإلغاء", async () => {
    const tr = await saveTrainer(a.scope, { name: "كابتن محمد", commissionKind: "percent", commissionValue: 40 });
    if (!tr.ok) throw new Error(tr.error);
    const wd = new Date(Date.now() + 2 * DAY + 2 * 3_600_000).getUTCDay();
    const cl = await saveClass(a.scope, { name: "كروس فيت", trainerId: tr.data.id, weekday: wd, startMinute: 18 * 60, capacity: 1, cancelBeforeMin: 60 });
    if (!cl.ok) throw new Error(cl.error);
    const up = (await upcomingClasses(a.scope)).find((c) => c.id === cl.data.id)!;
    expect(up.trainer).toBe("كابتن محمد");
    const m1 = (await listMembers(a.scope, { q: "0911112222" }))[0]!, m2 = (await listMembers(a.scope, { q: "0915556666" }))[0]!;
    expect(await bookClass(a.scope, cl.data.id, m1.id, up.day)).toMatchObject({ ok: true, data: { status: "booked" } });
    expect(await bookClass(a.scope, cl.data.id, m1.id, up.day)).toMatchObject({ ok: false });
    expect(await bookClass(a.scope, cl.data.id, m2.id, up.day)).toMatchObject({ ok: true, data: { status: "waitlist" } });
    const [b1] = await a.scope.from(t.gymClassBookings, eq(t.gymClassBookings.memberId, m1.id));
    const c = await cancelClassBooking(a.scope, b1!.id);
    expect(c).toMatchObject({ ok: true, data: { promoted: m2.id } });
    const [b2] = await a.scope.from(t.gymClassBookings, eq(t.gymClassBookings.memberId, m2.id));
    expect(b2!.status).toBe("booked");
    const late = await cancelClassBooking(a.scope, b2!.id, new Date(up.at - 30 * 60_000).getTime());
    expect(late.ok).toBe(false); // قبل الحصة بنص ساعة والمهلة ساعة
    expect((await bookClass(b.scope, cl.data.id, m1.id, up.day)).ok).toBe(false); // عزل
  });

  it("باقة حصص خاصة وعمولة المدرب", async () => {
    const tr = (await a.scope.from(t.gymTrainers))[0]!;
    const m = (await listMembers(a.scope, { q: "0911112222" }))[0]!;
    const pack = await sellPtPack(a.scope, { memberId: m.id, trainerId: tr.id, sessions: 10, price: 100_000 }, { ...O, method: "cash" });
    if (!pack.ok) throw new Error(pack.error);
    const s = await scheduleOrCompletePt(a.scope, { packId: pack.data.id, at: Date.now(), status: "done" });
    expect(s).toMatchObject({ ok: true, data: { commission: 4_000 } }); // 40% من 10,000
    const rep = await commissionReport(a.scope, { from: Date.now() - DAY, to: Date.now() + DAY });
    expect(rep.find((r) => r.trainerId === tr.id)).toMatchObject({ sessions: 1, commission: 4_000 });
    expect(await commissionReport(b.scope, { from: 0, to: Date.now() })).toEqual([]);
  });
});
