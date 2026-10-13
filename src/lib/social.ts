/**
 * يقبل اسم مستخدم (مع أو بدون @) أو رابط https كامل، ويرجع نص نظيف أو null لو فاضي، أو undefined لو غير صحيح.
 * نرفض أي scheme غير http(s) (مثل javascript:) علشان ما ينحقنش في رابط يظهر للزباين.
 */
export function normalizeSocial(input: string): string | null | undefined {
  const v = input.trim();
  if (!v) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^https?:\/\//i.test(v)) return undefined;
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 200) : undefined;
    } catch {
      return undefined;
    }
  }
  const handle = v.replace(/^@/, "");
  return /^[\w.-]{1,60}$/.test(handle) ? handle : undefined;
}

export function socialUrl(platform: "instagram" | "tiktok" | "facebook" | "snapchat", value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  const base = { instagram: "https://instagram.com/", tiktok: "https://www.tiktok.com/@", facebook: "https://facebook.com/", snapchat: "https://snapchat.com/add/" }[platform];
  return base + encodeURIComponent(value);
}
