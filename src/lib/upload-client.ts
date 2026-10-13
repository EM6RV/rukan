export type UploadedImage = { id: string; url: string; width: number | null; height: number | null };
export type UploadKind = "product" | "logo" | "banner" | "category";

const MAX_BYTES = 8 * 1024 * 1024;

/** يرفع صورة لـ /api/media. يرمي Error برسالة عربية جاهزة للعرض. */
export async function uploadImage(file: File, kind: UploadKind): Promise<UploadedImage> {
  if (!file.type.startsWith("image/")) throw new Error("اختار ملف صورة (JPG أو PNG أو WebP).");
  if (file.size > MAX_BYTES) throw new Error("الصورة كبيرة بزيادة. الحد الأقصى 8 ميغا.");
  const body = new FormData();
  body.set("file", file);
  body.set("kind", kind);
  let res: Response;
  try {
    res = await fetch("/api/media", { method: "POST", body });
  } catch {
    throw new Error("ما قدرنا نوصلوا للسيرفر. تأكد من الإنترنت وجرّب.");
  }
  const json = (await res.json().catch(() => ({}))) as Partial<UploadedImage> & { error?: string };
  if (!res.ok || !json.id) throw new Error(json.error ?? "فشل رفع الصورة.");
  return json as UploadedImage;
}
