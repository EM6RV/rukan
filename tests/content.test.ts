import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { media, users } from "@/db/schema/platform";
import { deletePage, listHomeSections, listPages, reorderPages, saveHomeSections, savePage, saveStoreTexts } from "@/server/content-service";
import { createStoreForUser } from "@/server/store-service";
import { forStore, t } from "@/server/tenant";
import { makeTestDb } from "./helpers/db";

let db: Db;
let close: () => void;
let seq = 0;

async function shop(slug: string) {
  const [u] = await db.insert(users).values({ phone: `0917${String(++seq).padStart(6, "0")}`, name: "u", passwordHash: "x" }).returning();
  const r = await createStoreForUser(db, { userId: u!.id, name: slug, slug });
  if (!r.ok) throw new Error(r.error);
  return { id: r.data.storeId, scope: forStore(db, r.data.storeId) };
}
const img = async (storeId: string) => (await db.insert(media).values({ storeId, mime: "image/webp", size: 1, driver: "turso" }).returning())[0]!.id;

beforeAll(async () => { ({ db, close } = await makeTestDb()); });
afterAll(() => close());

describe("نصوص المتجر", () => {
  it("حفظ وتفريغ وحدود الطول", async () => {
    const s = await shop("ct-1");
    expect((await saveStoreTexts(s.scope, { announcementBar: " توصيل مجاني ", thanksMessage: "شكراً", footerText: "" })).ok).toBe(true);
    expect((await s.scope.from(t.storeSettings))[0]).toMatchObject({ announcementBar: "توصيل مجاني", thanksMessage: "شكراً", footerText: null });
    expect(await saveStoreTexts(s.scope, { announcementBar: "ا".repeat(121) })).toEqual({ ok: false, error: expect.stringContaining("الشريط الإعلاني") });
    expect((await saveStoreTexts(s.scope, { thanksMessage: "ا".repeat(301) })).ok).toBe(false);
  });
});

describe("الصفحات", () => {
  it("الأساسية موجودة، إنشاء صفحة مخصصة برابط فريد، تعديل، إخفاء، حذف", async () => {
    const s = await shop("ct-2");
    expect((await listPages(s.scope)).filter((p) => p.isCore).map((p) => p.slug).sort()).toEqual(["about", "contact", "privacy", "returns", "shipping"]);

    const a = await savePage(s.scope, { title: "سياسة الضمان", body: "ضمان سنة" });
    const b = await savePage(s.scope, { title: "سياسة الضمان", body: "نسخة ثانية" });
    if (!a.ok || !b.ok) throw new Error("setup");
    const pages = await listPages(s.scope);
    const slugs = pages.filter((p) => !p.isCore).map((p) => p.slug);
    expect(slugs).toEqual(["سياسة-الضمان", "سياسة-الضمان-2"]);

    expect((await savePage(s.scope, { id: a.data.id, title: "الضمان", body: "جديد", isPublished: false })).ok).toBe(true);
    const edited = (await listPages(s.scope)).find((p) => p.id === a.data.id)!;
    expect(edited).toMatchObject({ title: "الضمان", slug: "سياسة-الضمان", isPublished: false }); // الرابط ثابت بعد التعديل

    expect((await savePage(s.scope, { title: "ا" })).ok).toBe(false);
    expect((await savePage(s.scope, { title: "عنوان", body: "ا".repeat(10_001) })).ok).toBe(false);
    expect((await savePage(s.scope, { id: "ghost", title: "عنوان" })).ok).toBe(false);

    const about = (await listPages(s.scope)).find((p) => p.slug === "about")!;
    expect(await deletePage(s.scope, about.id)).toEqual({ ok: false, error: expect.stringContaining("أساسية") });
    expect((await deletePage(s.scope, a.data.id)).ok).toBe(true);
    expect((await deletePage(s.scope, a.data.id)).ok).toBe(false);
  });

  it("حد الصفحات وإعادة الترتيب، والعزل", async () => {
    const [a, b] = [await shop("ct-3"), await shop("ct-4")];
    const all = (await listPages(a.scope)).map((p) => p.id);
    expect((await reorderPages(a.scope, [...all].reverse())).ok).toBe(true);
    expect((await listPages(a.scope)).map((p) => p.id)).toEqual([...all].reverse());
    expect((await reorderPages(a.scope, all.slice(1))).ok).toBe(false);
    expect((await reorderPages(a.scope, [...all.slice(1), (await listPages(b.scope))[0]!.id])).ok).toBe(false);

    const foreign = (await listPages(b.scope))[0]!;
    expect((await savePage(a.scope, { id: foreign.id, title: "اختراق" })).ok).toBe(false);
    expect((await deletePage(a.scope, foreign.id)).ok).toBe(false);

    for (let i = 0; i < 15; i++) await savePage(a.scope, { title: `صفحة ${i} مخصصة` });
    expect(await savePage(a.scope, { title: "زيادة عن الحد" })).toEqual({ ok: false, error: expect.stringContaining("الأقصى") });
  });
});

describe("أقسام الرئيسية", () => {
  it("الافتراضية ثم حفظ بترتيب جديد وإضافة بانر ونص وحذف المفقود", async () => {
    const s = await shop("hs-1");
    const def = await listHomeSections(s.scope);
    expect(def.map((x) => x.type)).toEqual(["hero", "categories", "featured"]);
    const image = await img(s.id);

    const r = await saveHomeSections(db, s.id, [
      { id: def[2]!.id, type: "featured", config: { title: "الأكثر طلباً" } },
      { type: "banner", config: { imageMediaId: image, title: "عرض الصيف", linkUrl: "/search" } },
      { id: def[0]!.id, type: "hero", isVisible: false, config: { title: "", subtitle: "مرحباً", ctaLabel: "تسوّق" } },
      { type: "text", config: { title: "عنّا", body: "نص تعريفي" } },
    ]);
    expect(r.ok).toBe(true);
    const after = await listHomeSections(s.scope);
    expect(after.map((x) => x.type)).toEqual(["featured", "banner", "hero", "text"]);
    expect(after[0]).toMatchObject({ id: def[2]!.id, config: { title: "الأكثر طلباً" } });
    expect(after[1]!.config).toEqual({ imageMediaId: image, title: "عرض الصيف", linkUrl: "/search" });
    expect(after[2]).toMatchObject({ id: def[0]!.id, isVisible: false, config: { subtitle: "مرحباً", ctaLabel: "تسوّق" } });
    expect(after[2]!.config).not.toHaveProperty("title"); // الفاضي ما ينحفظش
    expect(await s.scope.count(t.storeHomeSections)).toBe(4); // الأقسام غير المرسلة اتمسحت
  });

  it("رفض مدخلات غلط", async () => {
    const [a, b] = [await shop("hs-2"), await shop("hs-3")];
    const foreign = await img(b.id);
    const err = async (list: unknown) => { const r = await saveHomeSections(db, a.id, list); return r.ok ? "OK" : r.error; };
    expect(await err([{ type: "banner", config: {} }])).toContain("صورة");
    expect(await err([{ type: "banner", config: { imageMediaId: foreign } }])).toContain("ما قدرنا نقرا الصورة");
    expect(await err([{ type: "banner", config: { imageMediaId: await img(a.id), linkUrl: "javascript:alert(1)" } }])).toContain("الرابط");
    expect(await err([{ type: "banner", config: { imageMediaId: await img(a.id), linkUrl: "//evil.com" } }])).toContain("الرابط");
    expect(await err([{ type: "banner", config: { imageMediaId: await img(a.id), linkUrl: "http://insecure.com" } }])).toContain("الرابط");
    expect(await err([{ type: "text", config: { body: "" } }])).toContain("اكتب نص");
    expect(await err([{ type: "hero", config: {} }, { type: "hero", config: {} }])).toContain("مرة وحدة");
    expect(await err([{ type: "marquee", config: {} }])).toContain("نوع القسم");
    expect(await err(Array.from({ length: 13 }, () => ({ type: "text", config: { body: "x" } })))).toContain("الحد الأقصى");
    expect(await err([{ type: "hero", config: { title: "ا".repeat(61) } }])).toContain("العنوان");
    expect(await err([{ type: "banner", config: { imageMediaId: await img(a.id), linkUrl: "https://example.com/offer" } }])).toBe("OK");
  });

  it("متجر ما يقدر يحدّث قسم متجر ثاني بالـ id", async () => {
    const [a, b] = [await shop("hs-4"), await shop("hs-5")];
    const bSec = (await listHomeSections(b.scope))[0]!;
    await saveHomeSections(db, a.id, [{ id: bSec.id, type: "text", config: { body: "اختراق" } }]);
    expect((await listHomeSections(b.scope))[0]).toMatchObject({ id: bSec.id, type: "hero" });
    expect((await listHomeSections(a.scope)).map((x) => x.type)).toEqual(["text"]);
  });
});

describe("التصميم", () => {
  it("حفظ القالب والألوان والخط، وحدود الباقة والتحقق", async () => {
    const { saveDesignSettings } = await import("@/server/settings-service");
    const { stores } = await import("@/db/schema/platform");
    const { eq } = await import("drizzle-orm");
    const ALL = { maxProducts: null, maxStaff: 3, allTemplates: true, coupons: true, reports: true, customDomain: false, pixels: true, removeBranding: false };
    const s = await shop("ds-1");
    const logo = await img(s.id);
    const good = { template: "nabd", primaryColor: "#112233", accentColor: "#aabbcc", fontKey: "cairo", logoMediaId: logo };
    expect((await saveDesignSettings(db, s.id, good, ALL)).ok).toBe(true);
    expect((await s.scope.from(t.storeSettings))[0]).toMatchObject({ primaryColor: "#112233", accentColor: "#aabbcc", fontKey: "cairo" });
    expect((await db.select().from(stores).where(eq(stores.id, s.id)))[0]).toMatchObject({ template: "nabd", logoMediaId: logo });

    expect(await saveDesignSettings(db, s.id, { ...good, template: "makhmal" }, { ...ALL, allTemplates: false })).toEqual({ ok: false, error: expect.stringContaining("الباقات الأعلى") });
    expect((await saveDesignSettings(db, s.id, { ...good, template: "naqa" }, { ...ALL, allTemplates: false })).ok).toBe(true);
    expect((await saveDesignSettings(db, s.id, { ...good, fontKey: "comic-sans" }, ALL)).ok).toBe(false);
    expect((await saveDesignSettings(db, s.id, { ...good, primaryColor: "red" }, ALL)).ok).toBe(false);
    const other = await shop("ds-2");
    expect(await saveDesignSettings(db, s.id, { ...good, logoMediaId: await img(other.id) }, ALL)).toEqual({ ok: false, error: expect.stringContaining("اللوجو") });
    expect((await saveDesignSettings(db, s.id, { ...good, logoMediaId: null }, ALL)).ok).toBe(true);
  });
});
