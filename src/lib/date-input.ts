// حقول التاريخ (yyyy-mm-dd) ↔ ms بتوقيت ليبيا (UTC+2 بدون توقيت صيفي)
const OFFSET = 2 * 3_600_000;
const DAY = 86_400_000;

/** "start" = بداية اليوم، "end" = آخر ملي ثانية في اليوم. فاضي/غلط → null */
export function dateInputToMs(v: string, edge: "start" | "end"): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const ms = Date.parse(`${v}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return ms - OFFSET + (edge === "end" ? DAY - 1 : 0);
}

export function msToDateInput(ms: number | null): string {
  return ms === null ? "" : new Date(ms + OFFSET).toISOString().slice(0, 10);
}
