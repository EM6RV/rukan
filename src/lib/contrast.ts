// ألوان البياع: نحسب لون النص المقروء فوق أي لون يختاره (أبيض أو كحلي).

function parse(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex: string): number {
  const [r, g, b] = parse(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** لون النص (أبيض أو كحلي رُكن) الأوضح فوق الخلفية */
export const readableOn = (bg: string) => (contrastRatio(bg, "#FFFFFF") >= contrastRatio(bg, "#0D263E") ? "#FFFFFF" : "#0D263E");

/** مزج لونين: ratio من الأول (0..1) */
export function mix(a: string, b: string, ratio: number): string {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const m = (x: number, y: number) => Math.round(x * ratio + y * (1 - ratio)).toString(16).padStart(2, "0");
  return `#${m(ar, br)}${m(ag, bg)}${m(ab, bb)}`;
}
