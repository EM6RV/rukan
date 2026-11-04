// بوابات الدفع الليبية (LyPay, OnePay, بطاقات عبر «معاملات»).
// ما نخترعش API لأي بوابة: كل adapter هنا هيكل مطفي. لما نوقّع اتفاق ونستلم المفاتيح الرسمية والتوثيق،
// نكمل createCheckout/verifyWebhook لكل واحد ونفعّله من المتغيرات البيئية. الدفع عند الاستلام والتحويل المصرفي شغّالين يدوياً.
export type GatewayId = "lypay" | "onepay" | "moamalat";
export type CheckoutRequest = { orderId: string; orderNumber: number; amount: number; returnUrl: string };
export type CheckoutResult = { redirectUrl: string; reference: string };

export interface PaymentGateway {
  id: GatewayId;
  nameAr: string;
  /** هل المفاتيح موجودة والـ adapter مكتمل؟ */
  isReady(): boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** تحقق توقيع إشعار الدفع الراجع من البوابة ويرجع مرجع الدفعة لو صحيح */
  verifyWebhook(headers: Headers, rawBody: string): Promise<{ reference: string; paid: boolean } | null>;
}

export class GatewayNotReadyError extends Error {
  constructor(name: string) { super(`بوابة ${name} غير مفعّلة بعد.`); }
}

function stub(id: GatewayId, nameAr: string, envKey: string): PaymentGateway {
  return {
    id, nameAr,
    isReady: () => false, // يبقى false لين نكمل الربط الرسمي (حتى لو المفتاح موجود)
    async createCheckout() { throw new GatewayNotReadyError(nameAr); },
    async verifyWebhook() { void envKey; return null; },
  };
}

export const GATEWAYS: Record<GatewayId, PaymentGateway> = {
  lypay: stub("lypay", "LyPay", "LYPAY_API_KEY"),
  onepay: stub("onepay", "OnePay", "ONEPAY_API_KEY"),
  moamalat: stub("moamalat", "بطاقات (معاملات)", "MOAMALAT_API_KEY"),
};

export const listGateways = () => Object.values(GATEWAYS).map((g) => ({ id: g.id, nameAr: g.nameAr, ready: g.isReady() }));
