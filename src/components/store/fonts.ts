import { Almarai, Amiri, Cairo, Changa, El_Messiri, Lemonada, Marhey, Noto_Kufi_Arabic, Readex_Pro, Reem_Kufi, Rubik, Tajawal } from "next/font/google";
import type { StoreFontKey } from "@/lib/store-fonts";

// تتحمل فقط لما المتجر يستعملها (@font-face كسولة)، وما نعمل preload لها كلها. (next/font يطلب قيم حرفية مكتوبة مباشرة)
const tajawal = Tajawal({ subsets: ["arabic", "latin"], display: "swap", preload: false, weight: ["300", "400", "500", "700", "800"], variable: "--font-store-tajawal" });
const cairo = Cairo({ subsets: ["arabic", "latin"], display: "swap", preload: false, variable: "--font-store-cairo" });
const almarai = Almarai({ subsets: ["arabic"], display: "swap", preload: false, weight: ["300", "400", "700", "800"], variable: "--font-store-almarai" });
const kufi = Noto_Kufi_Arabic({ subsets: ["arabic", "latin"], display: "swap", preload: false, variable: "--font-store-kufi" });
const readex = Readex_Pro({ subsets: ["arabic", "latin"], display: "swap", preload: false, variable: "--font-store-readex" });
const messiri = El_Messiri({ subsets: ["arabic", "latin"], display: "swap", preload: false, variable: "--font-store-messiri" });
const amiri = Amiri({ subsets: ["arabic", "latin"], display: "swap", preload: false, weight: ["400", "700"], variable: "--font-store-amiri" });
const reem = Reem_Kufi({ subsets: ["arabic", "latin"], display: "swap", preload: false, variable: "--font-store-reem" });
const lemonada = Lemonada({ subsets: ["arabic", "latin"], display: "swap", preload: false, variable: "--font-store-lemonada" });
const changa = Changa({ subsets: ["arabic", "latin"], display: "swap", preload: false, variable: "--font-store-changa" });
const marhey = Marhey({ subsets: ["arabic", "latin"], display: "swap", preload: false, variable: "--font-store-marhey" });
const rubik = Rubik({ subsets: ["arabic", "latin"], display: "swap", preload: false, variable: "--font-store-rubik" });

export const ALL_FONT_VARIABLES = [tajawal, cairo, almarai, kufi, readex, messiri, amiri, reem, lemonada, changa, marhey, rubik].map((f) => f.variable).join(" ");

const FAMILY: Record<Exclude<StoreFontKey, "ibm-plex">, string> = {
  tajawal: "var(--font-store-tajawal)", cairo: "var(--font-store-cairo)", almarai: "var(--font-store-almarai)", "noto-kufi": "var(--font-store-kufi)",
  readex: "var(--font-store-readex)", "el-messiri": "var(--font-store-messiri)", amiri: "var(--font-store-amiri)", "reem-kufi": "var(--font-store-reem)",
  lemonada: "var(--font-store-lemonada)", changa: "var(--font-store-changa)", marhey: "var(--font-store-marhey)", rubik: "var(--font-store-rubik)",
};

/** null = الخط الافتراضي (ما نغيّر شي) */
export function storeFontStyle(key: string): React.CSSProperties | null {
  if (!(key in FAMILY)) return null;
  const family = `${FAMILY[key as keyof typeof FAMILY]}, system-ui, sans-serif`;
  return { "--font-sans": family, "--font-heading": family, fontFamily: family } as React.CSSProperties;
}
