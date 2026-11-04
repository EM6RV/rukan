import { adminManifest } from "@/lib/admin-manifest";

// manifest تطبيق الأدمن. عام عمداً (ملف JSON ثابت بدون بيانات)، والمتصفح يجيبه بدون جلسة.
export function GET() {
  return Response.json(adminManifest(), { headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" } });
}
