import type { MetadataRoute } from "next";

/** تطبيق الأدمن: أيقونة لوحدها على الشاشة الرئيسية تفتح /admin مباشرة (غير تطبيق لوحة المتجر). */
export function adminManifest(): MetadataRoute.Manifest {
  return {
    id: "/admin",
    name: "رُكن — الأدمن",
    short_name: "أدمن رُكن",
    description: "لوحة إدارة منصة رُكن.",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    orientation: "portrait",
    dir: "rtl",
    lang: "ar",
    background_color: "#F7F8FA",
    theme_color: "#0D263E",
    shortcuts: [
      { name: "المتاجر", short_name: "المتاجر", url: "/admin/stores" },
      { name: "الاشتراكات والدفعات", short_name: "الدفعات", url: "/admin/payments" },
    ],
    icons: [
      { src: "/icons/admin-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/admin-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/admin-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
