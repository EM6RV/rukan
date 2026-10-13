// يحول الاسم (عربي أو إنجليزي) لرابط: حروف وأرقام وشرطات. الحروف العربية تبقى كما هي.
const DIACRITICS = /[ً-ٰٟـ]/g; // تشكيل وتطويل

export function slugify(input: string, max = 60): string {
  const slug = input
    .normalize("NFKC")
    .toLowerCase()
    .replace(DIACRITICS, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return slug;
}

/** يرجع slug فريد مقارنة بالمستعمل: base, base-2, base-3… */
export function uniqueSlug(base: string, taken: Set<string>): string {
  const root = base || "item";
  if (!taken.has(root)) return root;
  for (let i = 2; ; i++) {
    const candidate = `${root}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}
