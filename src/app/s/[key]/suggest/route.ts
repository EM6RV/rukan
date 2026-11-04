import { getCatalog } from "@/server/storefront/data";
import { decodeKey, isStoreOpen, loadStore } from "@/server/storefront/request";

export const dynamic = "force-dynamic";

/** اقتراحات البحث: أول 6 منتجات تطابق الكلمة (من الكاش) */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 40);
  const sf = await loadStore(decodeKey(key));
  if (!sf || !isStoreOpen(sf) || q.length < 2) return Response.json({ items: [] });
  const r = await getCatalog(sf.id, { q, pageSize: 6, sort: "newest" });
  return Response.json({ items: r.items.map((p) => ({ slug: p.slug, name: p.name, price: p.price, thumb: p.thumb })) }, { headers: { "Cache-Control": "public, max-age=60" } });
}
