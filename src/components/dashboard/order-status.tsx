import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/constants";

const TONE: Record<OrderStatus, "gold" | "teal" | "navy" | "success" | "danger" | "neutral"> = {
  new: "gold", confirmed: "teal", with_courier: "navy", delivered: "success", returned: "danger", cancelled: "neutral",
};

export const OrderStatusBadge = ({ status }: { status: OrderStatus }) => <Badge tone={TONE[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;

export function PaymentBadge({ method, status }: { method: string; status: string }) {
  const m = method === "cod" ? "عند الاستلام" : method === "bank_transfer" ? "تحويل" : "بوابة";
  const s = status === "paid" ? "مدفوعة" : status === "refunded" ? "مسترجعة" : "غير مدفوعة";
  return <Badge tone={status === "paid" ? "success" : status === "refunded" ? "danger" : "neutral"}>{m} · {s}</Badge>;
}
