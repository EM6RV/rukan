import { STORE_TEMPLATES } from "@/lib/constants";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { media, siteContent } from "@/db/schema/platform";
import { DEFAULT_SITE_CONTENT, FEATURE_ICONS, type SiteContent } from "@/lib/site-content";
import { firstError, hexColorSchema } from "@/lib/validation";
import { writeAudit } from "../audit";
import { fail, ok, type Result } from "../catalog/result";

const KEY = "marketing";

const str = (max: number, label: string, min = 0) => z.string({ error: `${label} مطلوب` }).trim().min(min, `${label} مطلوب`).max(max, `${label} طويل بزيادة (الحد ${max} حرف)`);

/** رابط مسموح: فاضي، مسار داخلي، أو https */
const link = z.string().trim().max(300, "الرابط طويل").transform((v, ctx) => {
  if (!v) return "";
  if (/^\/(?!\/)[^\s]*$/.test(v) || /^https:\/\/[^\s]+$/.test(v)) return v;
  ctx.addIssue({ code: "custom", message: "الرابط لازم يبدأ بـ https:// أو بـ /" });
  return z.NEVER;
});

const schema = z.object({
  hero: z.object({ badge: str(60, "شارة الهيرو"), title: str(90, "عنوان الهيرو", 2), subtitle: str(300, "وصف الهيرو"), primaryCta: str(30, "نص الزر الرئيسي", 2), secondaryCta: str(30, "نص الزر الثاني"), imageMediaId: z.string().min(1).nullish().transform((v) => v ?? null) }),
  features: z.object({ title: str(80, "عنوان المميزات", 2), subtitle: str(200, "وصف المميزات"), items: z.array(z.object({ icon: z.enum(FEATURE_ICONS, { error: "أيقونة غير صحيحة" }), title: str(50, "عنوان الميزة", 2), text: str(220, "نص الميزة", 2) })).min(1, "ميزة وحدة على الأقل").max(9, "الحد الأقصى 9 مميزات") }),
  showcase: z.object({ title: str(80, "عنوان الأمثلة", 2), subtitle: str(200, "وصف الأمثلة"), items: z.array(z.object({ name: str(40, "اسم المتجر", 2), category: str(40, "نوع النشاط"), primary: hexColorSchema, accent: hexColorSchema, template: z.enum(STORE_TEMPLATES, { error: "قالب غير صحيح" }), href: link })).max(6, "الحد الأقصى 6 أمثلة") }),
  design: z.object({ title: str(80, "عنوان خدمات التصميم", 2), subtitle: str(250, "وصف خدمات التصميم"), button: str(30, "نص زر خدمات التصميم", 2), items: z.array(z.object({ title: str(50, "عنوان الخدمة", 2), text: str(220, "نص الخدمة") })).min(1, "خدمة وحدة على الأقل").max(6, "الحد الأقصى 6 خدمات") }).default(DEFAULT_SITE_CONTENT.design),
  steps: z.object({ title: str(80, "عنوان الخطوات", 2), items: z.array(z.object({ title: str(40, "عنوان الخطوة", 2), text: str(180, "نص الخطوة") })).min(1).max(5, "الحد الأقصى 5 خطوات") }),
  pricing: z.object({
    title: str(80, "عنوان الأسعار", 2), subtitle: str(200, "وصف الأسعار"), note: str(250, "ملاحظة الأسعار"),
    // حقول جديدة (المرحلة 1): المحتوى المحفوظ قبلها ياخذ الافتراضي
    popularBadge: str(24, "شارة الأكثر طلباً", 2).default(DEFAULT_SITE_CONTENT.pricing.popularBadge),
    compareTitle: str(60, "عنوان المقارنة", 2).default(DEFAULT_SITE_CONTENT.pricing.compareTitle),
    compareSubtitle: str(160, "وصف المقارنة").default(DEFAULT_SITE_CONTENT.pricing.compareSubtitle),
    rows: z.record(z.string().max(40), z.string().trim().max(50, "اسم الميزة طويل")).default({}),
  }),
  faq: z.object({ title: str(80, "عنوان الأسئلة", 2), items: z.array(z.object({ q: str(120, "السؤال", 2), a: str(500, "الجواب", 2) })).max(12, "الحد الأقصى 12 سؤال") }),
  cta: z.object({ title: str(80, "عنوان الدعوة", 2), subtitle: str(200, "وصف الدعوة"), button: str(30, "نص الزر", 2) }),
  footer: z.object({ text: str(160, "نص الفوتر") }),
  seo: z.object({ title: str(70, "عنوان SEO", 2), description: str(160, "وصف SEO") }),
});

/** المحتوى المحفوظ مدمج فوق الافتراضي (لو الحقل ناقص أو المحفوظ تالف نرجع للافتراضي) */
export async function getSiteContent(db: Db): Promise<SiteContent> {
  const row = await db.select().from(siteContent).where(eq(siteContent.key, KEY)).get();
  if (!row) return DEFAULT_SITE_CONTENT;
  const parsed = schema.safeParse(row.value);
  return parsed.success ? (parsed.data as SiteContent) : DEFAULT_SITE_CONTENT;
}

export async function saveSiteContent(db: Db, input: unknown, actorUserId: string): Promise<Result> {
  const p = schema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const img = p.data.hero.imageMediaId;
  if (img) {
    const m = await db.select({ id: media.id, storeId: media.storeId, isPrivate: media.isPrivate }).from(media).where(eq(media.id, img)).get();
    if (!m || m.storeId !== null || m.isPrivate) return fail("ما قدرنا نقرا صورة الهيرو. ارفع صورة JPG أو PNG أو WebP.");
  }
  await db.insert(siteContent).values({ key: KEY, value: p.data, updatedBy: actorUserId }).onConflictDoUpdate({ target: siteContent.key, set: { value: p.data, updatedBy: actorUserId, updatedAt: new Date() } });
  await writeAudit(db, { actorUserId, storeId: null, action: "site.content", entityType: "site_content", entityId: KEY });
  return ok(undefined);
}

export async function resetSiteContent(db: Db, actorUserId: string): Promise<Result> {
  await db.delete(siteContent).where(eq(siteContent.key, KEY));
  await writeAudit(db, { actorUserId, storeId: null, action: "site.content_reset", entityType: "site_content", entityId: KEY });
  return ok(undefined);
}
