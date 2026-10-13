import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { storeMembers } from "@/db/schema/platform";
import { getCurrentUser } from "@/server/auth/current";
import { readMedia } from "@/server/media";

export const dynamic = "force-dynamic";

const notFound = () => new Response("غير موجود", { status: 404 });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const found = await readMedia(db, id);
  if (!found) return notFound();
  const { row, buffer } = found;

  if (row.isPrivate) {
    // الملفات الخاصة (إيصالات): أعضاء المتجر أو الأدمن فقط. نرجع 404 مش 403 علشان ما نكشفش وجودها.
    const user = await getCurrentUser();
    if (!user) return notFound();
    const allowed =
      user.platformRole === "admin" ||
      (row.storeId !== null &&
        !!(await db
          .select({ id: storeMembers.id })
          .from(storeMembers)
          .where(and(eq(storeMembers.storeId, row.storeId), eq(storeMembers.userId, user.id)))
          .get()));
    if (!allowed) return notFound();
  }

  const etag = `"${row.id}"`;
  const headers: Record<string, string> = {
    "Content-Type": row.mime,
    "Content-Length": String(buffer.length),
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": row.isPrivate ? "private, no-store" : "public, max-age=31536000, immutable",
  };
  if (!row.isPrivate && request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }
  return new Response(new Uint8Array(buffer), { headers });
}

