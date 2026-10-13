// رسائل واتساب الافتراضية لكل حالة. المتغيرات: {name} {order} {total} {store} {courier}
export const DEFAULT_WHATSAPP_TEMPLATES: Record<string, string> = {
  new_order_confirm: "السلام عليكم {name}، وصلتنا طلبيتك رقم {order} من {store} بقيمة {total}. تأكد لنا الطلبية باش نجهزوها لك.",
  new: "أهلاً {name}، استلمنا طلبيتك رقم {order} من {store} وحنراجعوها ونتواصلوا معاك قريب.",
  confirmed: "باهي {name}، تم تأكيد طلبيتك رقم {order}. حنجهزوها ونبعثوها لك بإذن الله.",
  with_courier: "{name}، طلبيتك رقم {order} صارت مع المندوب {courier}. خليك جاهز للاستلام والمبلغ {total}.",
  delivered: "تم توصيل طلبيتك رقم {order}. شكراً لثقتك في {store}، ونتمنى تعجبك!",
  returned: "{name}، طلبيتك رقم {order} رجعت لنا. لو صار عندك أي استفسار كلمنا.",
  cancelled: "{name}، تم إلغاء طلبيتك رقم {order}. لو تبي تعيد الطلب نحن موجودين.",
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
