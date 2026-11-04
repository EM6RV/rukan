// سياسة أمان المحتوى (CSP) وترويسات الأمان. CSP للإنتاج فقط (التطوير يحتاج eval لـ React refresh).
// script-src فيها 'unsafe-inline' لأن Next يحقن سكربتات inline للـ hydration وسكربت الثيم؛ باقي القيود (object/base/form/frame/connect) فعّالة.
export function buildCsp(): string {
  const pixels = ["https://connect.facebook.net", "https://www.facebook.com", "https://*.facebook.com", "https://analytics.tiktok.com", "https://*.tiktok.com"];
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${pixels.slice(0, 1).join(" ")} https://analytics.tiktok.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${pixels.join(" ")}`,
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function securityHeaders(production: boolean) {
  const base = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
  if (!production) return base;
  return [...base, { key: "Content-Security-Policy", value: buildCsp() }, { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }];
}
