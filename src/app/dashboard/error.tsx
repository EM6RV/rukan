"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/feedback";

/** خطأ داخل اللوحة: القائمة الجانبية تبقى شغالة والبياع يقدر يعيد المحاولة أو يرجع للرئيسية */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <ErrorState onRetry={reset} homeHref="/dashboard" code={error.digest} />;
}
