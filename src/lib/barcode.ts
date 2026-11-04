// الباركودات: EAN-13 (رقم التحقق، الباركود الداخلي، باركود الميزان) وترميز الأشرطة للطباعة (EAN-13 و Code128).
// محايد: يستعمله السيرفر والكاشير (بدون نت) وصفحة طباعة الملصقات.

const digitsOnly = (s: string) => /^\d+$/.test(s);

/** رقم التحقق لـ EAN-13 (من أول 12 رقم) أو EAN-8 (من أول 7) */
export function eanCheckDigit(body: string): number {
  if (!digitsOnly(body)) throw new Error("الباركود أرقام بس");
  let sum = 0;
  // من اليمين: الأوزان 3،1،3،1…
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan(code: string): boolean {
  if (!digitsOnly(code) || (code.length !== 13 && code.length !== 8)) return false;
  return eanCheckDigit(code.slice(0, -1)) === Number(code.at(-1));
}

/** يكمّل رقم التحقق: 12 رقم ← EAN-13 */
export const withCheckDigit = (body12: string) => `${body12}${eanCheckDigit(body12)}`;

/** بادئة الباركود الداخلي (أكواد المحل: من مجموعة 2x المحجوزة للاستعمال الداخلي) */
export const INTERNAL_PREFIX = "29";

/** باركود داخلي EAN-13: البادئة + رقم تسلسلي (10 أرقام) + رقم التحقق */
export function internalBarcode(seq: number, prefix = INTERNAL_PREFIX): string {
  if (!Number.isInteger(seq) || seq < 0) throw new Error("رقم تسلسلي غير صحيح");
  const width = 12 - prefix.length;
  const body = `${prefix}${String(seq % 10 ** width).padStart(width, "0")}`;
  return withCheckDigit(body);
}

// ===== باركود الميزان =====

export type ScaleConfig = {
  /** بادئات باركود الميزان (رقمين)، مثلاً 20 و 21 */
  prefixes: string[];
  /** عدد أرقام رقم الصنف (PLU) بعد البادئة */
  itemDigits: number;
  /** القيمة في الباركود: الوزن بالجرام أو السعر */
  value: "weight" | "price";
  /** السعر في الباركود × المعامل = دراهم (1 = الباركود بالدرهم، 10 = بالقرش…) */
  priceMultiplier: number;
};

export const DEFAULT_SCALE: ScaleConfig = { prefixes: ["20", "21", "22"], itemDigits: 5, value: "weight", priceMultiplier: 1 };

export type ScaleRead = { plu: string; grams: number | null; price: number | null };

/**
 * يقرا باركود الميزان: [بادئة 2][رقم الصنف][القيمة][تحقق]. الكود لازم يكون EAN-13 صحيح.
 * null = مش باركود ميزان (حسب الإعداد).
 */
export function parseScaleBarcode(code: string, cfg: ScaleConfig = DEFAULT_SCALE): ScaleRead | null {
  if (code.length !== 13 || !isValidEan(code)) return null;
  const prefix = cfg.prefixes.find((p) => code.startsWith(p));
  if (!prefix) return null;
  const itemEnd = prefix.length + cfg.itemDigits;
  if (itemEnd >= 12) return null;
  const plu = code.slice(prefix.length, itemEnd).replace(/^0+(?=\d)/, "");
  const value = Number(code.slice(itemEnd, 12));
  if (cfg.value === "weight") return value > 0 ? { plu, grams: value, price: null } : null;
  return { plu, grams: null, price: value * Math.max(1, cfg.priceMultiplier) };
}

/** يطابق رقم الصنف المكتوب في المنتج مع اللي في الباركود (بدون الأصفار على اليسار) */
export const samePlu = (a: string | null | undefined, b: string) => !!a && a.replace(/^0+(?=\d)/, "") === b;

// ===== ترميز الأشرطة للطباعة =====

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** أشرطة EAN-13 كسلسلة 0/1 (95 وحدة) */
export function ean13Modules(code: string): string {
  if (code.length !== 13 || !isValidEan(code)) throw new Error("EAN-13 غير صحيح");
  const d = code.split("").map(Number);
  const parity = PARITY[d[0]!]!;
  let out = "101";
  for (let i = 1; i <= 6; i++) out += (parity[i - 1] === "L" ? L : G)[d[i]!]!;
  out += "01010";
  for (let i = 7; i <= 12; i++) out += R[d[i]!]!;
  return `${out}101`;
}

// Code128 (المجموعة B): لأي كود فيه حروف أو طوله مش 13
const C128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

/** أشرطة Code128-B كسلسلة 0/1 (للطباعة كـ SVG) */
export function code128Modules(text: string): string {
  if (!text || text.length > 40 || /[^\x20-\x7e]/.test(text)) throw new Error("Code128: حروف إنجليزية وأرقام بس");
  const codes = [104, ...text.split("").map((c) => c.charCodeAt(0) - 32)];
  const check = codes.reduce((s, c, i) => s + c * (i === 0 ? 1 : i), 0) % 103;
  let out = "";
  for (const c of [...codes, check, 106]) {
    const widths = C128[c]!;
    for (let i = 0; i < widths.length; i++) out += (i % 2 === 0 ? "1" : "0").repeat(Number(widths[i]));
  }
  return out;
}

/** الأشرطة المناسبة للكود: EAN-13 لو صحيح، وإلا Code128 */
export function barcodeModules(code: string): { kind: "ean13" | "code128"; modules: string } {
  return isValidEan(code) && code.length === 13 ? { kind: "ean13", modules: ean13Modules(code) } : { kind: "code128", modules: code128Modules(code) };
}
