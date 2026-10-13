// عنوان العميل خلف البروكسي. X-Forwarded-For أول عناصره يقدر العميل يزوّره، فنقرا من اليمين:
// كل بروكسي موثوق يضيف عنوان اللي كلمه في آخر القائمة (Render = بروكسي واحد).
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-f:]{2,45}$/i;
const valid = (v: string) => (IPV4.test(v) && v.split(".").every((n) => Number(n) <= 255)) || (v.includes(":") && IPV6.test(v));

export function clientIpFrom(get: (name: string) => string | null, opts: { hops?: number; cloudflare?: boolean } = {}): string | null {
  const hops = Math.max(1, opts.hops ?? 1);
  if (opts.cloudflare) {
    const cf = get("cf-connecting-ip")?.trim();
    if (cf && valid(cf)) return cf;
  }
  const list = (get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const pick = list.length ? list[Math.max(0, list.length - hops)] : get("x-real-ip")?.trim();
  return pick && valid(pick) ? pick : null;
}
