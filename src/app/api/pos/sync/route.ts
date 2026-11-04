import { cookies } from "next/headers";
import { getDb } from "@/db";
import { DEVICE_COOKIE } from "@/server/pos/branches";
import { deviceContext } from "@/server/pos/device-auth";
import { applyOps, MAX_OPS_PER_SYNC } from "@/server/pos/sync";
import { sameOriginError } from "@/server/origin";
import { hitRateLimit } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

/** مزامنة طابور عمليات الجهاز (idempotent: كل clientId يتطبق مرة وحدة) */
export async function POST(request: Request) {
  const csrf = sameOriginError(request);
  if (csrf) return csrf;
  const db = getDb();
  const dc = await deviceContext(db, (await cookies()).get(DEVICE_COOKIE)?.value);
  if (!dc) return Response.json({ error: "الجهاز مش مفعّل أو اتلغى." }, { status: 401 });
  const limit = await hitRateLimit(db, `pos-sync:${dc.device.id}`, { limit: 120, windowMs: 60_000 });
  if (!limit.allowed) return Response.json({ error: "طلبات كثيرة. حنعاودوا بعد شوية." }, { status: 429 });
  if (Number(request.headers.get("content-length") ?? 0) > 2_000_000) return Response.json({ error: "الدفعة كبيرة بزيادة." }, { status: 413 });
  let body: { ops?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "بيانات غلط." }, { status: 400 }); }
  const ops = Array.isArray(body.ops) ? body.ops.slice(0, MAX_OPS_PER_SYNC) : [];
  const results = await applyOps(dc, ops);
  return Response.json({ results, serverTime: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
