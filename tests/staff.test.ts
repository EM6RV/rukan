import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { auditLogs, sessions, users } from "@/db/schema/platform";
import { authenticate, registerUser } from "@/server/auth/service";
import { createSession } from "@/server/auth/session";
import { courierRestriction } from "@/server/orders/access";
import { can } from "@/server/permissions";
import { addStaff, changeStaffRole, listStaff, removeStaff, resetStaffPassword, staffQuota } from "@/server/staff-service";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t } from "@/server/tenant";
import { makeTestDb } from "./helpers/db";

let db: Db;
let close: () => void;
let seq = 0;
const PW = "kalimat-sirr-1";

async function owner(slug: string) {
  const phone = `0919${String(++seq).padStart(6, "0")}`;
  const reg = await registerUser(db, { name: "مالك", phone, password: PW }, "1.1.1.1");
  if (!reg.ok) throw new Error(reg.error);
  const r = await createStoreForUser(db, { userId: reg.data.userId, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  return { userId: reg.data.userId, storeId: r.data.storeId, scope: forStore(db, r.data.storeId) };
}
const phone = () => `0925${String(++seq).padStart(6, "0")}`;
const LIM3 = { maxStaff: 3 };

beforeAll(async () => { ({ db, close } = await makeTestDb()); });
afterAll(() => close());

describe("الموظفين", () => {
  it("إضافة موظف: يقدر يسجل دخول، ويظهر في القائمة بعد المالك", async () => {
    const o = await owner("st-1");
    const p = phone();
    const r = await addStaff(db, o.storeId, o.userId, { name: "موظف طلبيات", phone: `+218${p.slice(1)}`, password: PW, role: "orders_staff" }, LIM3);
    expect(r.ok).toBe(true);
    const list = await listStaff(db, o.storeId);
    expect(list.map((x) => x.role)).toEqual(["owner", "orders_staff"]);
    expect(list[1]).toMatchObject({ name: "موظف طلبيات", phone: p, isBlocked: false });
    expect(await authenticate(db, { phone: p, password: PW }, "2.2.2.2")).toMatchObject({ ok: true });
    expect((await db.select().from(auditLogs).where(eq(auditLogs.storeId, o.storeId))).map((a) => a.action)).toContain("staff.add");
  });

  it("رقم مسجل، تحقق المدخلات", async () => {
    const o = await owner("st-2");
    const other = await owner("st-3");
    const ownerPhone = (await db.select().from(users).where(eq(users.id, other.userId)))[0]!.phone;
    expect(await addStaff(db, o.storeId, o.userId, { name: "موظف", phone: ownerPhone, password: PW, role: "manager" }, LIM3)).toEqual({ ok: false, error: expect.stringContaining("مسجّل") });
    const base = { name: "موظف", phone: phone(), password: PW, role: "manager" };
    const err = async (over: object) => { const r = await addStaff(db, o.storeId, o.userId, { ...base, phone: phone(), ...over }, LIM3); return r.ok ? "OK" : r.error; };
    expect(await err({ name: "x" })).toContain("الاسم");
    expect(await err({ phone: "0961234567" })).toContain("رقم");
    expect(await err({ password: "123" })).toContain("8");
    expect(await err({ role: "owner" })).toContain("الصلاحية");
    expect(await err({ role: "admin" })).toContain("الصلاحية");
  });

  it("حد الباقة: 1 و3 وبلا حد (المالك ما يتحسبش)", async () => {
    const o = await owner("st-4");
    const add = (limits: { maxStaff: number | null }) => addStaff(db, o.storeId, o.userId, { name: "موظف جديد", phone: phone(), password: PW, role: "manager" }, limits);
    expect((await add({ maxStaff: 1 })).ok).toBe(true);
    expect(await add({ maxStaff: 1 })).toEqual({ ok: false, error: expect.stringContaining("موظف فقط") });
    expect((await add({ maxStaff: 3 })).ok).toBe(true);
    expect((await add({ maxStaff: 3 })).ok).toBe(true);
    expect(await add({ maxStaff: 3 })).toEqual({ ok: false, error: expect.stringContaining("3 موظفين") });
    expect((await add({ maxStaff: null })).ok).toBe(true);
    expect(staffQuota({ maxStaff: 3 }, 2).canAdd).toBe(true);
    expect(staffQuota({ maxStaff: 3 }, 3).canAdd).toBe(false);
    expect(staffQuota({ maxStaff: null }, 999).canAdd).toBe(true);
  });

  it("إضافات متزامنة ما تتخطاش الحد", async () => {
    const o = await owner("st-5");
    const results = await Promise.all(Array.from({ length: 5 }, () => addStaff(db, o.storeId, o.userId, { name: "موظف متزامن", phone: phone(), password: PW, role: "manager" }, { maxStaff: 2 })));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect((await listStaff(db, o.storeId)).length).toBe(3);
  });

  it("المندوب: ينربط بسجل مندوب ويتقيّد بطلبياته، وتغيير الدور يفك الربط", async () => {
    const o = await owner("st-6");
    const p = phone();
    const r = await addStaff(db, o.storeId, o.userId, { name: "علي المندوب", phone: p, password: PW, role: "courier" }, LIM3);
    if (!r.ok) throw new Error(r.error);
    const [c] = await o.scope.from(t.couriers);
    expect(c).toMatchObject({ name: "علي المندوب", phone: p });
    const member = (await listStaff(db, o.storeId)).find((x) => x.role === "courier")!;
    expect(c!.userId).toBe(member.userId);
    expect(await courierRestriction({ role: "courier", scope: o.scope, user: { id: member.userId } as never })).toBe(c!.id);
    expect(await courierRestriction({ role: "owner", scope: o.scope, user: { id: o.userId } as never })).toBeNull();
    expect(await courierRestriction({ role: "courier", scope: o.scope, user: { id: "nobody" } as never })).toBe("__no_courier__");

    expect((await changeStaffRole(db, o.storeId, o.userId, r.data.memberId, "manager")).ok).toBe(true);
    expect((await o.scope.from(t.couriers))[0]!.userId).toBeNull();
    expect((await listStaff(db, o.storeId)).find((x) => x.id === r.data.memberId)!.role).toBe("manager");
    expect((await changeStaffRole(db, o.storeId, o.userId, r.data.memberId, "courier")).ok).toBe(true);
    const couriers = await o.scope.from(t.couriers);
    expect(couriers).toHaveLength(2); // مندوب جديد مربوط (القديم يبقى بدون ربط)
    expect(couriers.filter((x) => x.userId === member.userId)).toHaveLength(1);
  });

  it("الصلاحيات حسب الدور", () => {
    expect(can("manager", "staff")).toBe(false);
    expect(can("manager", "billing")).toBe(false);
    expect(can("manager", "reports")).toBe(true);
    expect(can("orders_staff", "orders")).toBe(true);
    expect(can("orders_staff", "settings")).toBe(false);
    expect(can("orders_staff", "couriers")).toBe(false);
    expect(can("courier", "orders")).toBe(true);
    expect(can("courier", "customers")).toBe(false);
    expect(can("courier", "dashboard")).toBe(false);
  });

  it("إعادة تعيين كلمة السر تلغي الجلسات، والقديمة ما تشتغلش", async () => {
    const o = await owner("st-7");
    const p = phone();
    const r = await addStaff(db, o.storeId, o.userId, { name: "موظف", phone: p, password: PW, role: "manager" }, LIM3);
    if (!r.ok) throw new Error(r.error);
    const staffUser = (await listStaff(db, o.storeId))[1]!.userId;
    await createSession(db, staffUser);
    expect(await db.select().from(sessions).where(eq(sessions.userId, staffUser))).toHaveLength(1);
    expect((await resetStaffPassword(db, o.storeId, o.userId, r.data.memberId, "short")).ok).toBe(false);
    expect((await resetStaffPassword(db, o.storeId, o.userId, r.data.memberId, "password-new-9")).ok).toBe(true);
    expect(await db.select().from(sessions).where(eq(sessions.userId, staffUser))).toHaveLength(0);
    expect(await authenticate(db, { phone: p, password: PW }, "3.3.3.3")).toMatchObject({ ok: false });
    expect(await authenticate(db, { phone: p, password: "password-new-9" }, "3.3.3.3")).toMatchObject({ ok: true });
  });

  it("الحذف: يقفل الحساب ويحرر الرقم ويفك ربط المندوب ويحافظ على السجل", async () => {
    const o = await owner("st-8");
    const p = phone();
    const r = await addStaff(db, o.storeId, o.userId, { name: "علي المندوب", phone: p, password: PW, role: "courier" }, LIM3);
    if (!r.ok) throw new Error(r.error);
    const staffUser = (await listStaff(db, o.storeId))[1]!.userId;
    await createSession(db, staffUser);
    expect((await removeStaff(db, o.storeId, o.userId, r.data.memberId)).ok).toBe(true);
    expect((await listStaff(db, o.storeId)).map((x) => x.role)).toEqual(["owner"]);
    expect(await db.select().from(sessions).where(eq(sessions.userId, staffUser))).toHaveLength(0);
    expect((await o.scope.from(t.couriers))[0]).toMatchObject({ name: "علي المندوب", userId: null });
    expect(await authenticate(db, { phone: p, password: PW }, "4.4.4.4")).toMatchObject({ ok: false });
    expect((await addStaff(db, o.storeId, o.userId, { name: "موظف جديد", phone: p, password: PW, role: "manager" }, LIM3)).ok).toBe(true); // الرقم اتحرر
    expect((await db.select().from(auditLogs).where(eq(auditLogs.storeId, o.storeId))).map((a) => a.action)).toContain("staff.remove");
  });

  it("حماية: المالك والنفس ومتجر ثاني", async () => {
    const [a, b] = [await owner("st-9"), await owner("st-10")];
    const ra = await addStaff(db, a.storeId, a.userId, { name: "موظف أ", phone: phone(), password: PW, role: "manager" }, LIM3);
    const rb = await addStaff(db, b.storeId, b.userId, { name: "موظف ب", phone: phone(), password: PW, role: "manager" }, LIM3);
    if (!ra.ok || !rb.ok) throw new Error("setup");
    const ownerMember = (await listStaff(db, a.storeId))[0]!;
    expect(await removeStaff(db, a.storeId, a.userId, ownerMember.id)).toEqual({ ok: false, error: expect.stringContaining("المالك") });
    expect((await changeStaffRole(db, a.storeId, a.userId, ownerMember.id, "courier")).ok).toBe(false);
    const staffUserA = (await listStaff(db, a.storeId))[1]!.userId;
    expect(await removeStaff(db, a.storeId, staffUserA, ra.data.memberId)).toEqual({ ok: false, error: expect.stringContaining("حسابك") });
    expect((await removeStaff(db, a.storeId, a.userId, rb.data.memberId)).ok).toBe(false);
    expect((await changeStaffRole(db, a.storeId, a.userId, rb.data.memberId, "courier")).ok).toBe(false);
    expect((await resetStaffPassword(db, a.storeId, a.userId, rb.data.memberId, "password-new-9")).ok).toBe(false);
    expect((await listStaff(db, b.storeId))).toHaveLength(2);
    expect((await changeStaffRole(db, a.storeId, a.userId, ra.data.memberId, "owner")).ok).toBe(false);
  });
});
