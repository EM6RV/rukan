import { getDb } from "@/db";
import { getClientIp } from "@/server/auth/current";
import { canUse } from "@/lib/entitlements";
import { createBooking, joinTournament } from "@/server/lounge/service";
import { sameOriginError } from "@/server/origin";
import { publicLine } from "@/server/public-line";
import { hitRateLimit } from "@/server/ratelimit";

export const dynamic = "force-dynamic";
const json = (b: object, s = 200) => Response.json(b, { status: s, headers: { "Cache-Control": "no-store" } });

/** الصفحة العامة للصالة: طلب حجز (يستنى تأكيد الصالة) وتسجيل في بطولة. rate limit بالـ IP وبالرقم + فحص الأصل */
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const csrf = sameOriginError(request);
  if (csrf) return csrf;
  const db = getDb();
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return json({ error: "بيانات غلط." }, 400); }
  const p = await publicLine(db, decodeURIComponent((await params).key), "lounge");
  if (!p) return json({ error: "الصالة مش متاحة." }, 404);
  const ip = (await getClientIp()) ?? "unknown";
  const [byIp, byPhone] = await Promise.all([
    hitRateLimit(db, `lounge-public:ip:${p.store.id}:${ip}`, { limit: 12, windowMs: 60 * 60_000 }),
    hitRateLimit(db, `lounge-public:ph:${p.store.id}:${String(b.phone ?? "").replace(/\D/g, "").slice(-9)}`, { limit: 6, windowMs: 60 * 60_000 }),
  ]);
  if (!byIp.allowed || !byPhone.allowed) return json({ error: "محاولات كثيرة. جرّب بعد شوية." }, 429);
  if (b.op === "book") {
    if (!canUse(p.limits, "bookings")) return json({ error: "الحجز المسبق مش مفعّل في الصالة." }, 403);
    const r = await createBooking(p.scope, { stationId: b.stationId, name: b.name, phone: b.phone, startsAt: b.startsAt, minutes: b.minutes, note: b.note }, "public");
    return r.ok ? json({ ok: true, message: r.data.message }) : json({ error: r.error }, 400);
  }
  if (b.op === "join") {
    const r = await joinTournament(p.scope, String(b.tournamentId ?? ""), { name: String(b.name ?? ""), phone: String(b.phone ?? "") }, { public: true });
    return r.ok ? json({ ok: true }) : json({ error: r.error }, 400);
  }
  return json({ error: "عملية غير معروفة." }, 400);
}
