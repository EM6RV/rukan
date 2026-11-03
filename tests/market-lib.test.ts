import { describe, expect, it } from "vitest";
import { barcodeModules, code128Modules, ean13Modules, eanCheckDigit, internalBarcode, isValidEan, parseScaleBarcode, samePlu, withCheckDigit } from "@/lib/barcode";
import { batchRemaining, levelPrice, suggestedExpiryDiscount, unitPrice } from "@/lib/market-pricing";
import { computeTotals, discountPercentOf } from "@/lib/pos-engine";
import { applyPromotions, libyaClock, type Promo, type PromoLine } from "@/lib/promotions";

describe("الباركود", () => {
  it("رقم التحقق لـ EAN-13 و EAN-8", () => {
    expect(eanCheckDigit("629104150021")).toBe(3); // 6291041500213
    expect(isValidEan("6291041500213")).toBe(true);
    expect(isValidEan("6291041500214")).toBe(false);
    expect(isValidEan("96385074")).toBe(true);
    expect(isValidEan("12345")).toBe(false);
    expect(isValidEan("abcdefghijklm")).toBe(false);
  });

  it("الباركود الداخلي يبدا بـ 29 وطوله 13 وصحيح", () => {
    const c = internalBarcode(42);
    expect(c).toMatch(/^29\d{11}$/);
    expect(c.slice(2, 12)).toBe("0000000042");
    expect(isValidEan(c)).toBe(true);
    expect(internalBarcode(43)).not.toBe(c);
  });

  it("باركود الميزان: الوزن بالجرام ورقم الصنف", () => {
    const code = withCheckDigit("20" + "00123" + "01250"); // صنف 123، 1.250 كغ
    expect(parseScaleBarcode(code)).toEqual({ plu: "123", grams: 1250, price: null });
    expect(samePlu("00123", "123")).toBe(true);
    expect(samePlu("124", "123")).toBe(false);
  });

  it("باركود الميزان: السعر، والبادئات قابلة للضبط، والكود الغلط يترفض", () => {
    const code = withCheckDigit("27" + "04512" + "07500");
    expect(parseScaleBarcode(code)).toBeNull(); // 27 مش من البادئات الافتراضية
    expect(parseScaleBarcode(code, { prefixes: ["27"], itemDigits: 5, value: "price", priceMultiplier: 1 })).toEqual({ plu: "4512", grams: null, price: 7500 });
    expect(parseScaleBarcode(code, { prefixes: ["27"], itemDigits: 5, value: "price", priceMultiplier: 10 })?.price).toBe(75000);
    const broken = code.slice(0, 12) + String((Number(code[12]) + 1) % 10);
    expect(parseScaleBarcode(broken, { prefixes: ["27"], itemDigits: 5, value: "price", priceMultiplier: 1 })).toBeNull();
    expect(parseScaleBarcode("6291041500213")).toBeNull(); // باركود منتج عادي
  });

  it("أشرطة EAN-13 (95 وحدة) و Code128", () => {
    const m = ean13Modules("6291041500213");
    expect(m).toHaveLength(95);
    expect(m.startsWith("101")).toBe(true);
    expect(m.slice(45, 50)).toBe("01010");
    expect(m.endsWith("101")).toBe(true);
    const c = code128Modules("SKU-1");
    expect(c.startsWith("11010010000")).toBe(true); // Start B
    expect(c.endsWith("1100011101011")).toBe(true); // Stop
    expect(barcodeModules("SKU-1").kind).toBe("code128");
    expect(barcodeModules("6291041500213").kind).toBe("ean13");
  });
});

describe("مستويات السعر والوحدات", () => {
  const p = { retail: 1500, semi: 1400, wholesale: 1250 };
  it("سعر الحبة لكل مستوى، والناقص يرجع للي قبله", () => {
    expect(levelPrice(p, "wholesale")).toBe(1250);
    expect(levelPrice({ retail: 1500, semi: 1400 }, "wholesale")).toBe(1400);
    expect(levelPrice({ retail: 1500 }, "semi")).toBe(1500);
  });
  it("الكرتونة: سعرها الخاص أو المعامل × سعر الحبة لنفس المستوى", () => {
    const carton = { factor: 24, price: 33000 };
    expect(unitPrice(p, carton, "retail")).toBe(33000);
    expect(unitPrice(p, carton, "wholesale")).toBe(1250 * 24);
    expect(unitPrice(p, { factor: 24, wholesalePrice: 28000 }, "wholesale")).toBe(28000);
    expect(unitPrice({ retail: 1500 }, { factor: 24 }, "wholesale")).toBe(1500 * 24);
    expect(unitPrice(p, null, "semi")).toBe(1400);
  });
  it("خصم الصلاحية المقترح", () => {
    expect(suggestedExpiryDiscount(3)).toBe(30);
    expect(suggestedExpiryDiscount(10)).toBe(15);
    expect(suggestedExpiryDiscount(25)).toBe(5);
    expect(suggestedExpiryDiscount(60)).toBe(0);
    expect(suggestedExpiryDiscount(-1)).toBe(0);
  });
  it("FEFO: المخزون الحالي في الدفعات الأبعد انتهاءً", () => {
    const b = [
      { id: "jan", quantity: 20, expiresAt: Date.UTC(2027, 0, 1), receivedAt: 1 },
      { id: "mar", quantity: 24, expiresAt: Date.UTC(2027, 2, 1), receivedAt: 2 },
    ];
    let r = batchRemaining(b, 30);
    expect(r.remaining.get("mar")).toBe(24);
    expect(r.remaining.get("jan")).toBe(6);
    expect(r.untracked).toBe(0);
    r = batchRemaining(b, 50);
    expect(r.remaining.get("jan")).toBe(20);
    expect(r.untracked).toBe(6);
    r = batchRemaining(b, -3);
    expect(r.remaining.get("mar")).toBe(0);
  });
});

describe("محرك العروض", () => {
  const at = Date.UTC(2026, 10, 3, 10, 0); // الثلاثاء 12:00 بتوقيت ليبيا
  const promo = (o: Partial<Promo> & Pick<Promo, "kind" | "config">): Promo => ({ id: o.kind, name: o.kind, startsAt: null, endsAt: null, isActive: true, ...o });
  const line = (variantId: string, quantity: number, unitPrice: number, extra: Partial<PromoLine> = {}): PromoLine => ({ variantId, quantity, unitPrice, unitFactor: 1, isWeighed: false, ...extra });

  it("اشتري 2 وخذ 1: الأرخص مجاناً", () => {
    const r = applyPromotions([line("a", 2, 1000), line("b", 1, 800)], [promo({ kind: "buy_x_get_y", config: { variantIds: ["a", "b"], buy: 2, get: 1 } })], at);
    expect(r.discounts).toEqual([0, 800]);
    expect(r.promotionIds).toEqual([null, "buy_x_get_y"]);
    expect(r.applied[0]!.amount).toBe(800);
  });

  it("الحبة الثانية بنص السعر", () => {
    const r = applyPromotions([line("a", 4, 1000)], [promo({ kind: "nth_discount", config: { variantIds: ["a"], nth: 2, percent: 50 } })], at);
    expect(r.discounts).toEqual([1000]); // حبتين بنص السعر
  });

  it("سعر بالوقت: داخل الساعات والأيام بس", () => {
    const tp = promo({ kind: "time_price", config: { variantIds: ["a"], percent: 20, days: [2], fromMinute: 11 * 60, toMinute: 14 * 60 } });
    expect(libyaClock(at)).toEqual({ day: 2, minute: 12 * 60 });
    expect(applyPromotions([line("a", 1, 1000)], [tp], at).discounts).toEqual([200]);
    expect(applyPromotions([line("a", 1, 1000)], [tp], at + 3 * 3_600_000).discounts).toEqual([0]);
    // الموزون: نسبة من سعر الوزن
    expect(applyPromotions([line("a", 500, 10000, { isWeighed: true })], [tp], at).discounts).toEqual([1000]);
  });

  it("سعر الباقة يتوزع على الأصناف", () => {
    const bp = promo({ kind: "bundle_price", config: { items: [{ variantId: "tea", qty: 1 }, { variantId: "sugar", qty: 2 }], price: 5000 } });
    const r = applyPromotions([line("tea", 1, 3000), line("sugar", 2, 1500)], [bp], at);
    expect(r.discounts[0]! + r.discounts[1]!).toBe(1000);
    expect(applyPromotions([line("tea", 1, 3000), line("sugar", 1, 1500)], [bp], at).discounts).toEqual([0, 0]);
  });

  it("العرض المنتهي أو الموقوف ما يتطبقش، والسطر ياخذ عرض واحد بس", () => {
    const off = promo({ kind: "nth_discount", config: { variantIds: ["a"], nth: 2, percent: 50 }, isActive: false });
    const ended = promo({ kind: "nth_discount", config: { variantIds: ["a"], nth: 2, percent: 50 }, endsAt: at - 1 });
    expect(applyPromotions([line("a", 2, 1000)], [off, ended], at).discounts).toEqual([0]);
    const first = promo({ id: "p1", kind: "nth_discount", config: { variantIds: ["a"], nth: 2, percent: 50 } });
    const second = promo({ id: "p2", kind: "time_price", config: { variantIds: ["a"], percent: 10, days: [], fromMinute: 0, toMinute: 1440 } });
    const r = applyPromotions([line("a", 2, 1000)], [first, second], at);
    expect(r.promotionIds).toEqual(["p1"]);
    expect(r.discounts).toEqual([500]);
  });

  it("الكرتونة ما تدخلش في عروض الحبة، والإعداد الغلط يتجاهل", () => {
    const r = applyPromotions([line("a", 2, 24000, { unitFactor: 24 })], [promo({ kind: "nth_discount", config: { variantIds: ["a"], nth: 2, percent: 50 } })], at);
    expect(r.discounts).toEqual([0]);
    expect(applyPromotions([line("a", 2, 1000)], [promo({ kind: "nth_discount", config: { nth: "x" } })], at).discounts).toEqual([0]);
  });

  it("خصم العرض يدخل في الإجمالي وما يدخلش في نسبة خصم الكاشير", () => {
    const lines = [{ quantity: 2, unitPrice: 1000, promoDiscount: 500 }, { quantity: 1, unitPrice: 1000, discount: 100 }];
    const t = computeTotals(lines, null);
    expect(t.total).toBe(2000 - 500 + 1000 - 100);
    expect(t.promoDiscounts).toBe(500);
    expect(t.lineDiscounts).toBe(100);
    expect(discountPercentOf(lines, t)).toBeCloseTo((100 / 2500) * 100);
  });
});
