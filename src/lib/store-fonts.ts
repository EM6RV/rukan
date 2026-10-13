// خطوط المتجر المتاحة للبياع (ملف محايد). الافتراضي = خط رُكن الأساسي (IBM Plex للنص وAlexandria للعناوين).
export const STORE_FONTS = ["ibm-plex", "tajawal", "cairo", "almarai", "noto-kufi"] as const;
export type StoreFontKey = (typeof STORE_FONTS)[number];
export const STORE_FONT_LABELS: Record<StoreFontKey, string> = {
  "ibm-plex": "IBM Plex (الافتراضي)", tajawal: "تجوّل", cairo: "القاهرة", almarai: "المراعي", "noto-kufi": "نوتو كوفي",
};
export const isStoreFont = (v: string): v is StoreFontKey => (STORE_FONTS as readonly string[]).includes(v);
