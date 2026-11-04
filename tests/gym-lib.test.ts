import { describe, expect, it } from "vitest";
import { DEFAULT_GYM_CONFIG, canFreeze, checkEntry, classMoment, currentMembership, daysLeft, endOfMembership, installmentSchedule, nextClassDays, overdueInstallments, prorateUpgrade, ptCommission, unfreeze, type MembershipLike } from "@/lib/gym";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 3, 12, 0); // الثلاثاء 14:00 ليبيا
const mem = (o: Partial<MembershipLike> = {}): MembershipLike => ({ id: "m", status: "active", startsAt: NOW - 10 * DAY, endsAt: NOW + 20 * DAY, visitsLeft: null, section: "mixed", fromMinute: null, toMinute: null, planName: "شهري", ...o });
const entry = (o: Partial<Parameters<typeof checkEntry>[0]> = {}) => checkEntry({ now: NOW, member: { section: "men", status: "active" }, membership: mem(), lastOkAt: null, overdue: 0, config: DEFAULT_GYM_CONFIG, ...o });

describe("حسابات النادي", () => {
  it("الأيام الباقية ونهاية الاشتراك", () => {
    expect(daysLeft(NOW + 3 * DAY, NOW)).toBe(3);
    expect(daysLeft(NOW - DAY, NOW)).toBe(-1);
    expect(endOfMembership(NOW, 30) - NOW).toBeGreaterThan(29 * DAY);
  });

  it("التجميد يمدد النهاية بالأيام المسموحة بس", () => {
    const m = { endsAt: NOW + 20 * DAY, frozenDays: 0, frozenSince: NOW - 5 * DAY, maxFreezeDays: 14 };
    expect(unfreeze(m, NOW)).toMatchObject({ added: 5, frozenDays: 5, endsAt: NOW + 25 * DAY });
    expect(unfreeze({ ...m, frozenSince: NOW - 30 * DAY, frozenDays: 4 }, NOW)).toMatchObject({ added: 10, frozenDays: 14 }); // المتبقي 10
    expect(unfreeze({ ...m, frozenSince: null }, NOW).added).toBe(0);
    expect(canFreeze({ status: "active", maxFreezeDays: 14, frozenDays: 14, endsAt: NOW + DAY }, NOW)).toBe(false);
    expect(canFreeze({ status: "active", maxFreezeDays: 14, frozenDays: 0, endsAt: NOW + DAY }, NOW)).toBe(true);
  });

  it("الترقية في نص المدة بالفرق (prorate)", () => {
    const old = { price: 30_000, startsAt: NOW - 15 * DAY, endsAt: NOW + 15 * DAY };
    const r = prorateUpgrade(old, 80_000, NOW);
    expect(r.daysLeft).toBeGreaterThanOrEqual(15);
    expect(r.credit).toBeGreaterThan(14_000);
    expect(r.due).toBe(80_000 - r.credit);
    expect(prorateUpgrade(old, 5_000, NOW).due).toBe(0);
  });

  it("الأقساط: توزيع والباقي في الأول، والمتأخر بعد المهلة", () => {
    const s = installmentSchedule(100_000, 3, NOW);
    expect(s.map((x) => x.amount)).toEqual([33_334, 33_333, 33_333]);
    expect(s.reduce((a, x) => a + x.amount, 0)).toBe(100_000);
    expect(s[1]!.dueAt - s[0]!.dueAt).toBe(30 * DAY);
    const list = [{ dueAt: NOW - 5 * DAY, paidAt: null }, { dueAt: NOW - 2 * DAY, paidAt: null }, { dueAt: NOW - 9 * DAY, paidAt: NOW }];
    expect(overdueInstallments(list, NOW, 3)).toHaveLength(1);
  });

  it("فحص الدخول: المقبول والمرفوض بأسبابه", () => {
    expect(entry()).toMatchObject({ ok: true, daysLeft: 20 });
    expect(entry({ membership: null })).toMatchObject({ ok: false, code: "none" });
    expect(entry({ membership: mem({ endsAt: NOW - DAY }) })).toMatchObject({ ok: false, code: "expired" });
    expect(entry({ membership: mem({ status: "frozen" }) })).toMatchObject({ ok: false, code: "frozen" });
    expect(entry({ membership: mem({ visitsLeft: 0 }) })).toMatchObject({ ok: false, code: "visits" });
    expect(entry({ membership: mem({ fromMinute: 6 * 60, toMinute: 12 * 60 }) })).toMatchObject({ ok: false, code: "time" }); // الصباحي والحين 14:00
    expect(entry({ overdue: 1 })).toMatchObject({ ok: false, code: "overdue" });
    expect(entry({ lastOkAt: NOW - 30 * 60_000 })).toMatchObject({ ok: false, code: "again" });
    expect(entry({ lastOkAt: NOW - 3 * 3_600_000 }).ok).toBe(true);
    expect(entry({ member: { section: "men", status: "archived" } })).toMatchObject({ ok: false, code: "archived" });
    expect(entry({ membership: mem({ endsAt: NOW + 2 * DAY }) })).toMatchObject({ ok: true, warn: expect.stringContaining("بعد 2 يوم") });
    expect(entry({ membership: mem({ visitsLeft: 5 }) })).toMatchObject({ ok: true, visitsLeft: 4 });
  });

  it("ساعات النساء في النادي المختلط", () => {
    const config = { ...DEFAULT_GYM_CONFIG, womenHours: [{ days: [2], fromMinute: 13 * 60, toMinute: 16 * 60 }] }; // الثلاثاء 1-4 العصر
    expect(entry({ config, member: { section: "men", status: "active" } })).toMatchObject({ ok: false, code: "section" });
    expect(entry({ config, member: { section: "women", status: "active" } }).ok).toBe(true);
    const later = { ...config, womenHours: [{ days: [2], fromMinute: 18 * 60, toMinute: 20 * 60 }] };
    expect(entry({ config: later, member: { section: "women", status: "active" } })).toMatchObject({ ok: false, code: "section" });
    expect(entry({ config: later, member: { section: "men", status: "active" } }).ok).toBe(true);
    // بدون ساعات نساء: القسم يتطابق مع الاشتراك
    expect(entry({ membership: mem({ section: "women" }), member: { section: "men", status: "active" } })).toMatchObject({ ok: false, code: "section" });
  });

  it("عمولة المدرب، واختيار الاشتراك الحالي، وتواريخ الحصص", () => {
    expect(ptCommission("percent", 40, 10_000)).toBe(4_000);
    expect(ptCommission("fixed", 3_000, 10_000)).toBe(3_000);
    const a = mem({ id: "a", endsAt: NOW + 5 * DAY }), b = mem({ id: "b", endsAt: NOW + 40 * DAY }), old = mem({ id: "c", endsAt: NOW - 3 * DAY });
    expect(currentMembership([b, a, old], NOW)?.id).toBe("a");
    expect(currentMembership([old], NOW)?.id).toBe("c");
    expect(currentMembership([mem({ status: "cancelled" })], NOW)).toBeNull();
    const days = nextClassDays(4, NOW, 2); // الخميس
    expect(days).toEqual(["2026-11-05", "2026-11-12"]);
    expect(classMoment("2026-11-05", 18 * 60)).toBe(Date.UTC(2026, 10, 5, 16, 0));
  });
});
