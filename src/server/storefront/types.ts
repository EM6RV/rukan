import type { PlanLimits } from "@/db/schema/platform";
import type { BusinessType, StoreStatus, StoreTemplate } from "@/lib/constants";

// أنواع بيانات الواجهة العامة. كلها JSON-safe (التواريخ أرقام ms) علشان تتخزن في كاش Next.

export type Storefront = {
  id: string;
  slug: string;
  name: string;
  template: StoreTemplate;
  businessType: BusinessType;
  status: StoreStatus;
  trialEndsAt: number | null;
  currentPeriodEnd: number | null;
  logoMediaId: string | null;
  settings: {
    primaryColor: string; accentColor: string; fontKey: string;
    contactPhone: string | null; whatsapp: string | null; email: string | null; address: string | null;
    instagram: string | null; tiktok: string | null; facebook: string | null; snapchat: string | null;
    seoTitle: string | null; seoDescription: string | null; ogMediaId: string | null;
    metaPixelId: string | null; tiktokPixelId: string | null;
    thanksMessage: string | null; announcementBar: string | null; footerText: string | null;
    freeDeliveryOver: number | null; cityId: string | null;
  };
  limits: PlanLimits;
  pages: { slug: string; title: string }[];
  categories: { id: string; slug: string; name: string; imageMediaId: string | null }[];
  homeSections: { id: string; type: string; config: Record<string, unknown> }[];
  payments: { method: "cod" | "bank_transfer" | "gateway"; config: Record<string, unknown> }[];
};

export type CardProduct = {
  id: string; slug: string; name: string;
  price: number; maxPrice: number; compareAt: number | null;
  thumb: string | null; thumb2: string | null;
  inStock: boolean; isFeatured: boolean; hasOptions: boolean;
};

export type ProductDetail = {
  id: string; slug: string; name: string; description: string | null;
  price: number; compareAt: number | null; isFeatured: boolean;
  images: string[];
  options: { id: string; name: string; values: { id: string; value: string; colorHex: string | null }[] }[];
  variants: { id: string; valueIds: string[]; sku: string | null; price: number; compareAt: number | null; stock: number }[];
  categories: { id: string; slug: string; name: string }[];
  brand: { name: string; slug: string } | null;
  tags: string[];
  isBundle: boolean;
  personalization: { label: string; maxChars: number; price: number } | null;
  updatedAt: number;
};

export type CartLine = {
  variantId: string; productId: string; slug: string; name: string; variantLabel: string | null; note: string | null;
  price: number; compareAt: number | null; stock: number; quantity: number; image: string | null;
};

export type DeliveryRate = { cityId: string; city: string; fee: number; eta: string | null };

export type CatalogSort = "newest" | "price_asc" | "price_desc";
export type CatalogQuery = {
  categorySlug?: string; q?: string; featured?: boolean; sort?: CatalogSort; page?: number; pageSize?: number;
  /** فلاتر (الأسعار بالدرهم: 1 د.ل = 1000) */
  minPrice?: number; maxPrice?: number; inStock?: boolean; optionValue?: string; brandSlug?: string; tag?: string;
};
/** قيم الفلاتر المتاحة في المتجر (مقاسات، ألوان…) */
export type CatalogFacets = { options: { name: string; values: string[] }[]; brands: { slug: string; name: string }[]; tags: string[] };
export type CatalogPage = { items: CardProduct[]; total: number; page: number; pageCount: number };
