// حسابات النادي (محايدة): الاشتراكات والتجميد والترقية بالفرق والأقساط وفحص الدخول وعمولة المدرب.
const DAY = 86_400_000, LIBYA = 2 * 3_600_000;
export const libyaMinute = (ms: number) => { const d = new Date(ms + LIBYA); return { day: d.getUTCDay(), minute: d.getUTCHours() * 60 + d.getUTCMinutes() }; };
export const libyaDay = (ms: number) => new Date(ms + LIBYA).toISOString().slice(0, 10);
export const libyaDayStart = (ms: number) => Math.floor((ms + LIBYA) / DAY) * DAY - LIBYA;
const inWindow = (m: number, from: number, to: number) => (from <= to ? m >= from && m < to : m >= from || m < to);

export type Section = "men" | "women" | "mixed";
export const SECTION_LABELS: Record<Section, string> = { men: "رجال", women: "نساء", mixed: "مختلط" };

/** إعدادات النادي (تتخزن في posConfig.gym) */
export type GymConfig = {
  /** منع تكرار الدخول خلال X ساعة (0 = مطفي) */
  antiPassbackHours: number;
  /** مهلة القسط المتأخر قبل ما الدخول يتمنع (أيام) */
  installmentGraceDays: number;
  /** ساعات النساء في النادي المختلط: الأيام (فاضي = كل يوم) والوقت */
  womenHours: { days: number[]; fromMinute: number; toMinute: number }[];
  /** تنبيه انتهاء الاشتراك قبل (أيام) وغياب العضو بعد (أيام) */
  expiryNoticeDays: number;
  absentDays: number;
  /** ينقص من الحصة الباقية عند كل دخول ناجح (للاشتراك بالحصص) */
  autoCheckout: boolean;
};
export const DEFAULT_GYM_CONFIG: GymConfig = { antiPassbackHours: 2, installmentGraceDays: 3, womenHours: [], expiryNoticeDays: 3, absentDays: 10, autoCheckout: true };

export type MembershipLike = {
  id: string; status: "active" | "frozen" | "cancelled" | "replaced"; startsAt: number; endsAt: number; visitsLeft: number | null;
  section: Section; fromMinute: number | null; toMinute: number | null; planName: string;
};

/** الأيام الباقية (0 = ينتهي اليوم، سالب = منتهي) */
export const daysLeft = (endsAt: number, now: number) => Math.ceil((libyaDayStart(endsAt) - libyaDayStart(now)) / DAY);

/** نهاية اشتراك: البداية + المدة (تنتهي آخر اليوم) */
export const endOfMembership = (startsAt: number, days: number) => libyaDayStart(startsAt) + days * DAY - 1;

// ===== التجميد =====
/** الأيام اللي تنحسب من تجميد بدا في since لحد now، بحد أقصى المتبقي من حد النوع */
export function freezeDaysUsed(since: number, now: number, allowanceLeft: number): number {
  const d = Math.max(0, Math.ceil((now - since) / DAY));
  return Math.min(d, Math.max(0, allowanceLeft));
}
export function unfreeze(m: { endsAt: number; frozenDays: number; frozenSince: number | null; maxFreezeDays: number }, now: number) {
  if (m.frozenSince === null) return { endsAt: m.endsAt, frozenDays: m.frozenDays, added: 0 };
  const added = freezeDaysUsed(m.frozenSince, now, m.maxFreezeDays - m.frozenDays);
  return { endsAt: m.endsAt + added * DAY, frozenDays: m.frozenDays + added, added };
}
export const canFreeze = (m: { status: string; maxFreezeDays: number; frozenDays: number; endsAt: number }, now: number) =>
  m.status === "active" && m.maxFreezeDays - m.frozenDays > 0 && m.endsAt > now;

// ===== الترقية (prorate) =====
/** رصيد الاشتراك القديم = سعره × الأيام الباقية ÷ كل أيامه. الترقية = سعر الجديد − الرصيد (ما تنزلش عن 0) */
export function prorateUpgrade(old: { price: number; startsAt: number; endsAt: number }, newPrice: number, now: number) {
  const total = Math.max(1, Math.ceil((old.endsAt - libyaDayStart(old.startsAt) + 1) / DAY));
  const left = Math.max(0, Math.min(total, Math.ceil((old.endsAt - now) / DAY)));
  const credit = Math.round((old.price * left) / total);
  return { credit, due: Math.max(0, newPrice - credit), daysLeft: left };
}

// ===== الأقساط =====
/** قسّم المبلغ على n أقساط شهرية (30 يوم) من أول تاريخ، والباقي من التقسيم في أول قسط */
export function installmentSchedule(total: number, n: number, firstDue: number, everyDays = 30): { dueAt: number; amount: number }[] {
  const count = Math.max(1, Math.min(24, Math.floor(n)));
  const base = Math.floor(total / count), rest = total - base * count;
  return Array.from({ length: count }, (_, i) => ({ dueAt: firstDue + i * everyDays * DAY, amount: base + (i === 0 ? rest : 0) }));
}
export const overdueInstallments = <T extends { dueAt: number; paidAt: number | null }>(list: T[], now: number, graceDays: number) =>
  list.filter((i) => i.paidAt === null && i.dueAt + graceDays * DAY < now);

// ===== فحص الدخول =====
export type EntryInput = {
  now: number;
  member: { section: Section; status: "active" | "archived" };
  membership: MembershipLike | null;
  lastOkAt: number | null;
  overdue: number;
  config: GymConfig;
};
export type EntryResult = { ok: true; daysLeft: number; visitsLeft: number | null; warn: string | null } | { ok: false; reason: string; code: "none" | "expired" | "frozen" | "section" | "time" | "visits" | "overdue" | "again" | "archived" };

export function checkEntry(i: EntryInput): EntryResult {
  const { now, member, membership: m, config } = i;
  if (member.status === "archived") return { ok: false, code: "archived", reason: "العضو مؤرشف. كلّم الاستقبال." };
  if (!m) return { ok: false, code: "none", reason: "ما عندكش اشتراك ساري. جدّد من الاستقبال." };
  if (m.status === "frozen") return { ok: false, code: "frozen", reason: "اشتراكك مجمّد. كلّم الاستقبال لفك التجميد." };
  if (m.status !== "active" || m.endsAt < now) return { ok: false, code: "expired", reason: "انتهى اشتراكك. جدّد من الاستقبال." };
  if (m.startsAt > now) return { ok: false, code: "expired", reason: "اشتراكك يبدا من تاريخ لاحق." };
  if (m.visitsLeft !== null && m.visitsLeft <= 0) return { ok: false, code: "visits", reason: "خلصت حصصك. جدّد الاشتراك." };
  const c = libyaMinute(now);
  if (m.fromMinute !== null && m.toMinute !== null && !inWindow(c.minute, m.fromMinute, m.toMinute)) return { ok: false, code: "time", reason: "الاشتراك هذا لوقت ثاني (صباحي/مسائي)." };
  const inWomenHours = config.womenHours.some((w) => (!w.days.length || w.days.includes(c.day)) && inWindow(c.minute, w.fromMinute, w.toMinute));
  if (config.womenHours.length) {
    if (member.section === "men" && inWomenHours) return { ok: false, code: "section", reason: "هذا وقت النساء. الدخول للرجال بعد انتهاء ساعات النساء." };
    if (member.section === "women" && !inWomenHours) return { ok: false, code: "section", reason: "دخول النساء في ساعات النساء بس." };
  } else if (m.section !== "mixed" && member.section !== m.section) return { ok: false, code: "section", reason: "الاشتراك هذا لقسم ثاني." };
  if (i.overdue > 0) return { ok: false, code: "overdue", reason: "عندك قسط متأخر. ادفعه من الاستقبال." };
  if (config.antiPassbackHours > 0 && i.lastOkAt !== null && now - i.lastOkAt < config.antiPassbackHours * 3_600_000) return { ok: false, code: "again", reason: `دخلت قبل شوية. المحاولة الجاية بعد ${Math.ceil((config.antiPassbackHours * 3_600_000 - (now - i.lastOkAt)) / 60_000)} دقيقة.` };
  const left = daysLeft(m.endsAt, now);
  return { ok: true, daysLeft: left, visitsLeft: m.visitsLeft === null ? null : m.visitsLeft - 1, warn: left <= config.expiryNoticeDays ? `اشتراكك يخلص ${left <= 0 ? "اليوم" : `بعد ${left} يوم`}` : null };
}

// ===== المدربين =====
export const ptCommission = (kind: "percent" | "fixed", value: number, sessionPrice: number) => (kind === "percent" ? Math.round((sessionPrice * Math.min(100, value)) / 100) : value);

/** اختار أنسب اشتراك: الساري الأقرب انتهاءً، وإلا الأحدث */
export function currentMembership<T extends { status: string; startsAt: number; endsAt: number }>(list: T[], now: number): T | null {
  const live = list.filter((m) => (m.status === "active" || m.status === "frozen") && m.endsAt >= now);
  if (live.length) return [...live].sort((a, b) => a.endsAt - b.endsAt)[0]!;
  const past = list.filter((m) => m.status === "active" || m.status === "frozen").sort((a, b) => b.endsAt - a.endsAt);
  return past[0] ?? null;
}

// ===== الحصص =====
export const classMoment = (day: string, startMinute: number) => Date.parse(`${day}T00:00:00Z`) - LIBYA + startMinute * 60_000;
export function nextClassDays(weekday: number, now: number, count = 2): string[] {
  const out: string[] = [];
  for (let i = 0; i < 14 && out.length < count; i++) { const d = libyaDayStart(now) + i * DAY; if (libyaMinute(d + 12 * 3_600_000).day === weekday) out.push(libyaDay(d + 12 * 3_600_000)); }
  return out;
}
