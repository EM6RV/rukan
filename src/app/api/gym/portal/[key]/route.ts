import { cookies } from "next/headers";
import { getDb } from "@/db";
import { getClientIp } from "@/server/auth/current";
import { portalBook, portalCancel, portalCookie, portalLogin, portalLogout, portalMember, portalStore } from "@/server/gym/portal";
import { sameOriginError } from "@/server/origin";
import { hitRateLimit } from "@/server/ratelimit";

export const dynamic = "force-dynamic";
const json = (b: object, s = 200) => Response.json(b, { status: s, headers: { "Cache-Control": "no-store" } });

/** صفحة العضو الشخصية: دخول/خروج/حجز حصة. كلها بـ rate limit وفحص الأصل، والجلسة كوكي httpOnly */
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const csrf = sameOriginError(request);
  if (csrf) return csrf;
  const { key } = await params;
  const db = getDb();
  let b: { op?: unknown; phone?: unknown; password?: unknown; classId?: unknown; day?: unknown; bookingId?: unknown };
  try { b = await request.json(); } catch { return json({ error: "بيانات غلط." }, 400); }
  const ip = (await getClientIp()) ?? "unknown";
  const s = await portalStore(db, key);
  if (!s) return json({ error: "الصفحة الشخصية مش متاحة." }, 404);
  const limit = await hitRateLimit(db, `gym-portal:op:${s.store.id}:${ip}`, { limit: 120, windowMs: 10 * 60_000 });
  if (!limit.allowed) return json({ error: "طلبات كثيرة. استنى شوية." }, 429);
  const name = portalCookie(s.store.slug), jar = await cookies();
  if (b.op === "login") {
    const r = await portalLogin(db, key, String(b.phone ?? ""), String(b.password ?? ""), ip);
    if (!r.ok) return json({ error: r.error }, 401);
    jar.set(name, r.data.cookie, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(r.data.exp) });
    return json({ ok: true });
  }
  const cookie = jar.get(name)?.value;
  if (b.op === "logout") { await portalLogout(s.scope, cookie); jar.delete(name); return json({ ok: true }); }
  const m = await portalMember(s.scope, cookie);
  if (!m) return json({ error: "سجّل دخولك." }, 401);
  if (b.op === "book") { const r = await portalBook(s.scope, m.id, String(b.classId ?? ""), String(b.day ?? "")); return r.ok ? json({ ok: true, status: r.data.status }) : json({ error: r.error }, 400); }
  if (b.op === "cancel") { const r = await portalCancel(s.scope, m.id, String(b.bookingId ?? "")); return r.ok ? json({ ok: true }) : json({ error: r.error }, 400); }
  return json({ error: "عملية غير معروفة." }, 400);
}
