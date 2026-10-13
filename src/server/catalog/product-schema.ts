import { z } from "zod";

const money = z.number({ error: "السعر لازم يكون رقم" }).int("السعر غير صحيح").min(0, "السعر ما يكونش بالسالب").max(1_000_000_000, "السعر كبير بزيادة");
const nullableMoney = money.nullish().transform((v) => v ?? null);

export const MAX_OPTIONS = 3;
export const MAX_VARIANTS = 100;
export const MAX_IMAGES = 10;

const optionValue = z.object({
  id: z.string().min(1),
  value: z.string().trim().min(1, "اكتب قيمة الخيار").max(40, "قيمة الخيار طويلة"),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish().transform((v) => v ?? null),
});

const option = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "اكتب اسم الخيار (مثلاً: المقاس)").max(30, "اسم الخيار طويل"),
  values: z.array(optionValue).min(1, "أضف قيمة وحدة على الأقل لكل خيار").max(30, "قيم كثيرة للخيار الواحد"),
});

const variant = z.object({
  id: z.string().optional(), // موجود = متغير حالي
  valueIds: z.array(z.string()),
  sku: z.string().trim().max(40, "الكود طويل").nullish().transform((v) => v || null),
  price: nullableMoney,
  compareAtPrice: nullableMoney,
  costPrice: nullableMoney,
  stock: z.number({ error: "المخزون لازم يكون رقم" }).int("المخزون لازم يكون رقم صحيح").min(0, "المخزون ما يكونش بالسالب").max(1_000_000, "المخزون كبير بزيادة"),
  isActive: z.boolean().default(true),
});

export const productInputSchema = z
  .object({
    id: z.string().optional(),
    name: z.string({ error: "اكتب اسم المنتج" }).trim().min(1, "اكتب اسم المنتج").max(120, "اسم المنتج طويل بزيادة"),
    description: z.string().trim().max(5000, "الوصف طويل بزيادة").nullish().transform((v) => v || null),
    price: money,
    compareAtPrice: nullableMoney,
    costPrice: nullableMoney,
    isFeatured: z.boolean().default(false),
    isVisible: z.boolean().default(true),
    categoryIds: z.array(z.string()).max(20, "أقسام كثيرة").default([]),
    imageMediaIds: z.array(z.string()).max(MAX_IMAGES, `الحد الأقصى ${MAX_IMAGES} صور`).default([]),
    options: z.array(option).max(MAX_OPTIONS, `الحد الأقصى ${MAX_OPTIONS} خيارات`).default([]),
    variants: z.array(variant).min(1, "لازم متغير واحد على الأقل").max(MAX_VARIANTS, `الحد الأقصى ${MAX_VARIANTS} متغير`),
  })
  .superRefine((p, ctx) => {
    const add = (message: string) => ctx.addIssue({ code: "custom", message });

    if (p.compareAtPrice !== null && p.compareAtPrice <= p.price) add("السعر قبل التخفيض لازم يكون أكبر من السعر الحالي");
    if (new Set(p.imageMediaIds).size !== p.imageMediaIds.length) add("صورة مكررة");
    if (new Set(p.categoryIds).size !== p.categoryIds.length) add("قسم مكرر");

    const optionIds = new Set(p.options.map((o) => o.id));
    if (optionIds.size !== p.options.length) add("خيارات مكررة");
    const valueOwner = new Map<string, string>();
    for (const o of p.options) {
      if (new Set(o.values.map((v) => v.value.toLowerCase())).size !== o.values.length) add(`قيم مكررة في خيار «${o.name}»`);
      for (const v of o.values) {
        if (valueOwner.has(v.id)) add("قيمة مكررة");
        valueOwner.set(v.id, o.id);
      }
    }
    if (new Set(p.options.map((o) => o.name.toLowerCase())).size !== p.options.length) add("اسمين متشابهين للخيارات");

    const seen = new Set<string>();
    for (const v of p.variants) {
      // متغير واحد من كل خيار بالضبط
      const owners = v.valueIds.map((id) => valueOwner.get(id));
      if (owners.some((o) => !o) || new Set(owners).size !== p.options.length || v.valueIds.length !== p.options.length) {
        add("متغير غير صحيح: لازم تختار قيمة وحدة من كل خيار");
        continue;
      }
      const key = [...v.valueIds].sort().join("|");
      if (seen.has(key)) add("فيه متغيرين بنفس الخيارات");
      seen.add(key);
      const effective = v.price ?? p.price;
      if (v.compareAtPrice !== null && v.compareAtPrice <= effective) add("السعر قبل التخفيض لازم يكون أكبر من السعر الحالي");
    }
    if (p.options.length === 0 && p.variants.length !== 1) add("منتج بدون خيارات له متغير واحد فقط");
  });

export type ProductInput = z.input<typeof productInputSchema>;
export type ProductData = z.output<typeof productInputSchema>;
