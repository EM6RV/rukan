// المعالج القصير لكل منظومة (محايد: الواجهة تعرض الخيارات، والسيرفر يتحقق بنفس الـ schemas)
import { z } from "zod";
import { dinarAmountSchema } from "./validation";

// ===== بلاي: أنواع الأجهزة =====
export const STATION_KINDS = ["ps5", "ps4", "xbox", "pc", "switch", "billiard", "pingpong", "other"] as const;
export type StationKind = (typeof STATION_KINDS)[number];
export const STATION_KIND_LABELS: Record<StationKind, string> = {
  ps5: "PS5", ps4: "PS4", xbox: "Xbox", pc: "PC", switch: "Switch", billiard: "بلياردو", pingpong: "بينغ بونغ", other: "نوع ثاني",
};

// ===== فِت: الأقسام =====
export const GYM_SECTIONS = ["men", "women", "mixed"] as const;
export type GymSection = (typeof GYM_SECTIONS)[number];
export const GYM_SECTION_LABELS: Record<GymSection, string> = { men: "رجال", women: "نساء", mixed: "مختلط" };

export const marketSetupSchema = z.object({
  shopName: z.string().trim().min(2, "اكتب اسم المحل").max(60, "اسم المحل طويل"),
  registers: z.number({ error: "اكتب عدد الكاشيرات" }).int("عدد الكاشيرات رقم صحيح").min(1, "كاشير واحد على الأقل").max(50, "عدد الكاشيرات كبير بزيادة"),
  wholesale: z.boolean(),
  scale: z.boolean(),
});

export const loungeSetupSchema = z.object({
  stations: z.array(z.object({ type: z.enum(STATION_KINDS), count: z.number().int().min(0).max(200, "عدد كبير بزيادة") })).max(STATION_KINDS.length)
    .transform((rows) => rows.filter((r) => r.count > 0))
    .refine((rows) => rows.length > 0, "اختار نوع جهاز واحد على الأقل وعدده")
    .refine((rows) => rows.reduce((s, r) => s + r.count, 0) <= 500, "عدد الأجهزة كبير بزيادة"),
  hourlyPrice: dinarAmountSchema({ min: 0.5, max: 1000, label: "سعر الساعة" }),
});

export const gymSetupSchema = z.object({
  sections: z.array(z.enum(GYM_SECTIONS)).min(1, "اختار قسم واحد على الأقل").transform((s) => [...new Set(s)]),
  membershipTypes: z.array(z.object({
    name: z.string().trim().min(2, "اكتب اسم الاشتراك").max(40, "اسم الاشتراك طويل"),
    months: z.number().int("عدد الشهور رقم صحيح").min(1, "شهر على الأقل").max(24, "الحد الأقصى 24 شهر"),
    price: dinarAmountSchema({ min: 1, max: 100_000, label: "سعر الاشتراك" }),
  })).min(1, "زيد نوع اشتراك واحد على الأقل").max(12, "أنواع كثيرة"),
  trainers: z.array(z.string().trim().min(2, "اسم المدرب قصير").max(40, "اسم المدرب طويل")).max(50).default([]),
});
