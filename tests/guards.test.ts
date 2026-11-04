import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

// حارس أمني آلي: يمنع نسيان التحقق من الصلاحيات في أي action أو route جديد.

const APP = join(process.cwd(), "src/app");
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p]; });
const all = files(APP);
const rel = (p: string) => relative(process.cwd(), p).replaceAll("\\", "/");
const read = (p: string) => readFileSync(p, "utf8");

const ACTION_FILES = all.filter((p) => /actions?\.ts$/.test(p) || /-actions\.ts$/.test(p));
const ROUTES = all.filter((p) => p.endsWith("/route.ts"));
const AUTH_CALL = /(actionContext|adminContext|getCurrentUser|requireAdmin|requireStoreContext|runOwner\(|\brun\()/;

/** أكشنات عامة مقصودة (واجهة المتجر للزباين بدون حساب، والدخول/التسجيل): لازم تكون محمية بـ rate limit بدل الصلاحيات */
const PUBLIC_ACTIONS: Record<string, RegExp> = {
  "src/app/s/[key]/actions.ts": /hitRateLimit/,
  "src/app/(auth)/actions.ts": /(registerUser|authenticate|endSession)/, // الـ rate limit داخل خدمة auth
};

/** مسارات API عامة مقصودة وسبب كونها آمنة */
const PUBLIC_ROUTES: Record<string, RegExp> = {
  "src/app/api/health/route.ts": /./, // فحص صحة بدون بيانات
  "src/app/api/media/[id]/route.ts": /isPrivate/, // الصور العامة فقط؛ الخاصة (إيصالات) تتحقق من العضوية
  "src/app/api/s/[key]/receipt/route.ts": /hitRateLimit/, // رفع إيصال من الزبون: rate limit + CSRF
  "src/app/s/[key]/robots.txt/route.ts": /./, "src/app/s/-/sitemap.xml/route.ts": /./, "src/app/s/[key]/sitemap.xml/route.ts": /./,
};

describe("حارس صلاحيات الـ server actions", () => {
  it("اكتشاف الملفات", () => {
    expect(ACTION_FILES.length).toBeGreaterThanOrEqual(10);
    expect(ROUTES.length).toBeGreaterThanOrEqual(8);
  });

  it.each(ACTION_FILES.map((p) => [rel(p), p]))("%s: كل دالة مصدّرة تمر عبر تحقق صلاحية", (name, path) => {
    const src = read(path as string);
    if (!/^["']use server["']/m.test(src)) return;
    if (PUBLIC_ACTIONS[name as string]) {
      expect(src, `${name} لازم يحتوي الحماية المعلنة`).toMatch(PUBLIC_ACTIONS[name as string]!);
      return;
    }
    const isAdmin = (name as string).startsWith("src/app/admin/");
    expect(src, `${name}: لازم يستعمل ${isAdmin ? "adminContext" : "actionContext/getCurrentUser"}`).toMatch(isAdmin ? /adminContext\(/ : /(actionContext|getCurrentUser)\(/);
    const parts = src.split(/export async function /).slice(1);
    expect(parts.length, `${name}: ما فيه دوال مصدّرة؟`).toBeGreaterThan(0);
    for (const part of parts) {
      const fn = part.slice(0, part.indexOf("("));
      // كل دالة تنادي helper الصلاحيات (run/runOwner/actionContext/adminContext/getCurrentUser) في جسمها
      const body = part.slice(0, part.search(/\nexport |\n\/\/ =====|$/) === -1 ? undefined : part.search(/\nexport |\n\/\/ =====|$/));
      expect(body, `${name}: الدالة ${fn} بدون تحقق صلاحية`).toMatch(AUTH_CALL);
    }
  });

  it("ملفات use server تصدّر دوال async بس (لا ثوابت ولا objects)", () => {
    for (const p of ACTION_FILES) {
      const src = read(p);
      if (!/^["']use server["']/m.test(src)) continue;
      expect(src, `${rel(p)} يصدّر غير دالة async`).not.toMatch(/^export (const|let|var|class|function|type=)/m);
    }
  });
});

describe("حارس مسارات الـ API", () => {
  it.each(ROUTES.map((p) => [rel(p), p]))("%s: محمي أو مصرّح بعموميته", (name, path) => {
    const src = read(path as string);
    if (PUBLIC_ROUTES[name as string]) {
      expect(src, `${name}: الحماية المعلنة ناقصة`).toMatch(PUBLIC_ROUTES[name as string]!);
    } else {
      expect(src, `${name}: مسار بدون تحقق صلاحية ولا هو في قائمة العام`).toMatch(/(actionContext|adminContext|getCurrentUser|requireAdmin)\(/);
    }
    // أي مسار يغيّر بيانات (POST/PUT/DELETE/PATCH) لازم يفحص الأصل (CSRF)
    if (/export async function (POST|PUT|PATCH|DELETE)/.test(src)) expect(src, `${name}: يغيّر بيانات بدون sameOriginError`).toMatch(/sameOriginError\(/);
  });

  it("مسارات GET الحساسة مفحوصة (تصدير/نبضة)", () => {
    for (const p of ROUTES.filter((r) => /export|pulse/.test(r))) expect(read(p)).toMatch(/actionContext\(/);
  });
});

describe("حماية إضافية", () => {
  it("لا يوجد dangerouslySetInnerHTML إلا للـ JSON-LD المهرّب وسكربت الثيم", () => {
    for (const p of all.filter((f) => f.endsWith(".tsx"))) {
      const src = read(p);
      for (const m of src.matchAll(/dangerouslySetInnerHTML=\{\{ __html: ([^}]+)\}\}/g)) expect(m[1], `${rel(p)}`).toMatch(/safeJsonLd|themeScript/);
    }
  });

  it("صفحة نظام التصميم مقفولة في الإنتاج", () => {
    expect(read(join(APP, "design-system/page.tsx"))).toMatch(/NODE_ENV === "production"\) notFound\(\)/);
  });

  it("لوحة الأدمن مقفولة بـ requireAdmin على مستوى الـ layout", () => {
    expect(read(join(APP, "admin/layout.tsx"))).toMatch(/requireAdmin\(\)/);
  });

  it("لوحة البياع مقفولة بـ requireStoreContext على مستوى الـ layout، وصفحة الطباعة", () => {
    expect(read(join(APP, "dashboard/layout.tsx"))).toMatch(/requireStoreContext\(/);
    expect(read(join(APP, "print/orders/[id]/page.tsx"))).toMatch(/requireStoreContext\(/);
  });

  it("كل صفحات dashboard تحدد صلاحيتها (requireStoreContext بصلاحية صريحة)", () => {
    for (const p of all.filter((f) => /dashboard\/.+page\.tsx$/.test(f) && !f.includes("/onboarding/"))) {
      expect(read(p), `${rel(p)} بدون requireStoreContext`).toMatch(/requireStoreContext\(("[a-z]+")/);
    }
  });
});

describe("حقن الصيغ في CSV", () => {
  it("النص اللي يبدا بـ = + - @ يتحول لنص", () => {
    const csv = toCsv([["=HYPERLINK(\"http://evil\")", "+1+1", "-2", "@SUM(A1)", "عادي", "0912345678"], [5, -7, 1.5]]);
    expect(csv).toContain("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csv).toContain("'+1+1");
    expect(csv).toContain("'-2");
    expect(csv).toContain("'@SUM(A1)");
    expect(csv).toContain(",عادي,0912345678");
    expect(csv).toContain("5,-7,1.5"); // الأرقام الحقيقية ما تتأثرش
  });
});
