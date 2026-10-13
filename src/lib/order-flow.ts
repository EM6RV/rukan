import type { OrderStatus } from "./constants";

// انتقالات حالة الطلبية المسموحة. «مرتجعة» ما تتحول لها مباشرة: تمر عبر تسجيل مرتجع (سبب + مخزون + تكلفة التوصيل).
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["confirmed", "with_courier", "cancelled"],
  confirmed: ["with_courier", "delivered", "cancelled"],
  with_courier: ["delivered", "confirmed", "cancelled"],
  delivered: [],
  returned: [],
  cancelled: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus) => TRANSITIONS[from].includes(to);

/** حالات ما تتعدل فيها بيانات الطلبية (إلا الملاحظات الداخلية) */
export const LOCKED_STATUSES: OrderStatus[] = ["delivered", "returned", "cancelled"];

/** حالات يمكن تسجيل مرتجع منها */
export const RETURNABLE_STATUSES: OrderStatus[] = ["with_courier", "delivered"];

export const RETURN_REASONS = ["refused", "unreachable", "defective", "wrong_item", "changed_mind", "other"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];
export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  refused: "رفض الاستلام",
  unreachable: "ما رد على الهاتف",
  defective: "المنتج فيه عيب",
  wrong_item: "منتج غير مطابق",
  changed_mind: "غيّر رأيه",
  other: "سبب آخر",
};
