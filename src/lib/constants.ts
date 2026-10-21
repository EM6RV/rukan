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

// القوالب الجديدة (المرحلة 2): نقاء، مخمل، نبض، سوق، حكاية، لمسة. القديمة (الثمانية) تتشال بعد موافقة الأدمن على خريطة التحويل.
export const NEW_TEMPLATES = ["naqa", "makhmal", "nabd", "souq", "hikaya", "lamsa"] as const;
export const STORE_TEMPLATES = ["simple", "elegant", "bold", "warm", "editorial", "noir", "pop", "gallery", ...NEW_TEMPLATES] as const;
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
  naqa: "نقاء",
  makhmal: "مخمل",
  nabd: "نبض",
  souq: "سوق",
  hikaya: "حكاية",
  lamsa: "لمسة",
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

// مدد الاشتراك. كل باقة لها سعر لكل مدة (plans.prices بمفاتيح m1/m3/m6/m12)، والمدة اللي سعرها null ما تطلعش.
export const BILLING_CYCLES = ["monthly", "quarterly", "semiannual", "yearly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

// خدمات التصميم (يطلبها البياع ويكمّل التفاصيل على واتساب)
export const DESIGN_SERVICES = ["reel", "logo", "identity", "other"] as const;
export type DesignService = (typeof DESIGN_SERVICES)[number];
export const DESIGN_SERVICE_LABELS: Record<DesignService, string> = { reel: "ريل", logo: "لوجو", identity: "هوية كاملة", other: "تصميم ثاني" };
/** الخدمات اللي ينفع تكون هي «التصميم المجاني» ضمن الباقة */
export const FREE_DESIGN_SERVICES: readonly DesignService[] = ["reel", "logo"];

export const LIBYA_REGIONS = ["west", "east", "south", "center"] as const;
export type LibyaRegion = (typeof LIBYA_REGIONS)[number];
export const REGION_LABELS: Record<LibyaRegion, string> = { west: "الغرب", east: "الشرق", south: "الجنوب", center: "الوسط" };

// ===== الوحدات الاختيارية (يفعّلها البياع من الإعدادات) =====
export const STORE_MODULES = ["warehouses", "purchasing", "accounting", "marketplaceInbox"] as const;
export type StoreModule = (typeof STORE_MODULES)[number];
export const STORE_MODULE_INFO: Record<StoreModule, { title: string; description: string }> = {
  warehouses: { title: "المخازن المتعددة", description: "أكثر من مخزن، جرد، ونقل البضاعة بين المخازن." },
  purchasing: { title: "المشتريات والموردين", description: "فواتير الشراء، الموردين، ومتوسط التكلفة باش تعرف ربحك الحقيقي." },
  accounting: { title: "الحسابات", description: "الخزنة والبنك والمصاريف والأرباح، من غير ما تكون محاسب." },
  marketplaceInbox: { title: "صندوق الرسائل", description: "رسايل إنستغرام وفيسبوك وواتساب في مكان واحد، وتحويل المحادثة لطلبية." },
};
/** الوحدات اللي اتبنت فعلاً. الباقي يبان «قريباً» وما يتفعلش. */
export const AVAILABLE_MODULES: readonly StoreModule[] = [];

// الإضافات المدفوعة فوق الباقة
export const ADDON_KINDS = ["staff", "warehouse", "products", "custom_domain"] as const;
export type AddonKind = (typeof ADDON_KINDS)[number];
export const ADDON_KIND_LABELS: Record<AddonKind, string> = { staff: "موظف إضافي", warehouse: "مخزن إضافي", products: "منتجات إضافية", custom_domain: "دومين خاص" };

export const DEFAULT_TRIAL_DAYS = 3;
/** باقة التجربة الافتراضية (slug) لو الأدمن ما حدد غيرها */
export const DEFAULT_TRIAL_PLAN_SLUG = "growth";
export const SESSION_DAYS = 30;
