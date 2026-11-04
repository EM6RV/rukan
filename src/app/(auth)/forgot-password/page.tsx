import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/card";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "نسيت كلمة السر" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardBody className="space-y-5 p-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl">نسيت كلمة السر؟</h1>
          <p className="text-sm text-muted">اكتب رقم هاتفك، وفريق رُكن يتواصل معاك على واتساب برابط تغيّر منه كلمة السر.</p>
        </div>
        <ForgotForm />
      </CardBody>
    </Card>
  );
}
