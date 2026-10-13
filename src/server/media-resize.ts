import sharp from "sharp";
import { MEDIA_WIDTHS } from "@/lib/media-url";

const ALLOWED = new Set<number>(MEDIA_WIDTHS);
const MAX_ENTRIES = 400;
const MAX_BYTES = 96 * 1024 * 1024;

// كاش بسيط في الذاكرة (LRU) للصور المصغرة. الصورة الأصلية ما تتغير (id ثابت)، فالكاش آمن.
const cache = new Map<string, Buffer>();
let bytes = 0;

export const parseWidth = (raw: string | null): number | null => {
  const n = Number(raw);
  return raw && Number.isInteger(n) && ALLOWED.has(n) ? n : null;
};

export async function resizedWebp(id: string, original: Buffer, width: number): Promise<Buffer> {
  const key = `${id}:${width}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // نحركه لآخر القائمة (الأحدث استعمالاً)
    return hit;
  }
  const out = await sharp(original).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  cache.set(key, out);
  bytes += out.length;
  while (cache.size > MAX_ENTRIES || bytes > MAX_BYTES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    bytes -= cache.get(oldest)!.length;
    cache.delete(oldest);
  }
  return out;
}
