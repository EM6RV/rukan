const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function toLatinDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (d) => {
    const a = ARABIC_DIGITS.indexOf(d);
    return String(a >= 0 ? a : PERSIAN_DIGITS.indexOf(d));
  });
}

/**
 * يقبل أرقام ليبيا (091/092/093/094/095) بأي صيغة: 0912345678، +218912345678، 00218912345678، 912345678
 * ويرجعها بصيغة موحدة 09XXXXXXXX، أو null لو الرقم مش صحيح.
 */
export function normalizeLibyanPhone(input: string): string | null {
  let s = toLatinDigits(input).replace(/[\s\-().]/g, "");
  if (s.startsWith("+218")) s = s.slice(4);
  else if (s.startsWith("00218")) s = s.slice(5);
  else if (s.startsWith("218") && s.length === 12) s = s.slice(3);
  else if (s.startsWith("0")) s = s.slice(1);
  return /^9[1-5]\d{7}$/.test(s) ? `0${s}` : null;
}

/** صيغة دولية لروابط واتساب: 218912345678 */
export function toWhatsappNumber(phone: string): string | null {
  const n = normalizeLibyanPhone(phone);
  return n ? `218${n.slice(1)}` : null;
}
