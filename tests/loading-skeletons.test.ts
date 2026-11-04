import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// كل صفحة في اللوحة والأدمن لازم يكون عندها loading.tsx (هيكل تحميل بشكل المحتوى) باش التنقل يبان فوري.
// ما عدا الرئيسيتين: هذي الصفحات اللي تنفتح أول شي (بعد الدخول ومن أيقونة التطبيق)، والهيكل يأخر أول عرض للعنوان (LCP) حوالي 600ms.
const NO_SKELETON = new Set(["src/app/dashboard", "src/app/admin"]);

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? pages(p) : f === "page.tsx" ? [dirname(p)] : [];
  });
}

describe("هياكل التحميل", () => {
  it("كل صفحة عندها loading.tsx", () => {
    const missing = [...pages("src/app/dashboard"), ...pages("src/app/admin")].filter((d) => !NO_SKELETON.has(d) && !existsSync(join(d, "loading.tsx")));
    expect(missing).toEqual([]);
  });
  it("الرئيسيتين بدون هيكل (أسرع أول عرض)", () => {
    for (const d of NO_SKELETON) expect(existsSync(join(d, "loading.tsx"))).toBe(false);
  });
});
