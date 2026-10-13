import { Almarai, Cairo, Noto_Kufi_Arabic, Tajawal } from "next/font/google";
import type { StoreFontKey } from "@/lib/store-fonts";

// تتحمل فقط لما المتجر يستعملها (@font-face كسولة)، وما نعمل preload لها كلها. (next/font يطلب قيم حرفية مكتوبة مباشرة)
const tajawal = Tajawal({ subsets: ["arabic", "latin"], display: "swap", preload: false, weight: ["300", "400", "500", "700", "800"], variable: "--font-store-tajawal" });
const cairo = Cairo({ subsets: ["arabic", "latin"], display: "swap", preload: false, variable: "--font-store-cairo" });
const almarai = Almarai({ subsets: ["arabic"], display: "swap", preload: false, weight: ["300", "400", "700", "800"], variable: "--font-store-almarai" });
const kufi = Noto_Kufi_Arabic({ subsets: ["arabic", "latin"], display: "swap", preload: false, variable: "--font-store-kufi" });

export const ALL_FONT_VARIABLES = [tajawal, cairo, almarai, kufi].map((f) => f.variable).join(" ");

const FAMILY: Record<Exclude<StoreFontKey, "ibm-plex">, string> = {
  tajawal: "var(--font-store-tajawal)", cairo: "var(--font-store-cairo)", almarai: "var(--font-store-almarai)", "noto-kufi": "var(--font-store-kufi)",
};

/** null = الخط الافتراضي (ما نغيّر شي) */
export function storeFontStyle(key: string): React.CSSProperties | null {
  if (!(key in FAMILY)) return null;
  const family = `${FAMILY[key as keyof typeof FAMILY]}, system-ui, sans-serif`;
  return { "--font-sans": family, "--font-heading": family, fontFamily: family } as React.CSSProperties;
}
