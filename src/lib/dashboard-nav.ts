// خريطة صفحات لوحة البياع: مصدر واحد للقائمة الجانبية، الشريط السفلي، صفحة «القائمة»، ولوحة الأوامر (Ctrl+K).
// محايد (سيرفر وواجهة): الأيقونات تتحدد في الواجهة من مفتاح `icon`.
import type { Permission } from "@/server/permissions";
import type { StoreModule } from "./constants";

export type NavIcon =
  | "home" | "orders" | "products" | "categories" | "customers" | "carts" | "couriers" | "returns" | "coupons"
  | "reports" | "reviews" | "brands" | "lowstock" | "stock" | "audit" | "analytics"
  | "inbox" | "warehouse" | "transfer" | "stocktake" | "purchase" | "supplier" | "wallet" | "expense" | "debt" | "pnl" | "content" | "design" | "services" | "staff" | "billing" | "settings" | "modules" | "menu";

export type NavGroupKey = "sales" | "catalog" | "inventory" | "purchasing" | "accounting" | "marketing" | "store" | "team" | "settings";
export const NAV_GROUPS: { key: NavGroupKey; title: string }[] = [
  { key: "sales", title: "المبيعات" },
  { key: "catalog", title: "الكتالوج" },
  { key: "inventory", title: "المخزون" },
  { key: "purchasing", title: "المشتريات" },
  { key: "accounting", title: "الحسابات" },
  { key: "marketing", title: "التسويق" },
  { key: "store", title: "المتجر" },
  { key: "team", title: "الفريق" },
  { key: "settings", title: "الإعدادات" },
];

export type NavDef = {
  href: string; label: string; icon: NavIcon; group: NavGroupKey | null; permission: Permission;
  /** كلمات إضافية للبحث في الصفحات */
  keywords?: string;
  /** تبان بس لو المندوبين شغّالين */
  needsCouriers?: boolean;
  /** تبان بس لو الوحدة شغّالة */
  module?: StoreModule;
};

export const NAV: NavDef[] = [
  { href: "/dashboard", label: "الرئيسية", icon: "home", group: null, permission: "dashboard", keywords: "ملخص مبيعات" },
  { href: "/dashboard/orders", label: "الطلبيات", icon: "orders", group: "sales", permission: "orders", keywords: "طلب طلبية" },
  { href: "/dashboard/inbox", label: "صندوق الرسائل", icon: "inbox", group: "sales", permission: "orders", keywords: "رسائل محادثات انستغرام فيسبوك واتساب", module: "marketplaceInbox" },
  { href: "/dashboard/customers", label: "الزبائن", icon: "customers", group: "sales", permission: "customers", keywords: "زبون عملاء" },
  { href: "/dashboard/abandoned-carts", label: "السلات المتروكة", icon: "carts", group: "sales", permission: "customers", keywords: "سلة متروكة" },
  { href: "/dashboard/couriers", label: "المندوبون والكاش", icon: "couriers", group: "sales", permission: "couriers", keywords: "مندوب توصيل فلوس كاش تسوية", needsCouriers: true },
  { href: "/dashboard/returns", label: "المرتجعات", icon: "returns", group: "sales", permission: "returns", keywords: "مرتجع ارجاع" },
  { href: "/dashboard/reports", label: "التقارير", icon: "reports", group: "sales", permission: "reports", keywords: "تقرير ارباح اكسل" },
  { href: "/dashboard/analytics", label: "تحليلات المتجر", icon: "analytics", group: "sales", permission: "reports", keywords: "زيارات مصادر انستغرام تيك توك تحويل مشاهدات" },
  { href: "/dashboard/products", label: "المنتجات", icon: "products", group: "catalog", permission: "products", keywords: "منتج مخزون اسعار" },
  { href: "/dashboard/catalog", label: "البراندات والخيارات", icon: "brands", group: "catalog", permission: "products", keywords: "براند ماركة وسوم تاج خيارات مقاسات الوان مكتبة انتهاء صلاحية" },
  { href: "/dashboard/low-stock", label: "قرب يخلص", icon: "lowstock", group: "catalog", permission: "products", keywords: "مخزون قليل ينفد تنبيه" },
  { href: "/dashboard/stock-movements", label: "حركة المخزون", icon: "stock", group: "catalog", permission: "products", keywords: "سجل مخزون حركات جرد" },
  { href: "/dashboard/categories", label: "الأقسام", icon: "categories", group: "catalog", permission: "categories", keywords: "قسم تصنيف" },
  { href: "/dashboard/warehouses", label: "المخازن", icon: "warehouse", group: "inventory", permission: "products", keywords: "مخزن مخازن قيمة المخزون", module: "warehouses" },
  { href: "/dashboard/warehouses/transfers", label: "التحويلات", icon: "transfer", group: "inventory", permission: "products", keywords: "تحويل نقل بين المخازن", module: "warehouses" },
  { href: "/dashboard/warehouses/stocktake", label: "الجرد", icon: "stocktake", group: "inventory", permission: "products", keywords: "جرد عد فرق", module: "warehouses" },
  { href: "/dashboard/purchasing", label: "فواتير الشراء", icon: "purchase", group: "purchasing", permission: "products", keywords: "شراء فاتورة استلام بضاعة", module: "purchasing" },
  { href: "/dashboard/purchasing/suppliers", label: "الموردين", icon: "supplier", group: "purchasing", permission: "products", keywords: "مورد موردين دفعات رصيد", module: "purchasing" },
  { href: "/dashboard/purchasing/report", label: "تقرير المشتريات", icon: "pnl", group: "purchasing", permission: "products", keywords: "تقرير مشتريات موردين", module: "purchasing" },
  { href: "/dashboard/accounting", label: "الحسابات", icon: "wallet", group: "accounting", permission: "accounting", keywords: "خزنة بنك محفظة رصيد حركات", module: "accounting" },
  { href: "/dashboard/accounting/expenses", label: "المصاريف", icon: "expense", group: "accounting", permission: "accounting", keywords: "مصروف مصاريف", module: "accounting" },
  { href: "/dashboard/accounting/receivables", label: "ديون الزباين", icon: "debt", group: "accounting", permission: "accounting", keywords: "دين ذمم زبون مستحقات", module: "accounting" },
  { href: "/dashboard/accounting/reports", label: "الأرباح والتدفق", icon: "pnl", group: "accounting", permission: "accounting", keywords: "ارباح خسائر تدفق نقدي اقفال", module: "accounting" },
  { href: "/dashboard/coupons", label: "الكوبونات", icon: "coupons", group: "marketing", permission: "marketing", keywords: "كوبون خصم كود" },
  { href: "/dashboard/reviews", label: "التقييمات", icon: "reviews", group: "marketing", permission: "marketing", keywords: "تقييم نجوم رأي مراجعة" },
  { href: "/dashboard/content", label: "محتوى المتجر", icon: "content", group: "store", permission: "settings", keywords: "نصوص بانر من نحن سياسات" },
  { href: "/dashboard/design", label: "التصميم", icon: "design", group: "store", permission: "settings", keywords: "قالب الوان خط" },
  { href: "/dashboard/design-services", label: "خدمات التصميم", icon: "services", group: "store", permission: "settings", keywords: "ريلز لوجو هوية" },
  { href: "/dashboard/activity", label: "سجل النشاط", icon: "audit", group: "team", permission: "settings", keywords: "سجل نشاط مين عمل تدقيق" },
  { href: "/dashboard/staff", label: "الموظفين", icon: "staff", group: "team", permission: "staff", keywords: "موظف صلاحيات" },
  { href: "/dashboard/settings", label: "الإعدادات", icon: "settings", group: "settings", permission: "settings", keywords: "دفع توصيل واتساب دومين" },
  { href: "/dashboard/settings/modules", label: "الوحدات", icon: "modules", group: "settings", permission: "settings", keywords: "مخازن مشتريات حسابات" },
  { href: "/dashboard/billing", label: "الاشتراك", icon: "billing", group: "settings", permission: "billing", keywords: "باقة ترقية تجديد" },
];

/** أزرار الشريط السفلي في الموبايل (+ «القائمة» دايماً في الآخر) */
export const BOTTOM_NAV: NavIcon[] = ["home", "orders", "products", "reports"];
export const MENU_HREF = "/dashboard/menu";

export type NavItem = Pick<NavDef, "href" | "label" | "icon" | "group" | "keywords"> & { badge?: number };

/** الصفحات المسموحة للموظف وحسب إعدادات المتجر */
export function navFor(o: { can: (p: Permission) => boolean; useCouriers: boolean; isCourier: boolean; moduleOn: (m: StoreModule) => boolean }): NavItem[] {
  return NAV.filter((d) => o.can(d.permission) && (!d.needsCouriers || o.useCouriers || o.isCourier) && (!d.module || o.moduleOn(d.module)))
    .map(({ href, label, icon, group, keywords }) => ({ href, label, icon, group, keywords }));
}

/** العنصر النشط: الأطول تطابقاً (باش «الإعدادات» ما تنور مع «الوحدات») */
export function activeHref(pathname: string, items: { href: string }[]): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    const hit = href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
    if (hit && (!best || href.length > best.length)) best = href;
  }
  return best;
}
