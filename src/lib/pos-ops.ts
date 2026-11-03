// عمليات أجهزة التشغيل (الكاشير/الصالة/الاستقبال). كل عملية تتولد في الجهاز بـ clientId (UUID) وتتسجل في طابور
// (outbox)، وتتزامن مع السيرفر لما يكون فيه نت. السيرفر يطبقها مرة وحدة بس (idempotent) بنفس الترتيب.
// الملف محايد: الجهاز يبني العمليات بنفس الـ schemas اللي السيرفر يتحقق بيها.
import { z } from "zod";
import { PAY_METHODS } from "./constants";

const id = z.string().min(1).max(64);
const clientId = z.string().regex(/^[\w-]{8,64}$/, "معرّف العملية غير صحيح");
const at = z.number().int().positive();
const money = z.number().int().min(0).max(1_000_000_000);

export const saleLineSchema = z.object({
  kind: z.enum(["product", "service", "custom"]).default("product"),
  variantId: id.nullish().transform((v) => v ?? null),
  name: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(10_000_000),
  isWeighed: z.boolean().default(false),
  unitFactor: z.number().int().min(1).max(100_000).default(1),
  unitPrice: money,
  discount: money.default(0),
  refId: id.nullish().transform((v) => v ?? null),
  /** وحدة البيع (كرتونة…) */
  unitId: id.nullish().transform((v) => v ?? null),
  /** العرض التلقائي وخصمه كما حسبه الجهاز (السيرفر يعيد الحساب ويقارن) */
  promotionId: id.nullish().transform((v) => v ?? null),
  promoDiscount: money.default(0),
});

export const OP_SCHEMAS = {
  "shift.open": z.object({ clientId, at, userId: id, openingFloat: money.default(0) }),
  "shift.move": z.object({ clientId, at, userId: id, shiftId: id, kind: z.enum(["in", "out", "drawer"]), amount: money.default(0), reason: z.string().trim().max(200).nullish(), approvedBy: id.nullish() }),
  "shift.close": z.object({ clientId, at, userId: id, shiftId: id, denominations: z.record(z.string(), z.number().int().min(0).max(1_000_000_000)), note: z.string().trim().max(300).nullish() }),
  "customer.create": z.object({ clientId, at, userId: id, phone: z.string().min(5).max(20), name: z.string().trim().min(1).max(80) }),
  sale: z.object({
    clientId, at, userId: id, shiftId: id.nullish(),
    receiptNo: z.string().regex(/^[\w-]{1,24}$/).nullish(),
    customerId: id.nullish(),
    priceLevel: z.enum(["retail", "semi", "wholesale"]).default("retail"),
    lines: z.array(saleLineSchema).min(1).max(500),
    invoiceDiscount: z.object({ kind: z.enum(["amount", "percent"]), value: z.number().int().min(0).max(1_000_000_000) }).nullish(),
    redeemPoints: z.number().int().min(0).max(100_000_000).default(0),
    payments: z.array(z.object({ method: z.enum(PAY_METHODS), amount: money, ref: z.string().max(60).nullish() })).min(1).max(10),
    /** الإجمالي اللي حسبه الجهاز (السيرفر يعيد الحساب ويقارن) */
    total: money,
    approvedBy: id.nullish(),
    note: z.string().trim().max(300).nullish(),
    sourceType: z.string().max(30).nullish(),
    sourceId: id.nullish(),
  }),
  "sale.return": z.object({
    clientId, at, userId: id, shiftId: id.nullish(), saleId: id,
    items: z.array(z.object({ index: z.number().int().min(0).max(499), quantity: z.number().int().min(1).max(10_000_000) })).min(1).max(500),
    refundMethod: z.enum(PAY_METHODS).nullish(),
    reason: z.string().trim().max(200).nullish(),
    approvedBy: id.nullish(),
  }),
  "debt.pay": z.object({ clientId, at, userId: id, shiftId: id.nullish(), customerId: id, amount: money.refine((n) => n > 0, "المبلغ لازم يكون أكبر من صفر"), method: z.enum(["cash", "card", "transfer"]).default("cash") }),
  "wallet.topup": z.object({ clientId, at, userId: id, shiftId: id.nullish(), customerId: id, amount: money.refine((n) => n > 0, "المبلغ لازم يكون أكبر من صفر"), method: z.enum(["cash", "card", "transfer"]).default("cash") }),
  attendance: z.object({ clientId, at, userId: id, kind: z.enum(["in", "out"]) }),
  /** عملية حساسة اتوافق عليها بدون نت (حذف سطر بعد الطباعة، فتح الدرج…) تتسجل في سجل التدقيق */
  audit: z.object({ clientId, at, userId: id, action: z.string().regex(/^[a-z_.]{3,40}$/), approvedBy: id.nullish(), meta: z.record(z.string(), z.unknown()).optional() }),
} as const;

export type OpKind = keyof typeof OP_SCHEMAS;
export const OP_KINDS = Object.keys(OP_SCHEMAS) as OpKind[];
export type OpPayload<K extends OpKind> = z.infer<(typeof OP_SCHEMAS)[K]>;
export type PosOp = { [K in OpKind]: { kind: K; payload: z.input<(typeof OP_SCHEMAS)[K]> } }[OpKind];

export type OpResult = {
  clientId: string;
  /**
   * applied: اتطبقت. duplicate: اتطبقت قبل (نفس النتيجة). rejected: غلط ما يتصلحش بالإعادة (تنشال من الطابور).
   * retry: ناقصها حاجة (مثلاً الفاتورة الأصلية لسه ما وصلتش) أو خطأ مؤقت. blocked: الاشتراك منتهي/موقوف.
   */
  status: "applied" | "duplicate" | "rejected" | "retry" | "blocked";
  error?: string;
  data?: Record<string, unknown>;
};

/** معرّف سطر الفاتورة: ثابت من معرّف الفاتورة وترتيب السطر (باش المرتجع بدون نت يشاور عليه) */
export const saleItemId = (saleId: string, index: number) => `${saleId}-${index}`;
