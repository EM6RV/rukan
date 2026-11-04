/** حركة دخول ناعمة لكل صفحة في اللوحة (تتكرر مع كل تنقل). تتعطل تلقائياً مع «تقليل الحركة». */
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-[fade-up_0.28s_ease-out_both]">{children}</div>;
}
