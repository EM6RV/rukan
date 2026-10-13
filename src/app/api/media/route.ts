import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { media } from "@/db/schema/platform";
import { IMAGE_PRESETS, MAX_UPLOAD_BYTES, MediaError, saveImage } from "@/server/media";
import { sameOriginError } from "@/server/origin";
import { hitRateLimit } from "@/server/ratelimit";
import { getStorage } from "@/server/storage";
import { actionContext } from "@/server/store-context";

export const dynamic = "force-dynamic";

const MAX_MEDIA_PER_STORE = 3000; // حماية من إساءة الاستخدام

const KINDS = ["product", "logo", "banner", "category"] as const;
type Kind = (typeof KINDS)[number];
const presetFor = (kind: Kind) => (kind === "category" ? IMAGE_PRESETS.product : IMAGE_PRESETS[kind]);

const fail = (error: string, status: number) => Response.json({ error }, { status });

// رفع صورة للمتجر الحالي (عضو بصلاحية media). الحقول: file, kind
export async function POST(request: Request) {
  const csrf = sameOriginError(request);
  if (csrf) return csrf;

  const auth = await actionContext("media", { write: true, allowUnfinishedOnboarding: true });
  if (!auth.ok) return fail(auth.error, 403);
  const { ctx } = auth;

  const db = getDb();
  const limit = await hitRateLimit(db, `upload:user:${ctx.user.id}`, { limit: 120, windowMs: 10 * 60_000 });
  if (!limit.allowed) return fail("رفعت صور كثيرة. استنى شوية وجرّب.", 429);

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) return fail("الصورة كبيرة بزيادة. الحد الأقصى 8 ميغا.", 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("الطلب غير صحيح.", 400);
  }
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "product") as Kind;
  if (!(file instanceof File) || !KINDS.includes(kind)) return fail("اختار صورة صحيحة.", 400);

  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(media).where(eq(media.storeId, ctx.store.id));
  if (n >= MAX_MEDIA_PER_STORE) return fail("وصلت للحد الأقصى من الصور. امسح صور قديمة.", 400);

  try {
    const saved = await saveImage(db, getStorage(), {
      storeId: ctx.store.id,
      buffer: Buffer.from(await file.arrayBuffer()),
      preset: presetFor(kind),
    });
    return Response.json({ id: saved.id, url: `/api/media/${saved.id}`, width: saved.width, height: saved.height });
  } catch (e) {
    if (e instanceof MediaError) return fail(e.message, 400);
    console.error("media upload failed", e);
    return fail("صار خطأ أثناء رفع الصورة. جرّب مرة ثانية.", 500);
  }
}
