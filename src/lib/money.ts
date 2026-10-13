import { parseDecimal } from "./validation";

// الفلوس كلها أعداد صحيحة بالدرهم (1 د.ل = 1000 درهم). ما نستعمل float أبداً.

export const DIRHAMS_PER_DINAR = 1000;

export const dinarToDirham = (dinar: number): number => Math.round(dinar * DIRHAMS_PER_DINAR);

/** يعرض المبلغ بالدينار: 12500 → "12.5 د.ل" و 49000 → "49 د.ل" */
export function formatMoney(dirhams: number): string {
  const dinar = dirhams / DIRHAMS_PER_DINAR;
  const text = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3, useGrouping: true }).format(dinar);
  return `${text} د.ل`;
}

/** من نص يكتبه المستخدم بالدينار ("12.5" أو "١٢٫٥") إلى درهم صحيح. فاضي → null، غلط → undefined. */
export function inputToDirham(input: string): number | null | undefined {
  if (input.trim() === "") return null;
  const n = parseDecimal(input);
  if (n === null || !Number.isFinite(n)) return undefined;
  return Math.round(n * DIRHAMS_PER_DINAR);
}

/** من درهم إلى نص للحقل بالدينار بدون أصفار زايدة: 12500 → "12.5" */
export const dirhamToInput = (dirham: number | null | undefined): string =>
  dirham === null || dirham === undefined ? "" : String(dirham / DIRHAMS_PER_DINAR);
