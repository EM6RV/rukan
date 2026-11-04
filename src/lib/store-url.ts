// رابط المتجر العام. إنتاج بدومين: https://slug.rukn.ly — تطوير محلي أو دومين Render المجاني (*.onrender.com ما يدعم ساب دومينات): /s/slug على نفس الأصل.
export function storeUrl(slug: string, env: { ROOT_DOMAIN: string; APP_URL: string }): string {
  const root = env.ROOT_DOMAIN.toLowerCase();
  const pathMode = root.startsWith("localhost") || /^\d{1,3}(\.\d{1,3}){3}/.test(root) || root.replace(/:\d+$/, "").endsWith(".onrender.com");
  if (pathMode) return `${env.APP_URL.replace(/\/$/, "")}/s/${slug}`;
  return `https://${slug}.${root}`;
}

export const whatsappShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
