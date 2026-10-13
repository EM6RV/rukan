// أنواع أقسام الصفحة الرئيسية للمتجر (ملف محايد: يستعمله السيرفر والواجهة)
export const SECTION_TYPES = ["hero", "categories", "featured", "banner", "text"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "الغلاف الرئيسي", categories: "الأقسام", featured: "منتجات مميزة", banner: "بانر (صورة)", text: "نص",
};
export const SECTION_HINTS: Record<SectionType, string> = {
  hero: "الصورة الكبيرة في أول الصفحة مع العنوان وزر التسوّق.",
  categories: "شبكة أقسام متجرك.",
  featured: "المنتجات اللي علّمتها «مميزة».",
  banner: "صورة عرض أو إعلان مع رابط اختياري.",
  text: "فقرة نص (مثلاً عن متجرك أو عرض).",
};
/** الأنواع اللي تتكرر مسموحة، والباقي مرة وحدة */
export const SINGLE_SECTION_TYPES: SectionType[] = ["hero", "categories", "featured"];
export const MAX_SECTIONS = 12;

export type SectionConfig = {
  title?: string; subtitle?: string; ctaLabel?: string; imageMediaId?: string | null; linkUrl?: string; body?: string;
};
