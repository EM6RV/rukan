// محرك البيع: حسابات صافية (بدون قاعدة) يستعملها الجهاز (بدون نت) والسيرفر (اللي يعيد الحساب ويعتمده).
// الفلوس كلها بالدرهم integer. الموزون: الكمية بالجرام والسعر للكيلو.
import type { PayMethod } from "./constants";

export type SaleLineInput = {
  quantity: number;
  isWeighed?: boolean;
  unitPrice: number;
  discount?: number;
};

/** إجمالي السطر قبل الخصم */
export const lineGross = (l: SaleLineInput) => (l.isWeighed ? Math.round((l.unitPrice * l.quantity) / 1000) : l.unitPrice * l.quantity);
/** إجمالي السطر بعد خصمه (ما ينزلش تحت الصفر) */
export const lineNet = (l: SaleLineInput) => Math.max(0, lineGross(l) - Math.max(0, l.discount ?? 0));

export type InvoiceDiscount = { kind: "amount" | "percent"; value: number } | null;

export type SaleTotals = { subtotal: number; lineDiscounts: number; discount: number; total: number; lines: number[] };

/** إجماليات الفاتورة: مجموع السطور بعد خصمها، ناقص خصم الفاتورة (مبلغ أو نسبة، ما يتعداش المجموع) */
export function computeTotals(lines: SaleLineInput[], invoiceDiscount: InvoiceDiscount = null): SaleTotals {
  const nets = lines.map(lineNet);
  const subtotal = nets.reduce((s, n) => s + n, 0);
  const lineDiscounts = lines.reduce((s, l) => s + Math.min(lineGross(l), Math.max(0, l.discount ?? 0)), 0);
  let discount = 0;
  if (invoiceDiscount && invoiceDiscount.value > 0) {
    discount = invoiceDiscount.kind === "percent" ? Math.round((subtotal * Math.min(100, invoiceDiscount.value)) / 100) : invoiceDiscount.value;
  }
  discount = Math.min(discount, subtotal);
  return { subtotal, lineDiscounts, discount, total: subtotal - discount, lines: nets };
}

/** نسبة الخصم الكلي من سعر السطور قبل أي خصم (للمقارنة بحد موافقة المشرف) */
export function discountPercentOf(lines: SaleLineInput[], totals: SaleTotals): number {
  const gross = lines.reduce((s, l) => s + lineGross(l), 0);
  if (gross <= 0) return 0;
  return ((totals.lineDiscounts + totals.discount) / gross) * 100;
}

export type PaymentInput = { method: PayMethod; amount: number; ref?: string | null };

export type Settlement = {
  ok: boolean;
  error?: string;
  /** المدفوع فعلاً لكل طريقة (الكاش بعد طرح الباقي) */
  applied: PaymentInput[];
  tendered: number;
  change: number;
  remaining: number;
};

/**
 * الدفع المقسّم: البطاقة/التحويل/الدين/المحفظة ما يتعدوش الإجمالي (ما فيش باقي منهم)،
 * والكاش ممكن يكون أكثر والفرق يرجع للزبون (الباقي).
 */
export function settle(total: number, payments: PaymentInput[]): Settlement {
  const nonCash = payments.filter((p) => p.method !== "cash" && p.amount > 0);
  const cashGiven = payments.filter((p) => p.method === "cash").reduce((s, p) => s + Math.max(0, p.amount), 0);
  const nonCashSum = nonCash.reduce((s, p) => s + p.amount, 0);
  const base = { applied: [] as PaymentInput[], tendered: cashGiven, change: 0, remaining: 0 };
  if (payments.some((p) => !Number.isInteger(p.amount) || p.amount < 0)) return { ...base, ok: false, error: "مبلغ دفع غير صحيح." };
  if (nonCashSum > total) return { ...base, ok: false, error: "مجموع البطاقة والتحويل والدين والمحفظة أكبر من الفاتورة." };
  const cashNeeded = total - nonCashSum;
  const cashApplied = Math.min(cashGiven, cashNeeded);
  const remaining = cashNeeded - cashApplied;
  const applied = [...nonCash.map((p) => ({ method: p.method, amount: p.amount, ref: p.ref ?? null })), ...(cashApplied > 0 ? [{ method: "cash" as const, amount: cashApplied, ref: null }] : [])];
  if (remaining > 0) return { ...base, applied, remaining, ok: false, error: "المدفوع أقل من الفاتورة." };
  return { ok: true, applied, tendered: cashGiven, change: cashGiven - cashApplied, remaining: 0 };
}

// ===== نقاط الولاء =====

/** النقاط المكتسبة: نسبة من الإجمالي ÷ قيمة النقطة */
export const pointsEarned = (total: number, loyaltyPercent: number, pointValue: number) =>
  loyaltyPercent > 0 && pointValue > 0 ? Math.floor((total * loyaltyPercent) / 100 / pointValue) : 0;

// ===== عدّ الفئات (تقفيل الوردية) =====

/** فئات الدينار الليبي بالدرهم، والفكة تتكتب كمبلغ */
export const DENOMINATIONS = [50_000, 20_000, 10_000, 5_000, 1_000] as const;
export type DenominationCount = Partial<Record<string, number>> & { coins?: number };

export function countCash(d: DenominationCount): number {
  let total = Math.max(0, Math.round(d.coins ?? 0));
  for (const v of DENOMINATIONS) total += v * Math.max(0, Math.floor(d[String(v)] ?? 0));
  return total;
}

// ===== الفاتورة على واتساب =====

export function receiptMessage(o: { shopName: string; number: number; at: string; lines: { name: string; quantity: number; isWeighed?: boolean; total: number }[]; total: number; footer?: string | null }, fmt: (n: number) => string): string {
  const rows = o.lines.map((l) => `• ${l.name} × ${l.isWeighed ? `${(l.quantity / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 })} كغ` : l.quantity} = ${fmt(l.total)}`);
  return [`${o.shopName}`, `فاتورة رقم ${o.number} · ${o.at}`, "", ...rows, "", `الإجمالي: ${fmt(o.total)}`, o.footer ? `\n${o.footer}` : ""].join("\n").trim();
}
