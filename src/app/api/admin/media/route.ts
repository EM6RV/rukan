import { and, count, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { media, stores } from "@/db/schema/platform";
import { adminContext } from "@/server/auth/admin-action";
import { IMAGE_PRESETS, MAX_UPLOAD_BYTES, MediaError, saveImage } from "@/server/media";
import { sameOriginError } from "@/server/origin";
import { getStorage } from "@/server/storage";

export const dynamic = "force-dynamic";
const fail = (error: string, status: number) => Response.json({ error }, { status });

// رفع صور من الأدمن: kind=site (عامة، وسائط المنصة) أو kind=receipt مع storeId (إيصال اشتراك خاص بالمتجر)
export async function POST(request: Request) {
  const csrf = sameOriginError(request);
  if (csrf) return csrf;
  const a = await adminContext();
  if (!a.ok) return fail(a.error, 403);

  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) return fail("الصورة كبيرة بزيادة. الحد الأقصى 8 ميغا.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("الطلب غير صحيح.", 400); }
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "site");
  if (!(file instanceof File) || !["site", "receipt"].includes(kind)) return fail("اختار صورة صحيحة.", 400);

  const db = getDb();
  let storeId: string | null = null;
  if (kind === "receipt") {
    storeId = String(form.get("storeId") ?? "");
    if (!storeId || !(await db.select({ id: stores.id }).from(stores).where(eq(stores.id, storeId)).get())) return fail("المتجر غير موجود.", 400);
  } else {
    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(media).where(and(isNull(media.storeId)));
    if (n >= 500) return fail("وصلت للحد الأقصى من صور الموقع.", 400);
  }
  try {
    const saved = await saveImage(db, getStorage(), {
      storeId, buffer: Buffer.from(await file.arrayBuffer()),
      preset: kind === "receipt" ? IMAGE_PRESETS.receipt : IMAGE_PRESETS.banner, isPrivate: kind === "receipt",
    });
    return Response.json({ id: saved.id, url: `/api/media/${saved.id}`, width: saved.width, height: saved.height });
  } catch (e) {
    if (e instanceof MediaError) return fail(e.message, 400);
    console.error("admin upload failed", e);
    return fail("صار خطأ أثناء رفع الصورة. جرّب مرة ثانية.", 500);
  }
}
