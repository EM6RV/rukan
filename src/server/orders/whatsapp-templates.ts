import { eq } from "drizzle-orm";
import { z } from "zod";
import { DEFAULT_WHATSAPP_TEMPLATES, WHATSAPP_KEYS, WHATSAPP_VARIABLES } from "@/lib/whatsapp-defaults";
import { firstError } from "@/lib/validation";
import { fail, ok, type Result } from "../catalog/result";
import { t, type StoreScope } from "../tenant";

/** القوالب الفعلية للمتجر (تتزرع عند إنشاء المتجر)؛ isCustom = مختلفة عن الافتراضي */
export async function getWhatsappTemplates(scope: StoreScope): Promise<Record<string, { body: string; isCustom: boolean }>> {
  const rows = await scope.from(t.whatsappTemplates);
  const stored = new Map(rows.map((r) => [r.key, r.body]));
  return Object.fromEntries(
    WHATSAPP_KEYS.map((k) => {
      const def = DEFAULT_WHATSAPP_TEMPLATES[k]!;
      const body = stored.get(k) ?? def;
      return [k, { body, isCustom: body !== def }];
    }),
  );
}

const saveSchema = z.object({
  key: z.string().refine((k) => WHATSAPP_KEYS.includes(k), "نوع الرسالة غير صحيح"),
  body: z.string().trim().min(5, "الرسالة قصيرة بزيادة").max(600, "الرسالة طويلة بزيادة (الحد 600 حرف)"),
});

/** body فاضي = رجّع الافتراضي */
export async function saveWhatsappTemplate(scope: StoreScope, input: unknown): Promise<Result> {
  const raw = input as { key?: unknown; body?: unknown } | null;
  if (raw && typeof raw.key === "string" && typeof raw.body === "string" && !raw.body.trim() && WHATSAPP_KEYS.includes(raw.key)) {
    await scope.delete(t.whatsappTemplates, eq(t.whatsappTemplates.key, raw.key));
    return ok(undefined);
  }
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const unknown = [...parsed.data.body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).filter((v) => !(WHATSAPP_VARIABLES as readonly string[]).includes(v));
  if (unknown.length) return fail(`متغير غير معروف: {${unknown[0]}}. المتاح: ${WHATSAPP_VARIABLES.map((v) => `{${v}}`).join(" ")}`);
  const { key, body } = parsed.data;
  const [row] = await scope.from(t.whatsappTemplates, eq(t.whatsappTemplates.key, key)).limit(1);
  if (row) await scope.update(t.whatsappTemplates, { body }, eq(t.whatsappTemplates.id, row.id));
  else await scope.insert(t.whatsappTemplates, { key, body });
  return ok(undefined);
}
