// منطق الأسعار (بالدرهم): السعر الفعلي للمتغير = سعره الخاص أو سعر المنتج.

type ProductPrice = { price: number; compareAtPrice: number | null };
type VariantPrice = { price: number | null; compareAtPrice: number | null };

export const variantPrice = (p: ProductPrice, v: VariantPrice) => v.price ?? p.price;

/** السعر قبل التخفيض: لو للمتغير سعر خاص نستعمل سعره القديم بس (مش سعر المنتج القديم). يرجع null لو مش أكبر من السعر. */
export function variantCompareAt(p: ProductPrice, v: VariantPrice): number | null {
  const price = variantPrice(p, v);
  const compare = v.price === null ? (v.compareAtPrice ?? p.compareAtPrice) : v.compareAtPrice;
  return compare !== null && compare > price ? compare : null;
}

export const discountPercent = (price: number, compareAt: number | null) =>
  compareAt && compareAt > price ? Math.round((1 - price / compareAt) * 100) : null;

/** مدى الأسعار للمنتج (للبطاقات): {min, max, compareAt للأرخص} */
export function priceRange(p: ProductPrice, variants: VariantPrice[]) {
  if (variants.length === 0) return { min: p.price, max: p.price, compareAt: p.compareAtPrice && p.compareAtPrice > p.price ? p.compareAtPrice : null };
  const prices = variants.map((v) => variantPrice(p, v));
  const min = Math.min(...prices);
  const cheapest = variants.find((v) => variantPrice(p, v) === min)!;
  return { min, max: Math.max(...prices), compareAt: variantCompareAt(p, cheapest) };
}
