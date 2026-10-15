// خطوط المتجر المتاحة للبياع (ملف محايد). الافتراضي = خط رُكن الأساسي (IBM Plex للنص وAlexandria للعناوين).
export const STORE_FONTS = ["ibm-plex", "tajawal", "cairo", "almarai", "noto-kufi", "readex", "el-messiri", "amiri", "reem-kufi", "lemonada", "changa", "marhey", "rubik"] as const;
export type StoreFontKey = (typeof STORE_FONTS)[number];
export const STORE_FONT_LABELS: Record<StoreFontKey, string> = {
  "ibm-plex": "IBM Plex (الافتراضي)", tajawal: "تجوّل", cairo: "القاهرة", almarai: "المراعي", "noto-kufi": "نوتو كوفي",
  readex: "ريدكس (عصري)", "el-messiri": "المسيري (فخم)", amiri: "أميري (كلاسيكي)", "reem-kufi": "ريم كوفي (هندسي)", lemonada: "ليمونادا (مرح)", changa: "تشانغا (رياضي)", marhey: "مرحي (لعوب)", rubik: "روبيك (ناعم)",
};
export const isStoreFont = (v: string): v is StoreFontKey => (STORE_FONTS as readonly string[]).includes(v);
