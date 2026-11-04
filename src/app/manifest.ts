import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "رُكن — لوحة التحكم",
    short_name: "رُكن",
    description: "ركنك في السوق… أونلاين.",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    categories: ["business", "shopping"],
    shortcuts: [{ name: "الطلبيات", short_name: "الطلبيات", url: "/dashboard/orders" }],
    dir: "rtl",
    lang: "ar",
    background_color: "#F7F8FA",
    theme_color: "#0D263E",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
