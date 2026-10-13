import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

// برنامج keep-alive يضرب هنا. ?db=1 يتأكد من القاعدة كمان.
export async function GET(request: Request) {
  const checkDb = new URL(request.url).searchParams.get("db") === "1";
  if (checkDb) {
    try {
      await getDb().run(sql`select 1`);
    } catch {
      return Response.json({ ok: false, db: "down" }, { status: 503 });
    }
  }
  return Response.json({ ok: true, ...(checkDb ? { db: "up" } : {}), time: new Date().toISOString() });
}
