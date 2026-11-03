import { getDb } from "@/db";
import { canUse } from "@/lib/entitlements";
import { checkin } from "@/server/gym/service";
import { sameOriginError } from "@/server/origin";
import { deviceContext } from "@/server/pos/device-auth";
import { hitRateLimit } from "@/server/ratelimit";

export const dynamic = "force-dynamic";

/** الكشك عند الباب: توكن جهاز «kiosk» (صلاحية الدخول بس). العضو يمسح QR أو يكتب رقمه ويشوف «أهلاً أحمد — باقي 12 يوم» */
export async function POST(request: Request) {
  const csrf = sameOriginError(request);
  if (csrf) return csrf;
  const db = getDb();
  let body: { t?: unknown; code?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "بيانات غلط." }, { status: 400 }); }
  const dc = await deviceContext(db, typeof body.t === "string" ? body.t : "");
  if (!dc || dc.device.kind !== "kiosk" || dc.device.line !== "gym") return Response.json({ error: "الرابط مش صحيح أو اتلغى." }, { status: 401 });
  const limit = await hitRateLimit(db, `gym-kiosk:${dc.device.id}`, { limit: 60, windowMs: 60_000 });
  if (!limit.allowed) return Response.json({ error: "محاولات كثيرة. استنى شوية." }, { status: 429 });
  if (!dc.lines.gym.subscribed || dc.lines.gym.state === "suspended" || dc.lines.gym.state === "expired" || !canUse(dc.lines.gym.limits ?? {}, "kiosk")) return Response.json({ error: "الكشك مش ضمن الباقة أو الاشتراك منتهي." }, { status: 403 });
  const code = typeof body.code === "string" ? body.code.slice(0, 80) : "";
  const out = await checkin(dc.scope, code, "kiosk", { deviceId: dc.device.id });
  // الكشك يعرض الاسم والنتيجة بس (بدون صورة ولا بيانات حساسة)
  return Response.json({ ok: out.result.ok, name: out.member?.name ?? null, reason: out.result.ok ? null : out.result.reason, daysLeft: out.result.ok ? out.result.daysLeft : null, visitsLeft: out.result.ok ? out.result.visitsLeft : null, warn: out.result.ok ? out.result.warn : null, shop: dc.store.name }, { headers: { "Cache-Control": "no-store" } });
}
