import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { platformSettings } from "@/db/schema/platform";

export async function getPlatformSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const row = await db.select().from(platformSettings).where(eq(platformSettings.key, key)).get();
  return row ? (row.value as T) : fallback;
}
