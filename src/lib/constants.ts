// ثوابت مشتركة بين القاعدة والواجهة. القيم بالإنجليزي، والعرض بالعربي في مكان واحد.

export const ORDER_STATUSES = ["new", "confirmed", "with_courier", "delivered", "returned", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "جديدة",
  confirmed: "مؤكدة",
  with_courier: "مع المندوب",
  delivered: "تم التوصيل",
  returned: "مرتجعة",
  cancelled: "ملغية",
};

export const STORE_STATUSES = ["trial", "active", "expired", "suspended"] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];
export const STORE_STATUS_LABELS: Record<StoreStatus, string> = {
  trial: "تجريبي",
  active: "نشط",
  expired: "منتهي",
  suspended: "موقوف",
};

export const MEMBER_ROLES = ["owner", "manager", "orders_staff", "courier"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  owner: "مالك",
  manager: "مدير",
  orders_staff: "موظف طلبيات",
  courier: "مندوب",
};

export const STORE_TEMPLATES = ["simple", "elegant", "bold", "warm", "editorial", "noir", "pop", "gallery"] as const;
export type StoreTemplate = (typeof STORE_TEMPLATES)[number];
export const STORE_TEMPLATE_LABELS: Record<StoreTemplate, string> = {
  elegant: "أنيق",
  bold: "جريء",
  simple: "بسيط",
  warm: "دافئ",
  editorial: "مجلة",
  noir: "فخم",
  pop: "مرح",
  gallery: "معرض",
};

export const BUSINESS_TYPES = ["clothing", "perfume", "beauty", "accessories", "food", "other"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];
export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  clothing: "ملابس",
  perfume: "عطور",
  beauty: "عناية وتجميل",
  accessories: "إكسسوارات",
  food: "أكل بيتي",
  other: "أخرى",
};

export const PAYMENT_METHODS = ["cod", "bank_transfer", "gateway"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_STATUSES = ["pending", "paid", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const BILLING_CYCLES = ["monthly", "yearly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const LIBYA_REGIONS = ["west", "east", "south", "center"] as const;
export type LibyaRegion = (typeof LIBYA_REGIONS)[number];
export const REGION_LABELS: Record<LibyaRegion, string> = { west: "الغرب", east: "الشرق", south: "الجنوب", center: "الوسط" };

export const DEFAULT_TRIAL_DAYS = 3;
/** باقة التجربة الافتراضية (slug) لو الأدمن ما حدد غيرها */
export const DEFAULT_TRIAL_PLAN_SLUG = "yearly";
export const SESSION_DAYS = 30;
