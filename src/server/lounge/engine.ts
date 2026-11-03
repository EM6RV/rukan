// محرك الصالة في السيرفر: أحداث الجلسات من الأجهزة (بدون نت) تتجمع في الجلسة، والمبلغ يتعاود حسابه هنا من الأحداث.
// الدفع فاتورة عادية من محرك البيع (sourceType = lounge_session) والسيرفر يقارن مبلغ الوقت بحسابه.
import { eq, inArray } from "drizzle-orm";
import { DEFAULT_LOUNGE_RULES, minutesCover, sessionCharge, sessionState, type LoungeRate, type SessionEvent, type StationRef } from "@/lib/lounge-pricing";
import type { OpPayload } from "@/lib/pos-ops";
import { t, type StoreScopeCore } from "../tenant";
import { balanceOf, postCustomer } from "../pos/customers";
import { RejectError, RetryError, type Applied, type Audit, type PosEnv } from "../pos/engine";

type Tx = StoreScopeCore;

export async function loungeData(tx: Pick<Tx, "from">) {
  const [stationRows, rateRows] = await Promise.all([tx.from(t.stations), tx.from(t.loungeRates)]);
  const stations = new Map<string, StationRef>(stationRows.map((s) => [s.id, { id: s.id, kind: s.kind, room: s.room }]));
  const rates: LoungeRate[] = rateRows.map((r) => ({ id: r.id, mode: r.mode, stationKind: r.stationKind, room: r.room, controllers: r.controllers, price: r.price, days: r.days, fromMinute: r.fromMinute, toMinute: r.toMinute, priority: r.priority, isActive: r.isActive }));
  return { stationRows, stations, rates };
}

const rulesOf = (env: PosEnv) => env.config.lounge ?? { ...DEFAULT_LOUNGE_RULES, bookingGrace: 15 };

async function resolveCustomer(tx: Tx, id: unknown): Promise<string | null> {
  if (typeof id !== "string" || !id) return null;
  const [c] = await tx.from(t.customers, eq(t.customers.id, id)).limit(1);
  if (c) return c.id;
  const [op] = await tx.from(t.syncOps, eq(t.syncOps.clientId, id)).limit(1);
  const mapped = op?.result?.customerId;
  if (typeof mapped === "string") return mapped;
  throw new RetryError("الزبون لسه ما وصلش للسيرفر.");
}

/** يطبق حدث جلسة: البداية تنشئ الجلسة، وباقي الأحداث تنضاف وتتعاود الحسابات */
export async function loungeEvent(tx: Tx, env: PosEnv, p: OpPayload<"lounge.event">): Promise<Applied> {
  const audits: Audit[] = [];
  const { stationRows, stations, rates } = await loungeData(tx);
  const event: SessionEvent = { id: p.clientId, at: p.at, type: p.type, data: p.data };
  const [existing] = await tx.from(t.loungeSessions, eq(t.loungeSessions.id, p.sessionId)).limit(1);

  if (p.type === "start") {
    if (existing) return { data: { sessionId: existing.id, status: existing.status }, audits };
    const stationId = String(p.data?.stationId ?? "");
    const station = stationRows.find((s) => s.id === stationId);
    if (!station) throw new RejectError("الجهاز غير موجود.");
    if (station.branchId !== env.device.branchId) throw new RejectError("الجهاز مش في فرع الجهاز هذا.");
    const customerId = await resolveCustomer(tx, p.data?.customerId);
    const data = { ...p.data, customerId };
    const st = sessionState([{ ...event, data }]);
    await tx.insert(t.loungeSessions, {
      id: p.sessionId, branchId: station.branchId, stationId, customerId, mode: st.mode, limitKind: st.limit.kind, limitValue: st.limit.value,
      status: "running", events: [{ ...event, data }], startedAt: new Date(p.at), startedBy: p.userId, deviceId: env.device.id,
      bookingId: typeof p.data?.bookingId === "string" ? p.data.bookingId : null,
    });
    if (station.status === "maintenance") audits.push({ action: "lounge.start_on_maintenance", actorUserId: p.userId, entityType: "station", entityId: stationId });
    if (typeof p.data?.bookingId === "string") await tx.update(t.loungeBookings, { status: "arrived" }, eq(t.loungeBookings.id, p.data.bookingId));
    return { data: { sessionId: p.sessionId, status: "running" }, audits };
  }

  if (!existing) throw new RetryError("بداية الجلسة لسه ما وصلتش.");
  if (existing.status === "paid" || existing.status === "cancelled") {
    // الجلسة اتقفلت (جهاز ثاني دفعها): الحدث المتأخر يتسجل للتدقيق بس
    return { data: { sessionId: existing.id, status: existing.status, ignored: true }, audits };
  }
  if (p.type === "move") {
    const target = stationRows.find((s) => s.id === p.data?.stationId);
    if (!target || target.branchId !== existing.branchId) throw new RejectError("الجهاز اللي تبي تنقل له غير موجود.");
  }
  if (p.type === "cancel") {
    const by = env.members.get(p.userId)?.can("pos_approve") ? p.userId : p.approvedBy && env.members.get(p.approvedBy)?.can("pos_approve") ? p.approvedBy : null;
    audits.push({ action: "lounge.session_cancel", actorUserId: p.userId, entityType: "lounge_session", entityId: existing.id, meta: { approvedBy: by, approved: !!by, reason: p.data?.reason ?? null } });
  }
  const events = existing.events.some((e) => e.id === event.id) ? existing.events : [...existing.events, event];
  const st = sessionState(events);
  const charge = sessionCharge(st, stations, rates, rulesOf(env), p.at);
  await tx.update(t.loungeSessions, {
    events, stationId: st.stationId, status: st.status, limitKind: st.limit.kind, limitValue: st.limit.value,
    endedAt: st.endedAt ? new Date(st.endedAt) : null, minutes: charge.minutes, matches: charge.matches, charge: charge.total,
  }, eq(t.loungeSessions.id, existing.id));
  if (p.type === "end") audits.push({ action: "lounge.session_end", actorUserId: p.userId, entityType: "lounge_session", entityId: existing.id, meta: { minutes: charge.minutes, matches: charge.matches, charge: charge.total } });
  return { data: { sessionId: existing.id, status: st.status, charge: charge.total, minutes: charge.minutes }, audits };
}

/**
 * بعد ما فاتورة الصالة تتسجل: الجلسات المرتبطة تتقفل «مدفوعة»، ودقايق الباقة تنخصم، وباقات الساعات المباعة تنشحن.
 * review: ملاحظات المراجعة (مبلغ الجهاز غير اللي حسبه السيرفر…).
 */
export async function afterLoungeSale(tx: Tx, env: PosEnv, o: {
  saleId: string; customerId: string | null; userId: string; at: number; clientId: string; minutesUsed: number; review: string[];
  lines: { kind: string; refId: string | null; unitPrice: number; quantity: number; name: string }[];
}) {
  const refIds = [...new Set(o.lines.map((l) => l.refId).filter((x): x is string => !!x))];
  if (!refIds.length) return;
  const [sessions, packs] = await Promise.all([
    tx.from(t.loungeSessions, inArray(t.loungeSessions.id, refIds)),
    tx.from(t.loungePacks, inArray(t.loungePacks.id, refIds)),
  ]);
  if (sessions.length) {
    const { stations, rates } = await loungeData(tx);
    let minutesLeft = o.minutesUsed;
    if (minutesLeft > 0) {
      if (!o.customerId) { o.review.push("دقايق الباقة اتصرفت بدون زبون."); minutesLeft = 0; }
      else if (!env.features?.hourPacks) o.review.push("باقات الساعات مش ضمن باقتك.");
      else {
        const bal = await balanceOf(tx, o.customerId);
        if (bal.minutes < minutesLeft) o.review.push(`دقايق الباقة المصروفة (${minutesLeft}) أكثر من رصيد الزبون (${bal.minutes}).`);
      }
    }
    for (const s of sessions) {
      const line = o.lines.find((l) => l.refId === s.id);
      const st = sessionState(s.events);
      if (st.status === "running" || st.status === "paused") o.review.push(`جلسة «${line?.name ?? s.id}» اتدفعت قبل ما تتقفل.`);
      const charge = sessionCharge(st, stations, rates, rulesOf(env), st.endedAt ?? o.at);
      const cover = minutesCover(charge, minutesLeft);
      minutesLeft -= cover.used;
      const expected = charge.total - cover.covered;
      if (line && Math.abs(line.unitPrice * line.quantity - expected) > 0) o.review.push(`مبلغ جلسة «${line.name}» في الفاتورة ${line.unitPrice} والمحسوب ${expected}.`);
      if (charge.missingRate) o.review.push(`جلسة «${line?.name ?? s.id}» فيها وقت بدون سعر محدد.`);
      await tx.update(t.loungeSessions, { status: "paid", saleId: o.saleId, minutesUsed: cover.used, charge: charge.total, customerId: s.customerId ?? o.customerId }, eq(t.loungeSessions.id, s.id));
    }
    if (o.customerId && o.minutesUsed > 0) {
      await postCustomer(tx, { customerId: o.customerId, account: "minutes", amount: -o.minutesUsed, kind: "spend", refType: "sale", refId: o.saleId, clientId: `${o.clientId}:minutes`, actorUserId: o.userId, at: o.at, note: "دقايق من الباقة" });
    }
  }
  for (const pack of packs) {
    const qty = o.lines.filter((l) => l.refId === pack.id).reduce((a, l) => a + l.quantity, 0);
    if (!qty) continue;
    if (!o.customerId) { o.review.push(`باقة «${pack.name}» اتباعت بدون زبون (الدقايق ما اتشحنتش).`); continue; }
    if (!env.features?.hourPacks) o.review.push("باقات الساعات مش ضمن باقتك.");
    await postCustomer(tx, { customerId: o.customerId, account: "minutes", amount: pack.minutes * qty, kind: "topup", refType: "sale", refId: o.saleId, clientId: `${o.clientId}:pack:${pack.id}`, actorUserId: o.userId, at: o.at, note: `باقة ${pack.name}` });
  }
}
