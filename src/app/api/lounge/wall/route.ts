import { getDb } from "@/db";
import { canUse } from "@/lib/entitlements";
import { wallData } from "@/server/lounge/wall";
import { deviceContext } from "@/server/pos/device-auth";
import { hitRateLimit } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

/** شاشة الحائط: توكن جهاز «wall» في الرابط (صلاحية عرض بس: حالة الأجهزة والبطولة والعروض) */
export async function GET(request: Request) {
  const db = getDb();
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const dc = await deviceContext(db, token);
  if (!dc || dc.device.kind !== "wall" || dc.device.line !== "lounge") return Response.json({ error: "الرابط مش صحيح أو اتلغى." }, { status: 401 });
  const limit = await hitRateLimit(db, `wall:${dc.device.id}`, { limit: 40, windowMs: 60_000 });
  if (!limit.allowed) return Response.json({ error: "طلبات كثيرة." }, { status: 429 });
  if (!dc.lines.lounge.subscribed || dc.lines.lounge.state === "suspended" || !canUse(dc.lines.lounge.limits ?? {}, "wallScreen")) return Response.json({ error: "شاشة الحائط مش ضمن الباقة أو الاشتراك منتهي." }, { status: 403 });
  return Response.json(await wallData(dc.scope, dc.store), { headers: { "Cache-Control": "no-store" } });
}
