import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import adminManifest from "@/app/admin/manifest";
import storeManifest from "@/app/manifest";

describe("تطبيق الأدمن على الشاشة الرئيسية (PWA مستقل)", () => {
  const a = adminManifest();
  const s = storeManifest();

  it("manifest مستقل: id وبداية ونطاق /admin وأسماء مختلفة عن لوحة المتجر", () => {
    expect(a).toMatchObject({ id: "/admin", start_url: "/admin", scope: "/admin", display: "standalone", dir: "rtl", lang: "ar" });
    expect(a.id).not.toBe(s.id);
    expect(a.start_url).not.toBe(s.start_url);
    expect(a.name).not.toBe(s.name);
    expect(a.short_name).not.toBe(s.short_name);
  });

  it("كل روابط الاختصارات داخل /admin، والأيقونات موجودة ومختلفة عن أيقونات المتجر", () => {
    for (const sc of a.shortcuts ?? []) expect(sc.url.startsWith("/admin")).toBe(true);
    const srcs = (a.icons ?? []).map((i) => i.src);
    expect(srcs).toEqual(["/icons/admin-192.png", "/icons/admin-512.png", "/icons/admin-maskable-512.png"]);
    for (const src of srcs) expect(existsSync(join(process.cwd(), "public", src)), src).toBe(true);
    for (const i of s.icons ?? []) expect(srcs).not.toContain(i.src);
    expect((a.icons ?? []).some((i) => i.purpose === "maskable")).toBe(true);
  });
});
