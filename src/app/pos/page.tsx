import type { Metadata, Viewport } from "next";
import { PosApp } from "@/components/pos/pos-app";

// صفحة الكاشير: صفحة ثابتة (ما فيهاش بيانات من السيرفر) باش الـ service worker يخزنها ويفتحها بدون نت.
// البيانات كلها من /api/pos/bootstrap وتتخزن في IndexedDB، والجهاز يتعرف بكوكي التوكن.
export const metadata: Metadata = { title: "كاشير رُكن", manifest: "/pos.webmanifest", robots: { index: false } };
export const viewport: Viewport = { themeColor: "#0D263E", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };
export const dynamic = "force-static";

export default function PosPage() {
  return <PosApp />;
}
