"use client";

import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl">صار خطأ غير متوقع</h1>
      <p className="text-muted">جرّب مرة ثانية، ولو استمر الخطأ كلمنا.</p>
      <Button onClick={reset}>إعادة المحاولة</Button>
    </main>
  );
}
