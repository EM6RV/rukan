import { z } from "zod";
import { getDb } from "@/db";
import { getClientIp } from "@/server/auth/current";
import { normalizeSource, recordVisit, VISIT_KINDS } from "@/server/analytics";
import { sameOriginError } from "@/server/origin";
import { hitRateLimit } from "@/server/ratelimit";
import { decodeKey, isStoreOpen, loadStore } from "@/server/storefront/request";
import { forStore, t } from "@/server/tenant";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const body = z.object({ kind: z.enum(VISIT_KINDS), slug: z.string().max(120).nullish(), source: z.string().max(80).nullish(), session: z.boolean().default(false) });

/** عدّاد زيارات بدون كوكيز: لا نخزن IP ولا معرّف زائر، فقط أعداد مجمعة باليوم */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  if (sameOriginError(req)) return new Response(null, { status: 204 }); // طلبات من مواقع ثانية تتجاهل بهدوء
  const { key } = await params;
  const p = body.safeParse(await req.json().catch(() => null));
  const sf = await loadStore(decodeKey(key));
  if (!p.success || !sf || !isStoreOpen(sf)) return new Response(null, { status: 204 });
  const ip = (await getClientIp()) ?? "unknown";
  const limit = await hitRateLimit(getDb(), `hit:${sf.id}:${ip}`, { limit: 240, windowMs: 10 * 60_000 });
  if (!limit.allowed) return new Response(null, { status: 204 });
  try {
    const scope = forStore(getDb(), sf.id);
    const productId = p.data.kind === "product" && p.data.slug ? (await scope.from(t.products, eq(t.products.slug, p.data.slug)).limit(1))[0]?.id ?? null : null;
    await recordVisit(scope, { kind: p.data.kind, source: normalizeSource(p.data.source), productId, session: p.data.session });
  } catch { /* العدّاد إضافة: فشله ما يأثرش على الزبون */ }
  return new Response(null, { status: 204 });
}
