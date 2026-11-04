import { MEMBER_ROLE_LABELS, type MemberRole } from "./constants";

// صلاحيات الموظفين (ملف محايد يستعمله السيرفر والواجهة)
export const STAFF_ROLES = [
  "manager", "orders_staff", "courier",
  // أدوار المنظومات الجاهزة
  "cashier", "shift_supervisor", "stock_keeper", "lounge_supervisor", "receptionist", "trainer", "accountant",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const STAFF_ROLE_LABELS: Record<MemberRole, string> = { ...MEMBER_ROLE_LABELS, owner: "المالك" };
export const STAFF_ROLE_HINTS: Record<StaffRole, string> = {
  manager: "كل شي ما عدا الاشتراك والموظفين",
  orders_staff: "الطلبيات والزبائن والمرتجعات فقط",
  courier: "يشوف طلبياته بس ويسجل التوصيل",
  cashier: "البيع في الكاشير بس (يدخل بالـ PIN)",
  shift_supervisor: "الكاشير + الموافقات (خصم، مرتجع، فتح الدرج) والتقارير",
  stock_keeper: "المنتجات والأقسام والمخزون",
  lounge_supervisor: "شاشة الصالة والموافقات والزباين",
  receptionist: "الاستقبال والبيع والزباين",
  trainer: "الزباين (الأعضاء) بس",
  accountant: "الحسابات والتقارير والزباين",
};
