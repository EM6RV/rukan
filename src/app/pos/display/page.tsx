import type { Metadata, Viewport } from "next";
import { CustomerDisplay } from "@/components/pos/customer-display";

// شاشة الزبون: نافذة ثانية على جهاز الكاشير (شاشة ثانية موجهة للزبون). صفحة ثابتة تشتغل بدون نت.
export const metadata: Metadata = { title: "شاشة الزبون", robots: { index: false } };
export const viewport: Viewport = { themeColor: "#0D263E", width: "device-width", initialScale: 1 };
export const dynamic = "force-static";

export default function DisplayPage() {
  return <CustomerDisplay />;
}
