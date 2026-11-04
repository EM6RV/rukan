import { ViewTransition } from "react";

/** انتقال ناعم بين صفحات اللوحة (View Transitions): المحتوى الجديد يبان فوراً بدون ما يتأخر بحركة دخول. */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <ViewTransition default="page">{children}</ViewTransition>;
}
