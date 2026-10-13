// تطبيع والتحقق من الدومين الخاص (ملف محايد)
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** يرجع الدومين بصيغة قياسية (ASCII/punycode، حروف صغيرة) أو null لو مش دومين صالح */
export function normalizeDomain(input: string): string | null {
  let raw = input.trim().toLowerCase();
  if (!raw || /\s/.test(raw)) return null;
  raw = raw.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0]!.replace(/:\d+$/, "").replace(/\.$/, "");
  if (!raw || raw.includes("@") || raw.includes("*")) return null;
  let host: string;
  try { host = new URL(`http://${raw}`).hostname; } catch { return null; }
  host = host.replace(/\.$/, "");
  if (host.length > 253 || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return null;
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return null;
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(labels.at(-1)!)) return null;
  return host;
}

/** الدومينات اللي ما تنفعش كدومين خاص: دومين المنصة نفسه وفروعه، وخدمات الاستضافة */
export function isPlatformDomain(host: string, rootDomain: string): boolean {
  const root = rootDomain.toLowerCase().replace(/:\d+$/, "");
  return host === root || host.endsWith(`.${root}`) || host.endsWith(".onrender.com") || host === "localhost" || host.endsWith(".localhost");
}

export const VERIFY_PREFIX = "_rukn-verify";
export const verifyRecordName = (domain: string) => `${VERIFY_PREFIX}.${domain}`;
export const verifyRecordValue = (token: string) => `rukn-verify=${token}`;
