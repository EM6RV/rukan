import { formatMoney } from "./money";

/** رسالة تأكيد الطلبية على واتساب (من الزبون للبياع) */
export function orderConfirmMessage(o: { storeName: string; number: number; name: string; total: number; items: { name: string; variantLabel: string | null; quantity: number }[] }): string {
  const lines = o.items.map((i) => `• ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""} × ${i.quantity}`).join("\n");
  return `السلام عليكم، أنا ${o.name}. أبي أأكد طلبيتي رقم ${o.number} من ${o.storeName}.\n${lines}\nالإجمالي: ${formatMoney(o.total)}\nشكراً!`;
}

export const waLink = (phone: string, text: string) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
