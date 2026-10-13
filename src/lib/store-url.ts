// رابط المتجر العام. إنتاج: https://slug.rukn.ly — تطوير محلي: /s/slug على نفس الأصل.
export function storeUrl(slug: string, env: { ROOT_DOMAIN: string; APP_URL: string }): string {
  const root = env.ROOT_DOMAIN.toLowerCase();
  const isLocal = root.startsWith("localhost") || /^\d{1,3}(\.\d{1,3}){3}/.test(root);
  if (isLocal) return `${env.APP_URL.replace(/\/$/, "")}/s/${slug}`;
  return `https://${slug}.${root}`;
}

export const whatsappShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
