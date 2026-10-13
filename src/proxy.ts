import { NextResponse, type NextRequest } from "next/server";
import { resolveHost } from "@/lib/host";

// التوجيه متعدد المتاجر: يقرا الـ Host ويعمل rewrite داخلي لواجهة المتجر /s/[key].
// خفيف عمداً (بدون قاعدة بيانات). التحقق من وجود المتجر يصير في صفحة المتجر نفسها.
const ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? "localhost:3000";

export function proxy(request: NextRequest) {
  const target = resolveHost(request.headers.get("host"), ROOT_DOMAIN);
  if (target.type === "platform") return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/s/${encodeURIComponent(target.key)}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // نستثني: api، ملفات Next، الأصول الثابتة
  matcher: ["/((?!api/|_next/|brand/|icons/|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|txt\\.map)$).*)"],
};
