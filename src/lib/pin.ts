// PIN الكاشير (4 أرقام): نفس الحساب في السيرفر (node) والجهاز (WebCrypto) باش التبديل يشتغل بدون نت.
// الصيغة المخزنة "salt:hex(sha256(salt:pin))". الـ PIN مش كلمة سر: يحمي التبديل على جهاز مفعّل بس.
export const PIN_RE = /^\d{4}$/;

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  return `${salt}:${await sha256Hex(`${salt}:${pin}`)}`;
}

export async function checkPin(pin: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || !PIN_RE.test(pin)) return false;
  const salt = stored.split(":")[0]!;
  return (await hashPin(pin, salt)) === stored;
}
