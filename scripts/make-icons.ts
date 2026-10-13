// يولّد أيقونات التطبيق (favicon, apple-touch, PWA) من public/brand/rukn-app-icon.png
import sharp from "sharp";

const src = "public/brand/rukn-app-icon.png";
const jobs: [string, number][] = [
  ["src/app/icon.png", 512],
  ["src/app/apple-icon.png", 180],
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
];
for (const [out, size] of jobs) {
  await sharp(src).resize(size, size, { fit: "contain", background: "#ffffff" }).png({ compressionLevel: 9 }).toFile(out);
  console.log("✓", out);
}
// أيقونة maskable: مساحة أمان 20% حول اللوجو
await sharp(src)
  .resize(410, 410, { fit: "contain", background: "#ffffff" })
  .extend({ top: 51, bottom: 51, left: 51, right: 51, background: "#ffffff" })
  .png({ compressionLevel: 9 })
  .toFile("public/icons/icon-maskable-512.png");
console.log("✓ public/icons/icon-maskable-512.png");
