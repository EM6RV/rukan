import { getProduct } from "@/server/storefront/data";
import { decodeKey, isStoreOpen, loadStore } from "@/server/storefront/request";

export const dynamic = "force-dynamic";

/** العرض السريع: تفاصيل منتج ظاهر من كاش المتجر المفتوح (نفس بيانات صفحة المنتج العامة) */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string; slug: string }> }) {
  const { key, slug } = await params;
  const sf = await loadStore(decodeKey(key));
  if (!sf || !isStoreOpen(sf)) return Response.json({ error: "المتجر غير متاح" }, { status: 404 });
  const product = await getProduct(sf.id, decodeKey(slug));
  if (!product) return Response.json({ error: "المنتج غير موجود" }, { status: 404 });
  return Response.json({ product }, { headers: { "Cache-Control": "public, max-age=30" } });
}
