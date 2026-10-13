import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { getEnv } from "@/lib/env";
import { retryBusy } from "@/server/db-errors";

export type Db = LibSQLDatabase<typeof schema>;

// قواعد الملفات المحلية (تطوير/اختبارات): مشغّل SQLite متزامن، فمعاملتين كتابة بالتوازي ما ينفعش (تتعارض على القفل)
const localDbs = new WeakSet<object>();
const writeQueues = new WeakMap<object, Promise<unknown>>();

/** ينشئ اتصال جديد (للاختبارات والـ seed). التطبيق يستعمل getDb(). */
export function createDb(url: string, authToken?: string): { db: Db; client: Client } {
  const client = createClient({ url, authToken });
  const db = drizzle(client, { schema });
  if (url.startsWith("file:")) localDbs.add(db);
  return { db, client };
}

const globalForDb = globalThis as unknown as { __ruknDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__ruknDb) {
    const env = getEnv();
    const { db, client } = createDb(env.DATABASE_URL, env.DATABASE_AUTH_TOKEN);
    // مفاتيح العزل الأجنبية المركّبة ما تشتغلش لو الـ foreign keys مطفية
    void client.execute("PRAGMA foreign_keys = ON");
    globalForDb.__ruknDb = db;
  }
  return globalForDb.__ruknDb;
}

type TxFn<T> = Parameters<Db["transaction"]>[0] extends (tx: infer Tx) => Promise<unknown> ? (tx: Tx) => Promise<T> : never;

/**
 * معاملة كتابة آمنة للتزامن:
 *  - ملف محلي: نسلسل المعاملات داخل العملية بطابور غير متزامن (الانتظار على قفل SQLite نفسه يجمّد حدث Node ويسبب deadlock).
 *  - قاعدة بعيدة (Turso): السيرفر ينظم، ونعيد المحاولة لو رجع BUSY.
 * أي معاملة كتابة في التطبيق لازم تمر من هنا.
 */
export async function writeTransaction<T>(db: Db, fn: TxFn<T>): Promise<T> {
  const run = () => retryBusy(() => db.transaction(fn as never) as Promise<T>);
  if (!localDbs.has(db)) return run();
  const prev = writeQueues.get(db) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(run);
  writeQueues.set(db, next.catch(() => undefined));
  return next;
}
