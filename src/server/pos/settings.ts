import { z } from "zod";
import type { PosConfig } from "@/lib/pos-config";
import { firstError } from "@/lib/validation";
import { fail, ok, type Result } from "../catalog/result";
import { t, type StoreScope } from "../tenant";

const schema = z.object({
  paperWidth: z.union([z.literal(58), z.literal(80)]),
  maxDiscountPercent: z.number().int().min(0, "النسبة ما تكونش بالسالب").max(100, "النسبة 100 على الأكثر"),
  loyaltyPercent: z.number().min(0).max(20, "نسبة الولاء كبيرة بزيادة (الحد 20%)"),
  pointValue: z.number().int().min(1, "قيمة النقطة درهم على الأقل").max(100_000),
  defaultCreditLimit: z.number().int().min(0).max(1_000_000_000).nullable(),
  debtAlertDays: z.number().int().min(1).max(365),
  showLogo: z.boolean(),
  /** باركود الميزان */
  scale: z.object({
    prefixes: z.array(z.string().regex(/^\d{2}$/, "بادئة الميزان رقمين")).min(1, "حط بادئة وحدة على الأقل").max(10),
    itemDigits: z.number().int().min(4, "أرقام الصنف من 4 لـ 6").max(6, "أرقام الصنف من 4 لـ 6"),
    value: z.enum(["weight", "price"]),
    priceMultiplier: z.union([z.literal(1), z.literal(10), z.literal(100)]),
  }).optional(),
  reorderCoverDays: z.number().int().min(3, "الأيام من 3 لـ 90").max(90, "الأيام من 3 لـ 90").optional(),
});

export async function savePosConfig(scope: StoreScope, input: unknown): Promise<Result> {
  const p = schema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  // نحافظوا على أي إعداد قديم ما جاش في النموذج
  const [cur] = await scope.from(t.storeSettings).limit(1);
  await scope.update(t.storeSettings, { posConfig: { ...(cur?.posConfig ?? {}), ...p.data } satisfies PosConfig });
  return ok(undefined);
}
