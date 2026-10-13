import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb, type Db } from "@/db";
import { cities, plans, stores, users } from "@/db/schema/platform";

/** قاعدة مؤقتة (ملف) مع تطبيق كل الـ migrations والـ foreign keys شغالة. */
export async function makeTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "rukn-test-"));
  const { db, client } = createDb(`file:${join(dir, "test.db")}`);
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA foreign_keys = ON");
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  return {
    db,
    close() {
      client.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** ينشئ مستخدم + متجر جاهزين للاختبار */
export async function makeStore(db: Db, slug: string) {
  const [user] = await db
    .insert(users)
    .values({ phone: `09${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, name: `owner-${slug}`, passwordHash: "x" })
    .returning();
  const [store] = await db.insert(stores).values({ slug, name: slug, ownerUserId: user!.id }).returning();
  return { user: user!, store: store! };
}

export async function makeCity(db: Db, name = "طرابلس") {
  const [city] = await db.insert(cities).values({ nameAr: name, region: "west" }).returning();
  return city!;
}

export { plans };
