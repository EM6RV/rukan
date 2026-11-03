// خريطة صفحات لوحة البياع: مصدر واحد للقائمة الجانبية، الشريط السفلي، صفحة «القائمة»، ولوحة الأوامر (Ctrl+K).
// محايد (سيرفر وواجهة): الأيقونات تتحدد في الواجهة من مفتاح `icon`.
import type { Permission } from "@/server/permissions";
import type { StoreModule } from "./constants";
import type { ProductLine } from "./product-lines";

export type NavIcon =
  | "home" | "orders" | "products" | "categories" | "customers" | "carts" | "couriers" | "returns" | "coupons"
  | "reports" | "reviews" | "brands" | "lowstock" | "stock" | "audit" | "analytics"
  | "market" | "lounge" | "gym" | "lines" | "receipt" | "shift" | "branch" | "pos"
  | "reception" | "plans" | "classes" | "trainers" | "gmsg" | "greports" | "stations" | "pricing" | "booking" | "tournament" | "tv" | "lreports"
  | "barcode" | "expiry" | "promo" | "reorder" | "prep" | "waste" | "mreports"
  | "inbox" | "warehouse" | "transfer" | "stocktake" | "purchase" | "supplier" | "wallet" | "expense" | "debt" | "pnl" | "content" | "design" | "services" | "staff" | "billing" | "settings" | "modules" | "menu";

export type NavGroupKey = "systems" | "market" | "lounge" | "gym" | "sales" | "catalog" | "inventory" | "purchasing" | "accounting" | "marketing" | "store" | "team" | "settings";
export const NAV_GROUPS: { key: NavGroupKey; title: string }[] = [
  { key: "systems", title: "المنظومات" },
  { key: "market", title: "الماركت" },
  { key: "lounge", title: "الصالة" },
  { key: "gym", title: "النادي" },
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
  /** تبان بس لو النشاط مشترك في المنظومة (أو وحدة منهم على الأقل لو قائمة) */
  line?: ProductLine | readonly ProductLine[];
  /** وتحتاج كمان المنظومات هذي كلها (مثلاً تجهيز الطلبيات = ماركت + متجر أونلاين) */
  alsoLines?: readonly ProductLine[];
};

/** صفحات المحرك المشترك (الكاشير/الصالة/الاستقبال): تبان لو فيه منظومة تشغيل وحدة على الأقل */
const OPS = ["market", "lounge", "gym"] as const;

export const NAV: NavDef[] = [
  { href: "/dashboard", label: "الرئيسية", icon: "home", group: null, permission: "dashboard", keywords: "ملخص مبيعات" },
  { href: "/dashboard/market", label: "رُكن ماركت", icon: "market", group: "systems", permission: "dashboard", keywords: "كاشير ماركت محل مواد غذائية", line: "market" },
  { href: "/dashboard/lounge", label: "رُكن بلاي", icon: "lounge", group: "systems", permission: "dashboard", keywords: "صالة العاب بلايستيشن اجهزة", line: "lounge" },
  { href: "/dashboard/gym", label: "رُكن فِت", icon: "gym", group: "systems", permission: "dashboard", keywords: "نادي جيم اعضاء اشتراكات", line: "gym" },
  { href: "/dashboard/sales", label: "فواتير الكاشير", icon: "receipt", group: "systems", permission: "reports", keywords: "فاتورة كاشير مبيعات مراجعة مرتجع", line: OPS },
  { href: "/dashboard/shifts", label: "الورديات", icon: "shift", group: "systems", permission: "reports", keywords: "وردية تقرير z خزنة درج عجز زيادة", line: OPS },
  { href: "/dashboard/debts", label: "الديون والمحافظ", icon: "debt", group: "systems", permission: "customers", keywords: "دين كناش محفظة نقاط ولاء كشف حساب", line: OPS },
  { href: "/dashboard/market/products", label: "الباركود والوحدات", icon: "barcode", group: "market", permission: "products", keywords: "باركود وحدة كرتونة جملة ميزان موزون ملصقات رف ازرار سريعة", line: "market" },
  { href: "/dashboard/market/expiry", label: "الصلاحية والهالك", icon: "expiry", group: "market", permission: "products", keywords: "صلاحية انتهاء دفعة اتلاف هالك تالف", line: "market" },
  { href: "/dashboard/market/promotions", label: "العروض", icon: "promo", group: "market", permission: "marketing", keywords: "عرض اشتري خذ مجانا الحبة الثانية ساعة سعيدة باقة", line: "market" },
  { href: "/dashboard/market/purchase", label: "اقتراح الشراء", icon: "reorder", group: "market", permission: "products", keywords: "طلب شراء مورد ناقص اعادة طلب واتساب مستحقات", line: "market" },
  { href: "/dashboard/market/stocktake", label: "الجرد بالمسح", icon: "stocktake", group: "market", permission: "products", keywords: "جرد مسح عد فروقات تسوية رف", line: "market" },
  { href: "/dashboard/market/prep", label: "تجهيز الطلبيات", icon: "prep", group: "market", permission: "orders", keywords: "تجهيز طلبيات اونلاين تجميع بديل", line: "market", alsoLines: ["store"] },
  { href: "/dashboard/market/reports", label: "تقارير الماركت", icon: "mreports", group: "market", permission: "reports", keywords: "تقرير مبيعات ربح كاشير وردية قسم ذروة راكد", line: "market" },
  { href: "/dashboard/lounge/stations", label: "الأجهزة والصيانة", icon: "stations", group: "lounge", permission: "settings", keywords: "جهاز بلايستيشن صيانة غرفة vip العاب", line: "lounge" },
  { href: "/dashboard/lounge/pricing", label: "الأسعار والباقات", icon: "pricing", group: "lounge", permission: "settings", keywords: "سعر ساعة ماتش باقة ساعات تقريب", line: "lounge" },
  { href: "/dashboard/lounge/bookings", label: "الحجوزات", icon: "booking", group: "lounge", permission: "customers", keywords: "حجز جهاز موعد", line: "lounge" },
  { href: "/dashboard/lounge/tournaments", label: "البطولات", icon: "tournament", group: "lounge", permission: "marketing", keywords: "بطولة قرعة ترتيب", line: "lounge" },
  { href: "/dashboard/lounge/tv", label: "شاشة الحائط", icon: "tv", group: "lounge", permission: "settings", keywords: "تلفزيون شاشة عرض", line: "lounge" },
  { href: "/dashboard/lounge/reports", label: "تقارير الصالة", icon: "lreports", group: "lounge", permission: "reports", keywords: "تقرير اشغال ايراد ذروة", line: "lounge" },
  { href: "/dashboard/gym/reception", label: "الاستقبال", icon: "reception", group: "gym", permission: "pos", keywords: "دخول عضو qr باركود كشك", line: "gym" },
  { href: "/dashboard/gym/members", label: "الأعضاء", icon: "customers", group: "gym", permission: "customers", keywords: "عضو اشتراك تجديد تجميد قسط", line: "gym" },
  { href: "/dashboard/gym/plans", label: "الاشتراكات والإعدادات", icon: "plans", group: "gym", permission: "settings", keywords: "نوع اشتراك سعر نساء مهلة", line: "gym" },
  { href: "/dashboard/gym/classes", label: "الحصص", icon: "classes", group: "gym", permission: "settings", keywords: "حصة جدول حجز انتظار", line: "gym" },
  { href: "/dashboard/gym/trainers", label: "المدربين", icon: "trainers", group: "gym", permission: "settings", keywords: "مدرب pt عمولة", line: "gym" },
  { href: "/dashboard/gym/messages", label: "رسائل اليوم", icon: "gmsg", group: "gym", permission: "customers", keywords: "واتساب رسالة تذكير", line: "gym" },
  { href: "/dashboard/gym/reports", label: "تقارير النادي", icon: "greports", group: "gym", permission: "reports", keywords: "تقرير عضويات تجديد حضور", line: "gym" },
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
  { href: "/dashboard/branches", label: "الفروع والأجهزة", icon: "branch", group: "settings", permission: "settings", keywords: "فرع كاشير جهاز تابلت تفعيل طابعة", line: OPS },
  { href: "/dashboard/pos-settings", label: "إعدادات الكاشير", icon: "pos", group: "settings", permission: "settings", keywords: "فاتورة ورق طابعة خصم موافقة نقاط ولاء دين", line: OPS },
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
  const lineOk = (l: NavDef["line"]) => !l || (typeof l === "string" ? hasLine(l) : l.some(hasLine));
  return NAV.filter((d) => o.can(d.permission) && (!d.needsCouriers || o.useCouriers || o.isCourier) && (!d.module || o.moduleOn(d.module)) && lineOk(d.line) && (d.alsoLines ?? []).every(hasLine))
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
