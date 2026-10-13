import { decodeKey, getRequestContext, isStoreOpen, loadStore } from "@/server/storefront/request";
import { getSitemap } from "@/server/storefront/data";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// sitemap لكل متجر (الروابط حسب الدومين اللي دخل منه الزائر)
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const sf = await loadStore(key);
  if (!sf || !isStoreOpen(sf)) return new Response("Not found", { status: 404 });
  const { origin, base } = await getRequestContext(decodeKey(key));
  const data = await getSitemap(sf.id);
  const u = (path: string) => esc(`${origin}${base}${path}`);

  const urls = [
    `<url><loc>${u("/")}</loc><priority>1.0</priority></url>`,
    ...data.categories.map((c) => `<url><loc>${u(`/category/${encodeURIComponent(c.slug)}`)}</loc><priority>0.8</priority></url>`),
    ...data.products.map((p) => `<url><loc>${u(`/product/${encodeURIComponent(p.slug)}`)}</loc><lastmod>${new Date(p.updatedAt).toISOString()}</lastmod><priority>0.7</priority></url>`),
    ...data.pages.map((p) => `<url><loc>${u(`/page/${encodeURIComponent(p.slug)}`)}</loc><priority>0.3</priority></url>`),
  ];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=600" },
  });
}
