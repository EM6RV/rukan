// خريطة صفحات لوحة البياع: مصدر واحد للقائمة الجانبية، الشريط السفلي، صفحة «القائمة»، ولوحة الأوامر (Ctrl+K).
// محايد (سيرفر وواجهة): الأيقونات تتحدد في الواجهة من مفتاح `icon`.
import type { Permission } from "@/server/permissions";
import type { StoreModule } from "./constants";
import type { ProductLine } from "./product-lines";

export type NavIcon =
  | "home" | "orders" | "products" | "categories" | "customers" | "carts" | "couriers" | "returns" | "coupons"
  | "reports" | "reviews" | "brands" | "lowstock" | "stock" | "audit" | "analytics"
  | "market" | "lounge" | "gym" | "lines"
  | "inbox" | "warehouse" | "transfer" | "stocktake" | "purchase" | "supplier" | "wallet" | "expense" | "debt" | "pnl" | "content" | "design" | "services" | "staff" | "billing" | "settings" | "modules" | "menu";

export type NavGroupKey = "systems" | "sales" | "catalog" | "inventory" | "purchasing" | "accounting" | "marketing" | "store" | "team" | "settings";
export const NAV_GROUPS: { key: NavGroupKey; title: string }[] = [
  { key: "systems", title: "المنظومات" },
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
  /** تبان بس لو النشاط مشترك في المنظومة (المتجر الأونلاين أو ماركت/بلاي/فِت) */
  line?: ProductLine;
};

export const NAV: NavDef[] = [
  { href: "/dashboard", label: "الرئيسية", icon: "home", group: null, permission: "dashboard", keywords: "ملخص مبيعات" },
  { href: "/dashboard/market", label: "رُكن ماركت", icon: "market", group: "systems", permission: "dashboard", keywords: "كاشير ماركت محل مواد غذائية", line: "market" },
  { href: "/dashboard/lounge", label: "رُكن بلاي", icon: "lounge", group: "systems", permission: "dashboard", keywords: "صالة العاب بلايستيشن اجهزة", line: "lounge" },
  { href: "/dashboard/gym", label: "رُكن فِت", icon: "gym", group: "systems", permission: "dashboard", keywords: "نادي جيم اعضاء اشتراكات", line: "gym" },
  { href: "/dashboard/orders", label: "الطلبيات", icon: "orders", group: "sales", permission: "orders", keywords: "طلب طلبية", line: "store" },
  { href: "/dashboard/inbox", label: "صندوق الرسائل", icon: "inbox", group: "sales", permission: "orders", keywords: "رسائل محادثات انستغرام فيسبوك واتساب", module: "marketplaceInbox", line: "store" },
  { href: "/dashboard/customers", label: "الزبائن", icon: "customers", group: "sales", permission: "customers", keywords: "زبون عملاء" },
  { href: "/dashboard/abandoned-carts", label: "السلات المتروكة", icon: "carts", group: "sales", permission: "customers", keywords: "سلة متروكة", line: "store" },
  { href: "/dashboard/couriers", label: "المندوبون والكاش", icon: "couriers", group: "sales", permission: "couriers", keywords: "مندوب توصيل فلوس كاش تسوية", needsCouriers: true, line: "store" },
  { href: "/dashboard/returns", label: "المرتجعات", icon: "returns", group: "sales", permission: "returns", keywords: "مرتجع ارجاع", line: "store" },
  { href: "/dashboard/reports", label: "التقارير", icon: "reports", group: "sales", permission: "reports", keywords: "تقرير ارباح اكسل", line: "store" },
  { href: "/dashboard/analytics", label: "تحليلات المتجر", icon: "analytics", group: "sales", permission: "reports", keywords: "زيارات مصادر انستغرام تيك توك تحويل مشاهدات", line: "store" },
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
  { href: "/dashboard/coupons", label: "الكوبونات", icon: "coupons", group: "marketing", permission: "marketing", keywords: "كوبون خصم كود", line: "store" },
  { href: "/dashboard/reviews", label: "التقييمات", icon: "reviews", group: "marketing", permission: "marketing", keywords: "تقييم نجوم رأي مراجعة", line: "store" },
  { href: "/dashboard/content", label: "محتوى المتجر", icon: "content", group: "store", permission: "settings", keywords: "نصوص بانر من نحن سياسات", line: "store" },
  { href: "/dashboard/design", label: "التصميم", icon: "design", group: "store", permission: "settings", keywords: "قالب الوان خط", line: "store" },
  { href: "/dashboard/design-services", label: "خدمات التصميم", icon: "services", group: "store", permission: "settings", keywords: "ريلز لوجو هوية", line: "store" },
  { href: "/dashboard/activity", label: "سجل النشاط", icon: "audit", group: "team", permission: "settings", keywords: "سجل نشاط مين عمل تدقيق" },
  { href: "/dashboard/staff", label: "الموظفين", icon: "staff", group: "team", permission: "staff", keywords: "موظف صلاحيات" },
  { href: "/dashboard/settings", label: "الإعدادات", icon: "settings", group: "settings", permission: "settings", keywords: "دفع توصيل واتساب دومين" },
  { href: "/dashboard/settings/modules", label: "الوحدات", icon: "modules", group: "settings", permission: "settings", keywords: "مخازن مشتريات حسابات" },
  { href: "/dashboard/lines", label: "منظوماتي", icon: "lines", group: "settings", permission: "billing", keywords: "منظومات اشتراكات ماركت بلاي فت متجر تجربة" },
  { href: "/dashboard/billing", label: "اشتراك المتجر", icon: "billing", group: "settings", permission: "billing", keywords: "باقة ترقية تجديد", line: "store" },
];

/** أزرار الشريط السفلي في الموبايل (+ «القائمة» دايماً في الآخر) */
export const BOTTOM_NAV: NavIcon[] = ["home", "market", "lounge", "gym", "orders", "products", "reports"];
/** عدد أزرار الشريط السفلي (أول المتاح من BOTTOM_NAV بالترتيب) */
export const BOTTOM_NAV_SIZE = 4;
export const MENU_HREF = "/dashboard/menu";

export type NavItem = Pick<NavDef, "href" | "label" | "icon" | "group" | "keywords"> & { badge?: number };

/** الصفحات المسموحة للموظف وحسب إعدادات المتجر */
export function navFor(o: { can: (p: Permission) => boolean; useCouriers: boolean; isCourier: boolean; moduleOn: (m: StoreModule) => boolean; hasLine?: (l: ProductLine) => boolean }): NavItem[] {
  const hasLine = o.hasLine ?? ((l: ProductLine) => l === "store");
  return NAV.filter((d) => o.can(d.permission) && (!d.needsCouriers || o.useCouriers || o.isCourier) && (!d.module || o.moduleOn(d.module)) && (!d.line || hasLine(d.line)))
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
