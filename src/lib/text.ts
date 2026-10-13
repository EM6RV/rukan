export function excerpt(text: string | null | undefined, max = 160): string | undefined {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** JSON-LD آمن للحقن في <script>: نمنع إغلاق الوسم من داخل البيانات */
export const safeJsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
