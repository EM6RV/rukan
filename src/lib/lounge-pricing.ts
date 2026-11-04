// حسابات الصالة (محايدة: الجهاز بدون نت والسيرفر يحسبوا بنفس الدوال): الجلسة سجل أحداث، والمبلغ يتحسب منه.
// بالساعة: كل دقيقة بسعر لحظتها (عدد اليدات + الوقت/اليوم + نوع الجهاز والغرفة)، مع تقريب وحد أدنى ورسوم بداية.
// بالماتش: كل ماتش بسعر لحظته. المبالغ بالدرهم.
import type { StationKind } from "./line-setup";

export type Room = "normal" | "vip";
export type LoungeRate = {
  id: string; mode: "hour" | "match"; stationKind: StationKind | null; room: Room | null; controllers: number | null;
  price: number; days: number[]; fromMinute: number; toMinute: number; priority: number; isActive?: boolean;
};
export type LoungeRules = {
  /** تقريب الوقت لأعلى (0 = بالدقيقة) */
  roundTo: 0 | 5 | 10 | 15;
  /** أقل مدة تتحسب (دقايق) */
  minMinutes: number;
  /** رسوم بداية الجلسة */
  startFee: number;
};
export const DEFAULT_LOUNGE_RULES: LoungeRules = { roundTo: 5, minMinutes: 15, startFee: 0 };

export type StationRef = { id: string; kind: StationKind; room: Room };
export type SessionEvent = { id: string; at: number; type: SessionEventType; data?: Record<string, unknown> };
export type SessionEventType = "start" | "controllers" | "pause" | "resume" | "match" | "move" | "extend" | "item" | "end" | "cancel";

const LIBYA = 2 * 3_600_000;
const MIN = 60_000;
const clock = (ms: number) => { const d = new Date(ms + LIBYA); return { day: d.getUTCDay(), minute: d.getUTCHours() * 60 + d.getUTCMinutes() }; };
const inWindow = (m: number, from: number, to: number) => (from <= to ? m >= from && m < to : m >= from || m < to);

/** أخص سعر ينطبق في لحظة (نوع الجهاز + الغرفة + اليدات + الوقت)، والأولوية لو تساووا. null = ما فيش سعر */
export function rateAt(rates: LoungeRate[], q: { mode: "hour" | "match"; kind: StationKind; room: Room; controllers: number }, at: number): LoungeRate | null {
  const c = clock(at);
  let best: LoungeRate | null = null, bestScore = -1;
  for (const r of rates) {
    if (r.isActive === false || r.mode !== q.mode) continue;
    if (r.stationKind && r.stationKind !== q.kind) continue;
    if (r.room && r.room !== q.room) continue;
    if (r.controllers !== null && r.controllers !== q.controllers) continue;
    if (r.days.length && !r.days.includes(c.day)) continue;
    if (!inWindow(c.minute, r.fromMinute, r.toMinute)) continue;
    // الأخص يغلب: نوع الجهاز، الغرفة، اليدات، والوقت المحدد
    const score = (r.stationKind ? 8 : 0) + (r.room ? 4 : 0) + (r.controllers !== null ? 2 : 0) + (r.days.length || r.fromMinute !== 0 || r.toMinute !== 1440 ? 1 : 0);
    const total = score * 1000 + r.priority;
    if (total > bestScore) { best = r; bestScore = total; }
  }
  return best;
}

export type SessionState = {
  status: "running" | "paused" | "ended" | "cancelled";
  mode: "hour" | "match";
  stationId: string;
  controllers: number;
  startedAt: number;
  endedAt: number | null;
  /** فترات اللعب (بدون الإيقاف): الجهاز واليدات في كل فترة */
  segments: { from: number; to: number | null; stationId: string; controllers: number }[];
  matches: { at: number; delta: number; stationId: string; controllers: number }[];
  limit: { kind: "open" | "time" | "amount"; value: number | null };
  items: { id: string; variantId: string | null; name: string; quantity: number; unitPrice: number }[];
  customerId: string | null;
};

/** يبني حالة الجلسة من أحداثها (بالترتيب الزمني) */
export function sessionState(events: SessionEvent[]): SessionState {
  const ev = [...events].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const start = ev.find((e) => e.type === "start");
  const d = (start?.data ?? {}) as { stationId?: string; controllers?: number; mode?: "hour" | "match"; limitKind?: "open" | "time" | "amount"; limitValue?: number | null; customerId?: string | null };
  const st: SessionState = {
    status: "running", mode: d.mode ?? "hour", stationId: d.stationId ?? "", controllers: d.controllers ?? 1, startedAt: start?.at ?? 0, endedAt: null,
    segments: start ? [{ from: start.at, to: null, stationId: d.stationId ?? "", controllers: d.controllers ?? 1 }] : [],
    matches: [], limit: { kind: d.limitKind ?? "open", value: d.limitValue ?? null }, items: [], customerId: d.customerId ?? null,
  };
  const close = (at: number) => { const s = st.segments.at(-1); if (s && s.to === null) s.to = Math.max(s.from, at); };
  const open = (at: number) => st.segments.push({ from: at, to: null, stationId: st.stationId, controllers: st.controllers });
  for (const e of ev) {
    if (e === start || st.status === "ended" || st.status === "cancelled") continue;
    const x = (e.data ?? {}) as Record<string, unknown>;
    switch (e.type) {
      case "controllers": if (typeof x.controllers === "number" && x.controllers !== st.controllers) { if (st.status === "running") { close(e.at); st.controllers = x.controllers; open(e.at); } else st.controllers = x.controllers; } break;
      case "move": if (typeof x.stationId === "string" && x.stationId !== st.stationId) { if (st.status === "running") { close(e.at); st.stationId = x.stationId; open(e.at); } else st.stationId = x.stationId; } break;
      case "pause": if (st.status === "running") { close(e.at); st.status = "paused"; } break;
      case "resume": if (st.status === "paused") { open(e.at); st.status = "running"; } break;
      case "match": st.matches.push({ at: e.at, delta: typeof x.delta === "number" ? Math.sign(x.delta) || 1 : 1, stationId: st.stationId, controllers: st.controllers }); break;
      case "extend": if (typeof x.value === "number") st.limit = { kind: st.limit.kind === "open" ? "time" : st.limit.kind, value: (st.limit.value ?? 0) + x.value }; break;
      case "item": {
        const it = x as { lineId?: string; variantId?: string | null; name?: string; quantity?: number; unitPrice?: number; remove?: boolean };
        if (it.remove) st.items = st.items.filter((i) => i.id !== it.lineId);
        else if (it.name && typeof it.quantity === "number" && typeof it.unitPrice === "number") st.items.push({ id: it.lineId ?? e.id, variantId: it.variantId ?? null, name: it.name, quantity: it.quantity, unitPrice: it.unitPrice });
        break;
      }
      case "end": close(e.at); st.status = "ended"; st.endedAt = e.at; break;
      case "cancel": close(e.at); st.status = "cancelled"; st.endedAt = e.at; break;
    }
  }
  return st;
}

export type Charge = { minutes: number; billedMinutes: number; matches: number; time: number; match: number; startFee: number; total: number; missingRate: boolean };

/** مبلغ الجلسة لحد لحظة now (أو نهايتها) */
export function sessionCharge(state: SessionState, stations: Map<string, StationRef> | Record<string, StationRef>, rates: LoungeRate[], rules: LoungeRules, now: number): Charge {
  const st = (id: string) => (stations instanceof Map ? stations.get(id) : stations[id]);
  let exactMs = 0, money = 0, missing = false;
  let lastPerMin = 0;
  for (const s of state.segments) {
    const to = s.to ?? (state.status === "running" ? now : s.from);
    const ref = st(s.stationId);
    if (!ref) { missing = true; continue; }
    for (let t = s.from; t < to; t += MIN) {
      const part = Math.min(MIN, to - t);
      exactMs += part;
      if (state.mode !== "hour") continue;
      const r = rateAt(rates, { mode: "hour", kind: ref.kind, room: ref.room, controllers: s.controllers }, t);
      if (!r) { missing = true; continue; }
      lastPerMin = r.price / 60;
      money += (r.price / 60) * (part / MIN);
    }
  }
  const minutes = Math.ceil(exactMs / MIN - 1e-9);
  let billed = minutes;
  if (state.mode === "hour" && minutes > 0) {
    if (rules.roundTo > 0) billed = Math.ceil(minutes / rules.roundTo) * rules.roundTo;
    billed = Math.max(billed, rules.minMinutes);
    // الدقايق الزايدة من التقريب والحد الأدنى بسعر آخر دقيقة
    money += (billed - exactMs / MIN) * lastPerMin;
  }
  let matchMoney = 0, matchCount = 0;
  if (state.mode === "match") {
    for (const m of state.matches) {
      const ref = st(m.stationId);
      if (!ref) { missing = true; continue; }
      const r = rateAt(rates, { mode: "match", kind: ref.kind, room: ref.room, controllers: m.controllers }, m.at);
      if (!r) { missing = true; continue; }
      matchCount += m.delta;
      matchMoney += m.delta * r.price;
    }
    matchCount = Math.max(0, matchCount);
    matchMoney = Math.max(0, matchMoney);
  }
  const time = state.mode === "hour" ? Math.round(money) : 0;
  const startFee = state.segments.length ? rules.startFee : 0;
  return { minutes, billedMinutes: state.mode === "hour" ? billed : minutes, matches: matchCount, time, match: matchMoney, startFee, total: time + matchMoney + startFee, missingRate: missing };
}

/** الوقت الباقي (دقايق) لجلسة محددة بوقت أو مبلغ. null = مفتوحة */
export function remainingMinutes(state: SessionState, charge: Charge, perHour: number | null): number | null {
  if (state.limit.kind === "time" && state.limit.value !== null) return state.limit.value - charge.minutes;
  if (state.limit.kind === "amount" && state.limit.value !== null && perHour && perHour > 0) return Math.floor(((state.limit.value - charge.total) / perHour) * 60);
  return null;
}

/** مبلغ أصناف البار في الجلسة */
export const itemsTotal = (state: SessionState) => state.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

/** الجزء اللي تغطيه دقايق الباقة من مبلغ الوقت */
export function minutesCover(charge: Charge, balance: number): { used: number; covered: number } {
  if (charge.billedMinutes <= 0 || balance <= 0 || charge.time <= 0) return { used: 0, covered: 0 };
  const used = Math.min(balance, charge.billedMinutes);
  return { used, covered: Math.round((charge.time * used) / charge.billedMinutes) };
}

// ===== الحجوزات =====
export const overlaps = (a: { startsAt: number; endsAt: number }, b: { startsAt: number; endsAt: number }) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;
