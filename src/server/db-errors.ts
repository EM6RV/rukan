// drizzle يغلّف أخطاء SQLite، فنفحص رسالة السبب الأصلي
const text = (e: unknown) => `${(e as Error)?.message ?? ""} ${(e as { cause?: Error })?.cause?.message ?? ""}`;

export const isUniqueViolation = (e: unknown) => /UNIQUE constraint/i.test(text(e));
export const isFkViolation = (e: unknown) => /FOREIGN KEY constraint/i.test(text(e));

export const isBusy = (e: unknown) => /SQLITE_BUSY|database is locked/i.test(text(e));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * معاملات الكتابة المتزامنة في SQLite/libSQL: واحدة تكتب والباقي ياخذ BUSY فوراً.
 * نعيد المحاولة بتأخير قصير بدل ما المستخدم يشوف خطأ. آمن لأن المعاملة الفاشلة تتلغى كاملة (rollback).
 */
export async function retryBusy<T>(fn: () => Promise<T>, tries = 8): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isBusy(e) || attempt >= tries) throw e;
      await sleep(20 * attempt + Math.random() * 30);
    }
  }
}
