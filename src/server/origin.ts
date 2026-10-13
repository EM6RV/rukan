/** حماية CSRF لمسارات الـ API (الـ Server Actions عندها حماية Origin مدمجة في Next). */
export function sameOriginError(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return Response.json({ error: "طلب غير مسموح." }, { status: 403 });
  try {
    if (new URL(origin).host !== host) throw new Error("mismatch");
  } catch {
    return Response.json({ error: "طلب غير مسموح." }, { status: 403 });
  }
  return null;
}
