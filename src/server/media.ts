import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import sharp from "sharp";
import type { Db } from "@/db";
import { media } from "@/db/schema/platform";
import { adapters, type StorageAdapter } from "./storage";

export class MediaError extends Error {}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "heif"]); // بدون svg: خطر XSS

export type ImagePreset = { maxDimension: number; quality: number };
export const IMAGE_PRESETS = {
  product: { maxDimension: 1600, quality: 82 },
  logo: { maxDimension: 600, quality: 90 },
  banner: { maxDimension: 2000, quality: 80 },
  receipt: { maxDimension: 1600, quality: 75 },
} as const satisfies Record<string, ImagePreset>;

/** يتحقق إن الملف صورة فعلاً (من محتواه مش من الامتداد)، يصحح الاتجاه، يصغّر ويحوله WebP بدون metadata. */
export async function processImage(input: Buffer, preset: ImagePreset = IMAGE_PRESETS.product) {
  if (input.length === 0) throw new MediaError("الملف فاضي.");
  if (input.length > MAX_UPLOAD_BYTES) throw new MediaError("الصورة كبيرة بزيادة. الحد الأقصى 8 ميغا.");

  try {
    const meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
      throw new MediaError("نوع الملف مش مدعوم. ارفع صورة JPG أو PNG أو WebP.");
    }
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: preset.maxDimension, height: preset.maxDimension, fit: "inside", withoutEnlargement: true })
      .webp({ quality: preset.quality })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height, mime: "image/webp" as const };
  } catch (e) {
    if (e instanceof MediaError) throw e;
    throw new MediaError("ما قدرنا نقرا الصورة. تأكد إنها صورة سليمة وصغّر حجمها.");
  }
}

export async function saveImage(
  db: Db,
  storage: StorageAdapter,
  opts: { storeId: string | null; buffer: Buffer; preset?: ImagePreset; isPrivate?: boolean },
) {
  const processed = await processImage(opts.buffer, opts.preset);
  const id = nanoid(16);
  const stored = await storage.put({ id, buffer: processed.buffer, mime: processed.mime });
  const [row] = await db
    .insert(media)
    .values({
      id,
      storeId: opts.storeId,
      mime: processed.mime,
      size: processed.buffer.length,
      width: processed.width,
      height: processed.height,
      driver: storage.driver,
      data: stored.data,
      objectKey: stored.objectKey,
      isPrivate: opts.isPrivate ?? false,
    })
    .returning({ id: media.id, size: media.size, width: media.width, height: media.height });
  return row!;
}

export async function readMedia(db: Db, id: string) {
  const row = await db.select().from(media).where(eq(media.id, id)).get();
  if (!row) return null;
  const buffer = await adapters[row.driver].get(row);
  return buffer ? { row, buffer } : null;
}

export async function deleteMedia(db: Db, id: string) {
  const row = await db.select().from(media).where(eq(media.id, id)).get();
  if (!row) return;
  await adapters[row.driver].delete(row);
  await db.delete(media).where(eq(media.id, id));
}
