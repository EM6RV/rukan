// توليد المتغيرات من الخيارات (جداء ديكارتي) مع الحفاظ على المتغيرات الموجودة.

export type OptionLike = { id: string; values: { id: string }[] };
export type VariantLike = { valueIds: string[] };

/** كل التركيبات: خيار1 × خيار2 × … (كل تركيبة = قائمة ids بنفس ترتيب الخيارات) */
export function combinations(options: OptionLike[]): string[][] {
  if (options.length === 0) return [[]];
  return options.reduce<string[][]>(
    (acc, o) => acc.flatMap((combo) => o.values.map((v) => [...combo, v.id])),
    [[]],
  );
}

export const variantKey = (valueIds: string[]) => [...valueIds].sort().join("|");

/**
 * يرجع قائمة المتغيرات الجديدة حسب الخيارات الحالية:
 * المتغير الموجود (نفس التركيبة) يبقى بكل بياناته، والتركيبة الجديدة تتولد افتراضية.
 */
export function syncVariants<V extends VariantLike>(options: OptionLike[], existing: V[], make: (valueIds: string[]) => V): V[] {
  const byKey = new Map(existing.map((v) => [variantKey(v.valueIds), v]));
  return combinations(options).map((combo) => {
    const prev = byKey.get(variantKey(combo));
    return prev ? { ...prev, valueIds: combo } : make(combo);
  });
}
