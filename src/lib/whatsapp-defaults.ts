// رسائل واتساب الافتراضية لكل حالة. المتغيرات: {name} {order} {total} {store} {courier}
export const DEFAULT_WHATSAPP_TEMPLATES: Record<string, string> = {
  new_order_confirm: "السلام عليكم {name}، وصلتنا طلبيتك رقم {order} من {store} بقيمة {total}. رُد علينا بـ «تأكيد» باش نجهزوها.",
  new: "أهلاً {name}، استلمنا طلبيتك رقم {order} من {store}. نراجعوها ونتواصلوا معاك قريب.",
  confirmed: "باهي {name}، أكدنا طلبيتك رقم {order}. حنجهزوها ونبعثوها لك بإذن الله.",
  with_courier: "{name}، طلبيتك رقم {order} مع المندوب {courier}. جهّز المبلغ {total} للاستلام.",
  delivered: "{name}، وصلتك طلبيتك رقم {order}. شكراً من {store}، ونتمنى تعجبك!",
  returned: "{name}، طلبيتك رقم {order} رجعت لنا. لو عندك سؤال كلمنا هنا.",
  cancelled: "{name}، تم إلغاء طلبيتك رقم {order}. لو تبي تطلب من جديد نحن موجودين.",
};

export const WHATSAPP_VARIABLES = ["name", "order", "total", "store", "courier"] as const;
export type WhatsappVariable = (typeof WHATSAPP_VARIABLES)[number];

export const WHATSAPP_KEY_LABELS: Record<string, string> = {
  new_order_confirm: "تأكيد الطلبية (للزبون بعد الطلب)",
  new: "طلبية جديدة",
  confirmed: "تم التأكيد",
  with_courier: "مع المندوب",
  delivered: "تم التوصيل",
  returned: "مرتجعة",
  cancelled: "ملغية",
};
export const WHATSAPP_KEYS = Object.keys(DEFAULT_WHATSAPP_TEMPLATES);

/** يستبدل {name} {order}... بقيمها؛ المتغير غير المعروف أو الفاضي يتساب كما هو/فاضي */
export function renderWhatsapp(body: string, vars: Partial<Record<WhatsappVariable, string>>): string {
  return body.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? (vars[k as WhatsappVariable] ?? "") : m)).replace(/ {2,}/g, " ").trim();
}
