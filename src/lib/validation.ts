import { z } from "zod";
import { normalizeLibyanPhone } from "./phone";

export const phoneSchema = z
  .string({ error: "اكتب رقم الهاتف" })
  .trim()
  .transform((v, ctx) => {
    const n = normalizeLibyanPhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "رقم الهاتف مش صحيح. استعمل رقم ليبي مثل 0912345678" });
      return z.NEVER;
    }
    return n;
  });

export const passwordSchema = z
  .string({ error: "اكتب كلمة السر" })
  .min(8, "كلمة السر لازم تكون 8 حروف على الأقل")
  .max(128, "كلمة السر طويلة بزيادة");

export const nameSchema = z
  .string({ error: "اكتب الاسم" })
  .trim()
  .min(2, "الاسم قصير بزيادة")
  .max(80, "الاسم طويل بزيادة");

export const registerSchema = z.object({ name: nameSchema, phone: phoneSchema, password: passwordSchema });
export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string({ error: "اكتب كلمة السر" }).min(1, "اكتب كلمة السر").max(128),
});

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
export const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "dashboard", "s", "static", "assets", "mail", "ftp", "support",
  "help", "blog", "login", "register", "rukn", "store", "stores", "cdn", "img", "media", "_next",
]);

export const slugSchema = z
  .string({ error: "اكتب رابط المتجر" })
  .trim()
  .toLowerCase()
  .refine((v) => SLUG_RE.test(v), "الرابط لازم يكون حروف إنجليزية صغيرة وأرقام وشرطات، من 3 إلى 30 حرف")
  .refine((v) => !RESERVED_SLUGS.has(v), "هذا الرابط محجوز، اختار غيره");

/** يرجع أول رسالة خطأ بالعربي من نتيجة Zod */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "البيانات غير صحيحة";
}
