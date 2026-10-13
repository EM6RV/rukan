import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import type { Db } from "@/db";
import { adapters } from "@/server/storage";
import { MediaError, deleteMedia, processImage, readMedia, saveImage } from "@/server/media";
import { makeStore, makeTestDb } from "./helpers/db";

let db: Db;
let close: () => void;
let storeId: string;
beforeAll(async () => {
  ({ db, close } = await makeTestDb());
  storeId = (await makeStore(db, "media-store")).store.id;
});
afterAll(() => close());

const makePng = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 193, g: 158, b: 88 } } }).png().toBuffer();

describe("معالجة الصور", () => {
  it("يحوّل لـ WebP ويصغّر للحد الأقصى بدون تكبير", async () => {
    const big = await processImage(await makePng(3000, 2000));
    expect(big.mime).toBe("image/webp");
    expect(Math.max(big.width, big.height)).toBe(1600);
    expect((await sharp(big.buffer).metadata()).format).toBe("webp");

    const small = await processImage(await makePng(200, 100));
    expect([small.width, small.height]).toEqual([200, 100]);
  });

  it("يرفض ملف مش صورة حتى لو امتداده png", async () => {
    await expect(processImage(Buffer.from("هذا نص مش صورة"))).rejects.toBeInstanceOf(MediaError);
  });

  it("يرفض SVG (خطر XSS)", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    await expect(processImage(svg)).rejects.toBeInstanceOf(MediaError);
  });

  it("يرفض الملفات الكبيرة والفاضية", async () => {
    await expect(processImage(Buffer.alloc(9 * 1024 * 1024))).rejects.toThrow(/كبيرة/);
    await expect(processImage(Buffer.alloc(0))).rejects.toThrow(/فاضي/);
  });
});

describe("التخزين", () => {
  it("turso: يحفظ في القاعدة ويقرا ويمسح", async () => {
    const saved = await saveImage(db, adapters.turso, { storeId, buffer: await makePng(800, 600) });
    const found = await readMedia(db, saved.id);
    expect(found?.row.driver).toBe("turso");
    expect(found?.row.isPrivate).toBe(false);
    expect(found?.buffer.length).toBe(saved.size);
    await deleteMedia(db, saved.id);
    expect(await readMedia(db, saved.id)).toBeNull();
  });

  it("الإيصالات تتحفظ خاصة", async () => {
    const saved = await saveImage(db, adapters.turso, { storeId, buffer: await makePng(100, 100), isPrivate: true });
    expect((await readMedia(db, saved.id))?.row.isPrivate).toBe(true);
  });
});
