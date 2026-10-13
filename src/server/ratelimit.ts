import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import { rateLimits } from "@/db/schema/platform";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

/**
 * عدّاد بنافذة ثابتة، ذرّي (عملية SQL وحدة) وبيشتغل صح حتى لو فيه أكثر من instance.
 * المفتاح مثال: "login:phone:0912345678" أو "order:ip:1.2.3.4"
 */
export async function hitRateLimit(
  db: Db,
  key: string,
  opts: { limit: number; windowMs: number },
  now = Date.now(),
): Promise<RateLimitResult> {
  const expired = sql`${rateLimits.windowStart} < ${now - opts.windowMs}`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStart: new Date(now) })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${expired} THEN ${now} ELSE ${rateLimits.windowStart} END`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });

  const count = row?.count ?? 1;
  const windowEnd = (row?.windowStart.getTime() ?? now) + opts.windowMs;
  return {
    allowed: count <= opts.limit,
    remaining: Math.max(0, opts.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now) / 1000)),
  };
}

export async function resetRateLimit(db: Db, key: string) {
  await db.delete(rateLimits).where(sql`${rateLimits.key} = ${key}`);
}
