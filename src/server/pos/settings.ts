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
});

export async function savePosConfig(scope: StoreScope, input: unknown): Promise<Result> {
  const p = schema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  await scope.update(t.storeSettings, { posConfig: p.data satisfies PosConfig });
  return ok(undefined);
}
