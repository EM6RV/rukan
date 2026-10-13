import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/card";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "افتح متجرك مجاناً" };

export default function RegisterPage() {
  return (
    <Card>
      <CardBody className="space-y-5 p-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl">افتح متجرك في دقيقتين</h1>
          <p className="text-sm text-muted">تجربة مجانية، بدون بطاقة بنكية.</p>
        </div>
        <RegisterForm />
      </CardBody>
    </Card>
  );
}
