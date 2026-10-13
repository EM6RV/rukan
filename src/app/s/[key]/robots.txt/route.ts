import { getRequestContext, isStoreOpen, loadStore } from "@/server/storefront/request";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const sf = await loadStore(key);
  const { origin, base } = await getRequestContext(key);
  const open = !!sf && isStoreOpen(sf);
  const body = open
    ? ["User-agent: *", "Allow: /", `Disallow: ${base}/cart`, `Disallow: ${base}/checkout`, `Disallow: ${base}/track`, `Disallow: ${base}/order/`, `Disallow: ${base}/search`, "", `Sitemap: ${origin}${base}/sitemap.xml`, ""].join("\n")
    : "User-agent: *\nDisallow: /\n";
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
