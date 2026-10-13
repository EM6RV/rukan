// كل التواريخ تنعرض بتوقيت ليبيا وأرقام لاتينية (نفس باقي أرقام اللوحة)
const opts = { timeZone: "Africa/Tripoli", numberingSystem: "latn" } as const;
const dateTime = new Intl.DateTimeFormat("ar-LY", { ...opts, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const dateTimeYear = new Intl.DateTimeFormat("ar-LY", { ...opts, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const dateOnly = new Intl.DateTimeFormat("ar-LY", { ...opts, day: "numeric", month: "long", year: "numeric" });
const dayShort = new Intl.DateTimeFormat("ar-LY", { ...opts, weekday: "short", day: "numeric" });

export const formatDateTime = (ms: number | Date) => dateTime.format(ms);
export const formatDateTimeYear = (ms: number | Date) => dateTimeYear.format(ms);
export const formatDate = (ms: number | Date) => dateOnly.format(ms);
export const formatDayShort = (ms: number | Date) => dayShort.format(ms);

/** "قبل 5 دقايق" */
export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "الحين";
  const m = Math.floor(s / 60);
  if (m < 60) return `قبل ${m} ${m <= 10 ? "دقايق" : "دقيقة"}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} ${h <= 10 ? "ساعات" : "ساعة"}`;
  const d = Math.floor(h / 24);
  return `قبل ${d} ${d <= 10 ? "أيام" : "يوم"}`;
}
