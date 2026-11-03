import { describe, expect, it } from "vitest";
import { itemsTotal, minutesCover, overlaps, rateAt, remainingMinutes, sessionCharge, sessionState, type LoungeRate, type SessionEvent, type StationRef } from "@/lib/lounge-pricing";
import { championOf, knockoutBracket, leagueSchedule, setResult, standings } from "@/lib/tournament";

const MIN = 60_000;
// الثلاثاء 3 نوفمبر 2026، 14:00 بتوقيت ليبيا (12:00 UTC)
const T0 = Date.UTC(2026, 10, 3, 12, 0);
const rate = (o: Partial<LoungeRate> & Pick<LoungeRate, "price">): LoungeRate => ({ id: Math.random().toString(36), mode: "hour", stationKind: null, room: null, controllers: null, days: [], fromMinute: 0, toMinute: 1440, priority: 0, ...o });
const RATES: LoungeRate[] = [
  rate({ price: 6000, controllers: 2 }), // ساعة زوجي 6 د.ل
  rate({ price: 9000, controllers: 4 }), // 4 يدات 9 د.ل
  rate({ price: 4000, controllers: 1 }), // فردي 4 د.ل
  rate({ price: 7500, controllers: 2, fromMinute: 18 * 60, toMinute: 24 * 60 }), // الليل أغلى
  rate({ price: 12000, controllers: 2, room: "vip" }),
  rate({ mode: "match", price: 1500 }), // الماتش 1.5 د.ل
];
const STATIONS: Record<string, StationRef> = { a: { id: "a", kind: "ps5", room: "normal" }, b: { id: "b", kind: "ps5", room: "vip" } };
let n = 0;
const ev = (min: number, type: SessionEvent["type"], data?: Record<string, unknown>): SessionEvent => ({ id: `e${++n}`, at: T0 + min * MIN, type, data });
const NO_ROUND = { roundTo: 0 as const, minMinutes: 0, startFee: 0 };

describe("أسعار الصالة", () => {
  it("أخص سعر يغلب (VIP، الليل، عدد اليدات)", () => {
    expect(rateAt(RATES, { mode: "hour", kind: "ps5", room: "normal", controllers: 2 }, T0)?.price).toBe(6000);
    expect(rateAt(RATES, { mode: "hour", kind: "ps5", room: "normal", controllers: 2 }, T0 + 5 * 3_600_000)?.price).toBe(7500); // 19:00
    expect(rateAt(RATES, { mode: "hour", kind: "ps5", room: "vip", controllers: 2 }, T0)?.price).toBe(12000);
    expect(rateAt(RATES, { mode: "hour", kind: "ps5", room: "normal", controllers: 3 }, T0)).toBeNull();
  });

  it("ساعة زوجي كاملة، والتقريب والحد الأدنى", () => {
    const s = sessionState([ev(0, "start", { stationId: "a", controllers: 2 }), ev(60, "end")]);
    expect(sessionCharge(s, STATIONS, RATES, NO_ROUND, T0).total).toBe(6000);
    const short = sessionState([ev(0, "start", { stationId: "a", controllers: 2 }), ev(7, "end")]);
    const c = sessionCharge(short, STATIONS, RATES, { roundTo: 5, minMinutes: 15, startFee: 500 }, T0);
    expect(c.billedMinutes).toBe(15);
    expect(c.total).toBe(1500 + 500); // ربع ساعة + رسوم بداية
    const r = sessionCharge(sessionState([ev(0, "start", { stationId: "a", controllers: 2 }), ev(31, "end")]), STATIONS, RATES, { roundTo: 10, minMinutes: 0, startFee: 0 }, T0);
    expect(r.billedMinutes).toBe(40);
    expect(r.total).toBe(4000);
  });

  it("زيادة يد في نص الجلسة: كل جزء بسعره، والإيقاف ما يتحسبش", () => {
    const s = sessionState([
      ev(0, "start", { stationId: "a", controllers: 2 }), ev(30, "controllers", { controllers: 4 }),
      ev(60, "pause"), ev(90, "resume"), ev(120, "end"),
    ]);
    const c = sessionCharge(s, STATIONS, RATES, NO_ROUND, T0);
    expect(c.minutes).toBe(90);
    expect(c.total).toBe(3000 + 4500 + 4500); // نص ساعة زوجي + ساعة 4 يدات (منها نص بعد الاستئناف)
  });

  it("يتحسب بسعر الوقت: جلسة تعدي الساعة 18:00", () => {
    const s = sessionState([ev(3 * 60 + 30, "start", { stationId: "a", controllers: 2 }), ev(4 * 60 + 30, "end")]); // 17:30 → 18:30
    expect(sessionCharge(s, STATIONS, RATES, NO_ROUND, T0).total).toBe(3000 + 3750);
  });

  it("النقل لجهاز VIP يكمل الحساب بسعره", () => {
    const s = sessionState([ev(0, "start", { stationId: "a", controllers: 2 }), ev(30, "move", { stationId: "b" }), ev(60, "end")]);
    expect(s.stationId).toBe("b");
    expect(sessionCharge(s, STATIONS, RATES, NO_ROUND, T0).total).toBe(3000 + 6000);
  });

  it("بالماتش: عداد +1 و-1", () => {
    const s = sessionState([ev(0, "start", { stationId: "a", controllers: 2, mode: "match" }), ev(10, "match"), ev(20, "match"), ev(25, "match", { delta: -1 }), ev(30, "match"), ev(40, "end")]);
    const c = sessionCharge(s, STATIONS, RATES, NO_ROUND, T0);
    expect(c.matches).toBe(2);
    expect(c.total).toBe(3000);
  });

  it("الجلسة المحددة بوقت أو مبلغ والتمديد، والبار، ودقايق الباقة", () => {
    const s = sessionState([ev(0, "start", { stationId: "a", controllers: 2, limitKind: "time", limitValue: 60 }), ev(10, "extend", { value: 30 }),
      ev(12, "item", { lineId: "x", name: "بيبسي", quantity: 2, unitPrice: 1500 }), ev(13, "item", { lineId: "y", name: "شيبس", quantity: 1, unitPrice: 1000 }), ev(14, "item", { lineId: "y", remove: true })]);
    const c = sessionCharge(s, STATIONS, RATES, NO_ROUND, T0 + 50 * MIN);
    expect(remainingMinutes(s, c, 6000)).toBe(40);
    expect(itemsTotal(s)).toBe(3000);
    const amount = sessionState([ev(0, "start", { stationId: "a", controllers: 2, limitKind: "amount", limitValue: 6000 })]);
    expect(remainingMinutes(amount, sessionCharge(amount, STATIONS, RATES, NO_ROUND, T0 + 20 * MIN), 6000)).toBe(40);
    expect(minutesCover({ minutes: 60, billedMinutes: 60, matches: 0, time: 6000, match: 0, startFee: 0, total: 6000, missingRate: false }, 30)).toEqual({ used: 30, covered: 3000 });
  });

  it("الحجوزات ما تتداخلش", () => {
    expect(overlaps({ startsAt: 0, endsAt: 60 }, { startsAt: 59, endsAt: 120 })).toBe(true);
    expect(overlaps({ startsAt: 0, endsAt: 60 }, { startsAt: 60, endsAt: 120 })).toBe(false);
  });
});

describe("البطولات", () => {
  it("خروج المغلوب: 5 لاعبين = شجرة 8 بثلاث bye، والفايز يترفع", () => {
    let b = knockoutBracket(["p1", "p2", "p3", "p4", "p5"]);
    expect(b.filter((s) => s.round === 1)).toHaveLength(4);
    expect(b.filter((s) => s.round === 1 && s.winnerId).length).toBe(3); // bye
    const real = b.find((s) => s.round === 1 && s.player1Id && s.player2Id)!;
    const r = setResult(b, 1, real.slot, 3, 1);
    expect(r.ok).toBe(true);
    if (r.ok) b = r.slots;
    expect(b.filter((s) => s.round === 2).every((s) => s.player1Id && s.player2Id)).toBe(true);
    expect(setResult(b, 2, 0, 1, 1).ok).toBe(false); // تعادل
    for (const s of b.filter((x) => x.round === 2)) { const x = setResult(b, 2, s.slot, 2, 0); if (x.ok) b = x.slots; }
    const f = setResult(b, 3, 0, 0, 1);
    expect(f.ok && championOf(f.slots)).toBeTruthy();
  });

  it("الدوري: كل واحد مع الكل والترتيب", () => {
    const s = leagueSchedule(["a", "b", "c", "d"]);
    expect(s).toHaveLength(6);
    const pairs = new Set(s.map((m) => [m.player1Id, m.player2Id].sort().join("-")));
    expect(pairs.size).toBe(6);
    for (const m of s) { m.score1 = m.player1Id === "a" || m.player2Id === "a" ? (m.player1Id === "a" ? 2 : 0) : 1; m.score2 = m.player1Id === "a" || m.player2Id === "a" ? (m.player2Id === "a" ? 2 : 0) : 1; }
    const t = standings(["a", "b", "c", "d"], s);
    expect(t[0]).toMatchObject({ playerId: "a", points: 9, won: 3 });
    expect(leagueSchedule(["a", "b", "c"])).toHaveLength(3);
  });
});
