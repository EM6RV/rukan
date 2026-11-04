import type { MemberRole } from "@/lib/constants";

export type Permission =
  | "dashboard" | "products" | "categories" | "settings" | "orders" | "customers"
  | "couriers" | "returns" | "marketing" | "reports" | "staff" | "billing" | "media";

const ALL: Permission[] = [
  "dashboard", "products", "categories", "settings", "orders", "customers",
  "couriers", "returns", "marketing", "reports", "staff", "billing", "media",
];

const MATRIX: Record<MemberRole, Permission[]> = {
  owner: ALL,
  manager: ALL.filter((p) => p !== "billing" && p !== "staff"),
  orders_staff: ["dashboard", "orders", "customers", "returns"],
  courier: ["orders"], // المندوب يشوف طلبياته بس (يتفلتر بالمندوب في المرحلة 4)
};

export const can = (role: MemberRole, permission: Permission) => MATRIX[role].includes(permission);

/** أول صفحة مسموحة للدور (لتحويل الموظف لو دخل صفحة ما يملكهاش) */
export const homeFor = (role: MemberRole): string => (can(role, "dashboard") ? "/dashboard" : "/dashboard/orders");
