export const MANUAL_SOURCES = ["whatsapp", "instagram", "tiktok", "phone", "shop", "other"] as const;
export type ManualSource = (typeof MANUAL_SOURCES)[number];
export const MANUAL_SOURCE_LABELS: Record<ManualSource, string> = { whatsapp: "واتساب", instagram: "إنستغرام", tiktok: "تيك توك", phone: "اتصال", shop: "من المحل", other: "أخرى" };
