import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = getEnv().APP_URL.replace(/\/$/, "");
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/admin", "/api", "/print", "/onboarding", "/kiosk", "/tv", "/pos"] }], sitemap: `${base}/sitemap.xml` };
}
