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

// ===== المتجر =====

export const storeNameSchema = z
  .string({ error: "اكتب اسم المتجر" })
  .trim()
  .min(2, "اسم المتجر قصير بزيادة")
  .max(40, "اسم المتجر طويل بزيادة (40 حرف كحد أقصى)");

export const hexColorSchema = z.string({ error: "اختار لون" }).regex(/^#[0-9a-fA-F]{6}$/, "اللون غير صحيح");

/** مبلغ بالدينار يكتبه المستخدم (يقبل أرقام عربية وفاصلة) ويرجع بالدرهم (عدد صحيح). */
export const dinarAmountSchema = (opts: { min?: number; max?: number; label?: string } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      const n = typeof v === "number" ? v : parseDecimal(v);
      if (n === null || !Number.isFinite(n)) {
        ctx.addIssue({ code: "custom", message: `${opts.label ?? "المبلغ"} لازم يكون رقم` });
        return z.NEVER;
      }
      return Math.round(n * 1000);
    })
    .refine((v) => v >= (opts.min ?? 0) * 1000, `${opts.label ?? "المبلغ"} لازم يكون ${opts.min ?? 0} أو أكثر`)
    .refine((v) => v <= (opts.max ?? 1_000_000) * 1000, `${opts.label ?? "المبلغ"} كبير بزيادة`);

/** يحوّل نص رقم ("١٢٫٥" أو "12,5") إلى number، أو null لو مش رقم. */
export function parseDecimal(input: string): number | null {
  const s = input
    .trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٫,،]/g, ".")
    .replace(/\s/g, "");
  if (s === "" || !/^-?\d*\.?\d+$/.test(s)) return null;
  return Number(s);
}
