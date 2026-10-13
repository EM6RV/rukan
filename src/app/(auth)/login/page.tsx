import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default function LoginPage() {
  return (
    <Card>
      <CardBody className="space-y-5 p-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl">أهلاً بيك من جديد</h1>
          <p className="text-sm text-muted">ادخل برقم هاتفك وكلمة السر.</p>
        </div>
        <LoginForm />
      </CardBody>
    </Card>
  );
}
