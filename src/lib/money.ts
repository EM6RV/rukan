// الفلوس كلها أعداد صحيحة بالدرهم (1 د.ل = 1000 درهم). ما نستعمل float أبداً.

export const DIRHAMS_PER_DINAR = 1000;

export const dinarToDirham = (dinar: number): number => Math.round(dinar * DIRHAMS_PER_DINAR);

/** يعرض المبلغ بالدينار: 12500 → "12.5 د.ل" و 49000 → "49 د.ل" */
export function formatMoney(dirhams: number): string {
  const dinar = dirhams / DIRHAMS_PER_DINAR;
  const text = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3, useGrouping: true }).format(dinar);
  return `${text} د.ل`;
}
