import type { MemberRole } from "./constants";

// صلاحيات الموظفين (ملف محايد يستعمله السيرفر والواجهة)
export const STAFF_ROLES = ["manager", "orders_staff", "courier"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const STAFF_ROLE_LABELS: Record<MemberRole, string> = { owner: "المالك", manager: "مدير", orders_staff: "موظف طلبيات", courier: "مندوب" };
export const STAFF_ROLE_HINTS: Record<StaffRole, string> = {
  manager: "كل شي ما عدا الاشتراك والموظفين",
  orders_staff: "الطلبيات والزبائن والمرتجعات فقط",
  courier: "يشوف طلبياته بس ويسجل التوصيل",
};
