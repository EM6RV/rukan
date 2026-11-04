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

/**
 * للاختبارات اللي تعدّل حالة اشتراك المتجر مباشرة: يحدّث سطر «store» في line_subscriptions وأعمدة stores (النسخة) مع بعض.
 */
export async function patchStoreSub(db: Db, storeId: string, patch: Partial<Pick<typeof stores.$inferInsert, "status" | "planId" | "billingCycle" | "trialEndsAt" | "currentPeriodEnd">>) {
  const { and, eq } = await import("drizzle-orm");
  const { lineSubscriptions } = await import("@/db/schema/platform");
  if (Object.keys(patch).length) {
    await db.update(stores).set(patch).where(eq(stores.id, storeId));
    await db.update(lineSubscriptions).set(patch).where(and(eq(lineSubscriptions.storeId, storeId), eq(lineSubscriptions.line, "store")));
  }
}
