import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { getEnv } from "@/lib/env";

export type Db = LibSQLDatabase<typeof schema>;

/** ينشئ اتصال جديد (للاختبارات والـ seed). التطبيق يستعمل getDb(). */
export function createDb(url: string, authToken?: string): { db: Db; client: Client } {
  const client = createClient({ url, authToken });
  const db = drizzle(client, { schema });
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
