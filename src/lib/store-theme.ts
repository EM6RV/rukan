import { contrastRatio, mix, readableOn } from "./contrast";

/** متغيرات CSS لواجهة المتجر من ألوان البياع (النص فوق كل لون يتحسب تلقائياً علشان دايماً مقروء) */
export function storeThemeVars(primary: string, accent: string): Record<string, string> {
  const accentFg = readableOn(accent);
  // لو لون التمييز قريب من الأبيض/ضعيف التباين فوق الخلفية البيضاء، نستعمل نسخة أغمق للنصوص والخطوط
  const accentText = contrastRatio(accent, "#FFFFFF") >= 3 ? accent : mix(accent, "#000000", 0.55);
  // النص الثانوي: نزيد نسبة اللون الأساسي تدريجياً لين يوصل تباينه 4.6:1 على الكريمي (أضعف خلفية بين القوالب)
  let muted = mix(primary, "#FFFFFF", 0.62);
  for (let r = 0.62; r <= 1 && contrastRatio(muted, "#FBF8F3") < 4.6; r += 0.04) muted = mix(primary, "#FFFFFF", Math.min(r, 1));
  // لون أساسي فاتح (برتقالي مثلاً) ما يكفي لوحده: نغمّقه بالأسود
  for (let k = 0.1; k <= 0.9 && contrastRatio(muted, "#FBF8F3") < 4.6; k += 0.1) muted = mix(primary, "#000000", 1 - k);
  return {
    "--sp": primary,
    "--sp-fg": readableOn(primary),
    "--sa": accent,
    "--sa-fg": accentFg,
    "--sa-text": accentText,
    "--sp-soft": mix(primary, "#FFFFFF", 0.06),
    "--sp-line": mix(primary, "#FFFFFF", 0.16),
    "--sp-muted": muted,
    "--sa-soft": mix(accent, "#FFFFFF", 0.16),
  };
}
