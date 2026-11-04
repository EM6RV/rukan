import type { Metadata, Viewport } from "next";
import { WallScreen } from "@/components/lounge/wall-screen";

// شاشة الحائط للصالة: صفحة ثابتة تقرا التوكن من الرابط (#t=…) وتتحدث كل 5 ثواني
export const metadata: Metadata = { title: "شاشة الصالة", robots: { index: false } };
export const viewport: Viewport = { themeColor: "#0D263E", width: "device-width", initialScale: 1 };
export const dynamic = "force-static";

export default function TvPage() {
  return <WallScreen />;
}
