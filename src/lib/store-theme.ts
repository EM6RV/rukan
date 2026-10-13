import { contrastRatio, mix, readableOn } from "./contrast";

/** متغيرات CSS لواجهة المتجر من ألوان البياع (النص فوق كل لون يتحسب تلقائياً علشان دايماً مقروء) */
export function storeThemeVars(primary: string, accent: string): Record<string, string> {
  const accentFg = readableOn(accent);
  // لو لون التمييز قريب من الأبيض/ضعيف التباين فوق الخلفية البيضاء، نستعمل نسخة أغمق للنصوص والخطوط
  const accentText = contrastRatio(accent, "#FFFFFF") >= 3 ? accent : mix(accent, "#000000", 0.55);
  return {
    "--sp": primary,
    "--sp-fg": readableOn(primary),
    "--sa": accent,
    "--sa-fg": accentFg,
    "--sa-text": accentText,
    "--sp-soft": mix(primary, "#FFFFFF", 0.06),
    "--sp-line": mix(primary, "#FFFFFF", 0.16),
    "--sp-muted": mix(primary, "#FFFFFF", 0.62),
    "--sa-soft": mix(accent, "#FFFFFF", 0.16),
  };
}
