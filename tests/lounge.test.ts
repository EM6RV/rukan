import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { plans, storeMembers, stores, users } from "@/db/schema/platform";
import { LINE_PLANS } from "@/lib/plan-catalog";
import { saveProduct } from "@/server/catalog/products";
import { posBootstrap } from "@/server/pos/bootstrap";
import { createDevice, ensureDefaultBranch } from "@/server/pos/branches";
import { balanceOf, upsertCustomer } from "@/server/pos/customers";
import { applyOps, loadDeviceContext, type DeviceCtx } from "@/server/pos/sync";
import {
  createBooking, floorStatus, getTournament, joinTournament, openMaintenance, closeMaintenance, recordMatch, saveRate, savePack, saveStation, saveTournament, setPlayerPaid, startTournament,
} from "@/server/lounge/service";
import { addStaff } from "@/server/staff-service";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t, type StoreScope } from "@/server/tenant";
import { makeTestDb } from "./helpers/db";

const MIN = 60_000;
let db: Db;
let close: () => void;
let seq = 0;
const uid = () => randomUUID();
type Shop = { storeId: string; ownerId: string; staffId: string; scope: StoreScope; dc: DeviceCtx; ps1: string; ps2: string; cola: string };

async function lounge(slug: string): Promise<Shop> {
  const [u] = await db.insert(users).values({ phone: `0917${String(++seq).padStart(6, "0")}`, name: `مالك ${slug}`, passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug, lines: ["lounge"] });
  if (!r.ok) throw new Error(r.error);
  await db.update(stores).set({ onboardedAt: new Date() }).where(eq(stores.id, r.data.storeId));
  const scope = forStore(db, r.data.storeId);
  const branch = await ensureDefaultBranch(scope);
  const a = await saveStation(scope, 15, { name: "PS5 1", kind: "ps5" });
  const b = await saveStation(scope, 15, { name: "VIP", kind: "ps5", room: "vip" });
  if (!a.ok || !b.ok) throw new Error("station");
  await saveRate(scope, { name: "زوجي", mode: "hour", controllers: 2, price: 6000 });
  await saveRate(scope, { name: "4 يدات", mode: "hour", controllers: 4, price: 9000 });
  await saveRate(scope, { name: "VIP", mode: "hour", room: "vip", price: 12000 });
  await saveRate(scope, { name: "الماتش", mode: "match", price: 1500 });
  const p = await saveProduct(scope, { name: "كولا", price: 1500, costPrice: 700, variants: [{ valueIds: [], stock: 50 }] }, { limits: { maxProducts: null, maxStaff: null, customRoles: false } as never });
  if (!p.ok) throw new Error(p.error);
  const cola = (await scope.from(t.productVariants, eq(t.productVariants.productId, p.data.id)))[0]!.id;
  const s = await addStaff(db, r.data.storeId, u!.id, { name: "مشرف", phone: `0927${String(++seq).padStart(6, "0")}`, password: "staff-pass-1", role: "lounge_supervisor" }, { maxStaff: null, customRoles: false });
  if (!s.ok) throw new Error(s.error);
  const staffId = (await db.select().from(storeMembers).where(eq(storeMembers.id, s.data.memberId)).get())!.userId;
  const dev = await createDevice(scope, { line: "lounge", name: "شاشة الصالة", branchId: branch.id }, u!.id);
  if (!dev.ok) throw new Error(dev.error);
  return { storeId: r.data.storeId, ownerId: u!.id, staffId, scope, dc: (await loadDeviceContext(db, dev.data.token))!, ps1: a.data.id, ps2: b.data.id, cola };
}

const ev = (s: Shop, sessionId: string, at: number, type: string, data?: Record<string, unknown>) => ({ kind: "lounge.event", payload: { clientId: type === "start" ? sessionId : uid(), at, userId: s.staffId, sessionId, type, data } });

let a: Shop, b: Shop;
beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  for (const p of LINE_PLANS) await db.insert(plans).values({ ...p, price: p.prices.m1 ?? 0 });
  a = await lounge("play-a");
  b = await lounge("play-b");
});
afterAll(() => close());

describe("جلسات الصالة عبر المزامنة", () => {
  it("بداية ← زيادة يد ← بار ← نهاية ← فاتورة بنفس مبلغ السيرفر", async () => {
    const sid = uid(), t0 = Date.now() - 90 * MIN;
    const res = await applyOps(a.dc, [
      ev(a, sid, t0, "start", { stationId: a.ps1, controllers: 2 }),
      ev(a, sid, t0 + 30 * MIN, "controllers", { controllers: 4 }),
      ev(a, sid, t0 + 40 * MIN, "item", { lineId: "c1", variantId: a.cola, name: "كولا", quantity: 2, unitPrice: 1500 }),
      ev(a, sid, t0 + 90 * MIN, "end"),
    ] as never);
    expect(res.map((r) => r.status)).toEqual(["applied", "applied", "applied", "applied"]);
    const [sess] = await a.scope.from(t.loungeSessions, eq(t.loungeSessions.id, sid));
    expect(sess).toMatchObject({ status: "ended", minutes: 90, charge: 3000 + 9000 });
    const sale = await applyOps(a.dc, [{ kind: "sale", payload: {
      clientId: uid(), at: t0 + 91 * MIN, userId: a.staffId, sourceType: "lounge_session", sourceId: sid,
      lines: [{ kind: "service", name: "جلسة PS5 1", quantity: 1, unitPrice: 12000, refId: sid }, { variantId: a.cola, name: "كولا", quantity: 2, unitPrice: 1500 }],
      payments: [{ method: "cash", amount: 20000 }], total: 15000,
    } }] as never);
    expect(sale[0]!.status).toBe("applied");
    expect((sale[0]!.data as { needsReview: boolean; review: string[] }).review).toEqual([]);
    const [paid] = await a.scope.from(t.loungeSessions, eq(t.loungeSessions.id, sid));
    expect(paid!.status).toBe("paid");
    // حدث متأخر بعد الدفع ما يغيرش شي
    const late = await applyOps(a.dc, [ev(a, sid, t0 + 95 * MIN, "match")] as never);
    expect(late[0]!.data).toMatchObject({ ignored: true });
  });

  it("مبلغ مختلف عن حساب السيرفر يتعلم للمراجعة، وجهاز نشاط ثاني ما يشوفش أجهزتنا", async () => {
    const sid = uid(), t0 = Date.now() - 60 * MIN;
    await applyOps(a.dc, [ev(a, sid, t0, "start", { stationId: a.ps2, controllers: 2 }), ev(a, sid, t0 + 60 * MIN, "end")] as never);
    const sale = await applyOps(a.dc, [{ kind: "sale", payload: { clientId: uid(), at: Date.now(), userId: a.staffId, sourceType: "lounge_session", sourceId: sid, lines: [{ kind: "service", name: "VIP", quantity: 1, unitPrice: 5000, refId: sid }], payments: [{ method: "cash", amount: 5000 }], total: 5000 } }] as never);
    expect((sale[0]!.data as { review: string[] }).review.join(" ")).toContain("المحسوب 12000");
    const other = await applyOps(b.dc, [ev(b, uid(), Date.now(), "start", { stationId: a.ps1, controllers: 2 })] as never);
    expect(other[0]!.status).toBe("rejected");
  });

  it("باقة الساعات: البيع يشحن الدقايق والجلسة تتدفع منها", async () => {
    const cust = await upsertCustomer(a.scope, { phone: "0913334455", name: "لاعب دائم" });
    const pack = await savePack(a.scope, { name: "10 ساعات", minutes: 600, price: 50000 });
    if (!pack.ok) throw new Error(pack.error);
    await applyOps(a.dc, [{ kind: "sale", payload: { clientId: uid(), at: Date.now(), userId: a.staffId, customerId: cust.id, lines: [{ kind: "service", name: "باقة 10 ساعات", quantity: 1, unitPrice: 50000, refId: pack.data.id }], payments: [{ method: "cash", amount: 50000 }], total: 50000 } }] as never);
    expect((await balanceOf(a.scope, cust.id)).minutes).toBe(600);
    const sid = uid(), t0 = Date.now() - 60 * MIN;
    await applyOps(a.dc, [ev(a, sid, t0, "start", { stationId: a.ps1, controllers: 2, customerId: cust.id }), ev(a, sid, t0 + 60 * MIN, "end")] as never);
    const sale = await applyOps(a.dc, [{ kind: "sale", payload: { clientId: uid(), at: Date.now(), userId: a.staffId, customerId: cust.id, minutesUsed: 60, sourceType: "lounge_session", sourceId: sid, lines: [{ kind: "service", name: "جلسة", quantity: 1, unitPrice: 0, refId: sid }], payments: [{ method: "cash", amount: 0 }], total: 0 } }] as never);
    expect((sale[0]!.data as { review: string[] }).review).toEqual([]);
    expect((await balanceOf(a.scope, cust.id)).minutes).toBe(540);
  });

  it("بيانات جهاز الصالة فيها الأجهزة والأسعار والجلسات المفتوحة", async () => {
    const sid = uid();
    await applyOps(a.dc, [ev(a, sid, Date.now() - 5 * MIN, "start", { stationId: a.ps1, controllers: 2, limitKind: "time", limitValue: 30 })] as never);
    const boot = await posBootstrap(a.dc);
    expect(boot.lounge?.stations.map((s) => s.name)).toEqual(["PS5 1", "VIP"]);
    expect(boot.lounge?.rates.length).toBe(4);
    expect(boot.lounge?.sessions.some((s) => s.id === sid)).toBe(true);
    const floor = await floorStatus(a.scope);
    expect(floor.find((s) => s.id === a.ps1)?.status).toBe("busy");
    expect(floor.find((s) => s.id === a.ps1)?.remaining).toBeGreaterThanOrEqual(24); // 30 − 5 (والدقيقة الجارية تنحسب)
    expect(floor.find((s) => s.id === a.ps2)?.status).toBe("available");
    await applyOps(a.dc, [ev(a, sid, Date.now(), "cancel", { reason: "تجربة" })] as never);
  });
});

describe("الأجهزة والحجوزات والصيانة", () => {
  it("حد الأجهزة في الباقة، والصيانة تمنع الحجز", async () => {
    expect((await saveStation(a.scope, 2, { name: "ثالث", kind: "xbox" })).ok).toBe(false);
    expect(await openMaintenance(a.scope, { stationId: a.ps2, issue: "يد بايظة", cost: 15000 }, a.ownerId)).toEqual({ ok: true, data: undefined });
    const soon = Date.now() + 2 * 3_600_000;
    expect((await createBooking(a.scope, { stationId: a.ps2, name: "علي", phone: "0912223344", startsAt: soon, minutes: 60 }, "public")).ok).toBe(false);
    const [m] = await a.scope.from(t.stationMaintenance);
    await closeMaintenance(a.scope, m!.id, 20000);
    const ok1 = await createBooking(a.scope, { stationId: a.ps2, name: "علي", phone: "0912223344", startsAt: soon, minutes: 60 }, "public");
    expect(ok1.ok && ok1.data.message).toContain("حجزك");
    const clash = await createBooking(a.scope, { stationId: a.ps2, name: "سالم", phone: "0915556677", startsAt: soon + 30 * MIN, minutes: 60 }, "public");
    expect(clash).toMatchObject({ ok: false });
    expect((await createBooking(a.scope, { stationId: a.ps2, name: "سالم", phone: "0915556677", startsAt: soon + 60 * MIN, minutes: 60 }, "public")).ok).toBe(true);
    expect((await createBooking(b.scope, { stationId: a.ps2, name: "x", phone: "0915556677", startsAt: soon, minutes: 60 }, "public")).ok).toBe(false); // عزل
  });
});

describe("البطولات", () => {
  it("تسجيل، دفع، قرعة، نتايج، بطل", async () => {
    const tr = await saveTournament(a.scope, { name: "كأس الصالة", game: "FC 26", format: "knockout", maxPlayers: 4, entryFee: 10000 });
    if (!tr.ok) throw new Error(tr.error);
    const ids: string[] = [];
    for (const [i, n] of ["أحمد", "علي", "سالم", "خالد"].entries()) {
      const j = await joinTournament(a.scope, tr.data.id, { name: n, phone: `09100000${10 + i}` }, { public: true });
      if (!j.ok) throw new Error(j.error);
      ids.push(j.data.id);
    }
    expect((await joinTournament(a.scope, tr.data.id, { name: "زايد", phone: "0910000099" }, { public: true })).ok).toBe(false); // اكتملت
    expect((await joinTournament(a.scope, tr.data.id, { name: "مكرر", phone: "0910000010" }, { public: true })).ok).toBe(false);
    expect((await startTournament(a.scope, tr.data.id)).ok).toBe(false); // ما دفعوش
    for (const id of ids) await setPlayerPaid(a.scope, id, true);
    expect((await startTournament(a.scope, tr.data.id, () => 0.5)).ok).toBe(true);
    let full = (await getTournament(a.scope, tr.data.id))!;
    for (const m of full.matches.filter((x) => x.round === 1)) await recordMatch(a.scope, tr.data.id, 1, m.slot, 3, 1);
    full = (await getTournament(a.scope, tr.data.id))!;
    const final = full.matches.find((m) => m.round === 2)!;
    expect(final.p1 && final.p2).toBeTruthy();
    const r = await recordMatch(a.scope, tr.data.id, 2, 0, 2, 4);
    expect(r).toMatchObject({ ok: true, data: { finished: true } });
    full = (await getTournament(a.scope, tr.data.id))!;
    expect(full.status).toBe("finished");
    expect(full.champion).toBe(final.p2);
    expect(await getTournament(b.scope, tr.data.id)).toBeNull(); // عزل
  });
});
