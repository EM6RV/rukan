import type { MemberRole } from "@/lib/constants";

export type Permission =
  | "dashboard" | "products" | "categories" | "settings" | "orders" | "customers"
  | "couriers" | "returns" | "marketing" | "reports" | "staff" | "billing" | "media" | "accounting"
  // المنظومات: البيع في الكاشير، وموافقة المشرف (خصم كبير، مرتجع، حذف سطر بعد الطباعة، فتح الدرج بدون بيع)
  | "pos" | "pos_approve";

const ALL: Permission[] = [
  "dashboard", "products", "categories", "settings", "orders", "customers",
  "couriers", "returns", "marketing", "reports", "staff", "billing", "media", "accounting", "pos", "pos_approve",
];

const MATRIX: Record<MemberRole, Permission[]> = {
  owner: ALL,
  manager: ALL.filter((p) => p !== "billing" && p !== "staff"),
  orders_staff: ["dashboard", "orders", "customers", "returns"],
  courier: ["orders"], // المندوب يشوف طلبياته بس (يتفلتر بالمندوب في المرحلة 4)
  cashier: ["pos"],
  shift_supervisor: ["pos", "pos_approve", "dashboard", "customers", "reports"],
  stock_keeper: ["dashboard", "products", "categories"],
  lounge_supervisor: ["pos", "pos_approve", "dashboard", "customers"],
  receptionist: ["pos", "customers"],
  trainer: ["customers"],
  accountant: ["dashboard", "accounting", "reports", "customers"],
};

export const can = (role: MemberRole, permission: Permission) => MATRIX[role].includes(permission);

/** أول صفحة مسموحة للدور (لتحويل الموظف لو دخل صفحة ما يملكهاش) */
export const homeFor = (role: MemberRole): string => (can(role, "dashboard") ? "/dashboard" : can(role, "orders") ? "/dashboard/orders" : can(role, "pos") ? "/pos" : "/dashboard/customers");

export const PERMISSION_LABELS: Record<Permission, string> = {
  dashboard: "الرئيسية والإحصائيات", products: "المنتجات والمخزون", categories: "الأقسام", settings: "الإعدادات وتصميم المتجر",
  orders: "الطلبيات", customers: "الزبائن والسلات المتروكة", couriers: "المندوبين والكاش", returns: "المرتجعات",
  marketing: "الكوبونات والتقييمات", reports: "التقارير", staff: "الموظفين", billing: "الاشتراك", media: "الصور", accounting: "الحسابات والمصاريف",
  pos: "البيع في الكاشير", pos_approve: "موافقة المشرف (خصم، مرتجع، فتح الدرج)",
};
/** الصلاحيات اللي ينفع تُعطى لدور مخصص (الموظفين والاشتراك للمالك بس، منعاً لتصعيد الصلاحيات) */
export const ASSIGNABLE_PERMISSIONS: Permission[] = ALL.filter((p) => p !== "staff" && p !== "billing");
export const isAssignable = (p: string): p is Permission => (ASSIGNABLE_PERMISSIONS as string[]).includes(p);

type PermCtx = { role: MemberRole; customPermissions?: Permission[] | null };
/** صلاحية المستخدم: الدور المخصص (لو موجود) يغلب الدور الأساسي */
export const hasPermission = (ctx: PermCtx, permission: Permission) =>
  ctx.customPermissions ? ctx.customPermissions.includes(permission) : can(ctx.role, permission);

/** أول صفحة مسموحة (للتحويل لو دخل صفحة ما يملكهاش) */
export const homeForCtx = (ctx: PermCtx): string =>
  hasPermission(ctx, "dashboard") ? "/dashboard" : hasPermission(ctx, "orders") ? "/dashboard/orders" : hasPermission(ctx, "pos") ? "/pos" : hasPermission(ctx, "customers") ? "/dashboard/customers" : "/dashboard/menu";
