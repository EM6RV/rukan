import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const sp = await searchParams;
  return (
    <Card>
      <CardBody className="space-y-5 p-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl">أهلاً بيك من جديد</h1>
          <p className="text-sm text-muted">ادخل برقم هاتفك وكلمة السر.</p>
        </div>
        {sp.reset === "1" && <p role="status" className="rounded-md bg-success/10 px-3 py-2 text-sm text-success-fg">تم تغيير كلمة السر. ادخل بالجديدة.</p>}
        <LoginForm />
      </CardBody>
    </Card>
  );
}
