import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { media } from "@/db/schema/platform";
import { getClientIp } from "@/server/auth/current";
import { IMAGE_PRESETS, MAX_UPLOAD_BYTES, MediaError, saveImage } from "@/server/media";
import { sameOriginError } from "@/server/origin";
import { hitRateLimit } from "@/server/ratelimit";
import { getStorage } from "@/server/storage";
import { decodeKey, isStoreOpen, loadStore } from "@/server/storefront/request";

export const dynamic = "force-dynamic";

const fail = (error: string, status: number) => Response.json({ error }, { status });

// رفع إيصال تحويل مصرفي من زبون المتجر (بدون حساب). الإيصال يتحفظ خاص (ما يظهرش علناً).
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const csrf = sameOriginError(request);
  if (csrf) return csrf;

  const sf = await loadStore(decodeKey((await params).key));
  if (!sf || !isStoreOpen(sf) || !sf.payments.some((p) => p.method === "bank_transfer")) return fail("التحويل المصرفي غير متاح.", 404);

  const db = getDb();
  const ip = (await getClientIp()) ?? "unknown";
  const limit = await hitRateLimit(db, `receipt:${sf.id}:${ip}`, { limit: 8, windowMs: 60 * 60_000 });
  if (!limit.allowed) return fail("رفعت صور كثيرة. جرّب بعد شوية.", 429);

  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) return fail("الصورة كبيرة بزيادة. الحد الأقصى 8 ميغا.", 413);
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(media).where(and(eq(media.storeId, sf.id), eq(media.isPrivate, true)));
  if (n >= 5000) return fail("تعذر رفع الإيصال حالياً. تواصل مع المتجر.", 400);

  let form: FormData;
  try { form = await request.formData(); } catch { return fail("الطلب غير صحيح.", 400); }
  const file = form.get("file");
  if (!(file instanceof File)) return fail("اختار صورة الإيصال.", 400);

  try {
    const saved = await saveImage(db, getStorage(), { storeId: sf.id, buffer: Buffer.from(await file.arrayBuffer()), preset: IMAGE_PRESETS.receipt, isPrivate: true });
    return Response.json({ id: saved.id });
  } catch (e) {
    if (e instanceof MediaError) return fail(e.message, 400);
    console.error("receipt upload failed", e);
    return fail("صار خطأ أثناء الرفع. جرّب مرة ثانية.", 500);
  }
}
