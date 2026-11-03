import type { Metadata, Viewport } from "next";
import { KioskScreen } from "@/components/gym/kiosk-screen";

// الكشك عند الباب: صفحة ثابتة تقرا التوكن من الرابط (#t=…)
export const metadata: Metadata = { title: "دخول النادي", robots: { index: false } };
export const viewport: Viewport = { themeColor: "#0D263E", width: "device-width", initialScale: 1 };
export const dynamic = "force-static";

export default function KioskPage() {
  return <KioskScreen />;
}
