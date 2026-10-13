import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { writeTransaction, type Db } from "@/db";
import { MAX_SECTIONS, SECTION_TYPES, SINGLE_SECTION_TYPES } from "@/lib/home-sections";
import { slugify, uniqueSlug } from "@/lib/slugify";
import { firstError } from "@/lib/validation";
import { fail, ok, type Result } from "./catalog/result";
import { isUniqueViolation } from "./db-errors";
import { validateOwnMedia } from "./store-service";
import { forStore, t, type StoreScope } from "./tenant";

const optText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} طويل بزيادة (الحد ${max} حرف)`).nullish().transform((v) => v || null);

// ===== نصوص عامة =====

const textsSchema = z.object({
  announcementBar: optText(120, "نص الشريط الإعلاني"),
  thanksMessage: optText(300, "رسالة الشكر"),
  footerText: optText(120, "نص الفوتر"),
});

export async function saveStoreTexts(scope: StoreScope, input: unknown): Promise<Result> {
  const p = textsSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  await scope.update(t.storeSettings, p.data);
  return ok(undefined);
}

// ===== الصفحات =====

/** الصفحات الأساسية: ما تتمسحش (تقدر تخفيها) لأن الفوتر والسياسات تعتمد عليها */
export const CORE_PAGE_SLUGS = ["about", "shipping", "returns", "privacy", "contact"];
export const MAX_PAGES = 20;

export async function listPages(scope: StoreScope) {
  const rows = await scope.from(t.storePages).orderBy(t.storePages.sortOrder, t.storePages.title);
  return rows.map((p) => ({ id: p.id, slug: p.slug, title: p.title, body: p.body, isPublished: p.isPublished, isCore: CORE_PAGE_SLUGS.includes(p.slug) }));
}

const pageSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string({ error: "اكتب عنوان الصفحة" }).trim().min(2, "اكتب العنوان بالتفصيل").max(60, "العنوان طويل (الحد 60 حرف)"),
  body: z.string().max(10_000, "النص طويل بزيادة (الحد 10000 حرف)").default(""),
  isPublished: z.boolean().default(true),
});

export async function savePage(scope: StoreScope, input: unknown): Promise<Result<{ id: string }>> {
  const p = pageSchema.safeParse(input);
  if (!p.success) return fail(firstError(p.error));
  const { id, ...d } = p.data;
  try {
    if (id) {
      const [row] = await scope.update(t.storePages, d, eq(t.storePages.id, id));
      return row ? ok({ id }) : fail("ما لقينا الصفحة. يمكن انحذف، حدّث الصفحة.");
    }
    const pages = await scope.from(t.storePages);
    if (pages.length >= MAX_PAGES) return fail(`وصلت للحد الأقصى (${MAX_PAGES} صفحة).`);
    const slug = uniqueSlug(slugify(d.title, 40) || "page", new Set(pages.map((x) => x.slug)));
    const [row] = await scope.insert(t.storePages, { ...d, slug, sortOrder: Math.max(-1, ...pages.map((x) => x.sortOrder)) + 1 });
    return ok({ id: row!.id });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("فيه صفحة بنفس الرابط. غيّر العنوان.");
    throw e;
  }
}

export async function deletePage(scope: StoreScope, id: string): Promise<Result> {
  const [row] = await scope.from(t.storePages, eq(t.storePages.id, id)).limit(1);
  if (!row) return fail("ما لقينا الصفحة. يمكن انحذف، حدّث الصفحة.");
  if (CORE_PAGE_SLUGS.includes(row.slug)) return fail("هذه صفحة أساسية ما تنحذفش. تقدر تخفيها.");
  await scope.delete(t.storePages, eq(t.storePages.id, id));
  return ok(undefined);
}

export async function reorderPages(scope: StoreScope, ids: string[]): Promise<Result> {
  const existing = await scope.from(t.storePages);
  if (ids.length !== existing.length || new Set(ids).size !== ids.length || !ids.every((i) => existing.some((e) => e.id === i))) return fail("ترتيب غير صحيح، حدّث الصفحة وجرّب من جديد.");
  await Promise.all(ids.map((id, i) => scope.update(t.storePages, { sortOrder: i }, eq(t.storePages.id, id))));
  return ok(undefined);
}

// ===== أقسام الرئيسية =====

export async function listHomeSections(scope: StoreScope) {
  const rows = await scope.from(t.storeHomeSections).orderBy(t.storeHomeSections.position);
  return rows.map((r) => ({ id: r.id, type: r.type as (typeof SECTION_TYPES)[number], isVisible: r.isVisible, config: r.config as Record<string, unknown> }));
}

const linkSchema = z.string().trim().max(300, "الرابط طويل بزيادة").nullish().transform((v, ctx) => {
  if (!v) return null;
  // مسار داخلي في المتجر (/search) أو https فقط: نمنع javascript: وغيره
  if (/^\/(?!\/)[^\s]*$/.test(v) || /^https:\/\/[^\s]+$/.test(v)) return v;
  ctx.addIssue({ code: "custom", message: "الرابط لازم يبدأ بـ https:// أو بـ / (مثل /search)" });
  return z.NEVER;
});

const mediaField = z.string().min(1).nullish().transform((v) => v ?? null);

const configSchemas = {
  hero: z.object({ title: optText(60, "العنوان"), subtitle: optText(120, "العنوان الفرعي"), ctaLabel: optText(24, "نص الزر"), imageMediaId: mediaField }),
  categories: z.object({ title: optText(40, "العنوان") }),
  featured: z.object({ title: optText(40, "العنوان") }),
  banner: z.object({ title: optText(60, "العنوان"), imageMediaId: mediaField, linkUrl: linkSchema }),
  text: z.object({ title: optText(60, "العنوان"), body: z.string().trim().min(1, "اكتب نص القسم").max(600, "النص طويل بزيادة (الحد 600 حرف)") }),
} as const;

const sectionSchema = z.object({
  id: z.string().min(1).nullish(),
  type: z.enum(SECTION_TYPES, { error: "نوع القسم غير صحيح" }),
  isVisible: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
});

/** يحفظ كل الأقسام بترتيبها (الموقع = الترتيب في المصفوفة). الجديد بدون id، والمفقود يتمسح. */
export async function saveHomeSections(db: Db, storeId: string, input: unknown): Promise<Result> {
  const list = z.array(sectionSchema).max(MAX_SECTIONS, `الحد الأقصى ${MAX_SECTIONS} أقسام`).safeParse(input);
  if (!list.success) return fail(firstError(list.error));

  const rows: { id: string | null; type: (typeof SECTION_TYPES)[number]; isVisible: boolean; config: Record<string, unknown> }[] = [];
  for (const s of list.data) {
    const cfg = configSchemas[s.type].safeParse(s.config);
    if (!cfg.success) return fail(firstError(cfg.error));
    const config = Object.fromEntries(Object.entries(cfg.data).filter(([, v]) => v !== null)) as Record<string, unknown>;
    if (s.type === "banner" && !config.imageMediaId) return fail("البانر لازم يكون فيه صورة.");
    if (typeof config.imageMediaId === "string" && !(await validateOwnMedia(db, storeId, config.imageMediaId))) return fail("ما قدرنا نقرا الصورة. ارفع صورة JPG أو PNG أو WebP.");
    rows.push({ id: s.id ?? null, type: s.type, isVisible: s.isVisible, config });
  }
  for (const type of SINGLE_SECTION_TYPES) if (rows.filter((r) => r.type === type).length > 1) return fail("هذا القسم يتحط مرة وحدة بس.");

  try {
    await writeTransaction(db, async (tx) => {
      const s = forStore(tx as unknown as Db, storeId);
      const existing = await s.from(t.storeHomeSections);
      const keep = new Set(rows.map((r) => r.id).filter((x): x is string => !!x && existing.some((e) => e.id === x)));
      const drop = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
      if (drop.length) await s.delete(t.storeHomeSections, inArray(t.storeHomeSections.id, drop));
      for (const [position, r] of rows.entries()) {
        if (r.id && keep.has(r.id)) await s.update(t.storeHomeSections, { type: r.type, position, isVisible: r.isVisible, config: r.config }, eq(t.storeHomeSections.id, r.id));
        else await s.insert(t.storeHomeSections, { type: r.type, position, isVisible: r.isVisible, config: r.config });
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("ما قدرنا نحفظ. جرّب مرة ثانية.");
    throw e;
  }
  return ok(undefined);
}

