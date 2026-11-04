// رابط المتجر العام. إنتاج بدومين: https://slug.rukn.ly — تطوير محلي أو دومين Render المجاني (*.onrender.com ما يدعم ساب دومينات): /s/slug على نفس الأصل.
export type StoreUrlRequest = { host: string; proto: string };

const stripPort = (h: string) => h.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");

/**
 * لو عرفنا الدومين اللي البياع فاتح منه اللوحة (request) وما كان هو ROOT_DOMAIN نفسه (أو www)،
 * نبني الرابط على نفس الأصل بـ /s/slug بدل ما نعتمد على إعدادات APP_URL/ROOT_DOMAIN.
 * هكذا الرابط يشتغل حتى لو الإعدادات غلط (مثلاً بقيت rukn.ly وإنت على *.onrender.com).
 */
export function storeUrl(slug: string, env: { ROOT_DOMAIN: string; APP_URL: string }, request?: StoreUrlRequest): string {
  const root = env.ROOT_DOMAIN.toLowerCase();
  if (request) {
    const h = stripPort(request.host);
    const r = stripPort(root);
    if (h !== r && h !== `www.${r}`) return `${request.proto}://${request.host}/s/${slug}`;
  }
  const pathMode = root.startsWith("localhost") || /^\d{1,3}(\.\d{1,3}){3}/.test(root) || root.replace(/:\d+$/, "").endsWith(".onrender.com");
  if (pathMode) return `${env.APP_URL.replace(/\/$/, "")}/s/${slug}`;
  return `https://${slug}.${root}`;
}

export const whatsappShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
