import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { getDb } from "@/db";
import { checkResetToken } from "@/server/auth/password-reset";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "كلمة سر جديدة", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await checkResetToken(getDb(), token);
  return (
    <Card>
      <CardBody className="space-y-5 p-6">
        {r.ok ? (
          <>
            <div className="space-y-1 text-center">
              <h1 className="text-2xl">أهلاً {r.data.name}</h1>
              <p className="text-sm text-muted">اكتب كلمة السر الجديدة (8 حروف على الأقل).</p>
            </div>
            <ResetForm token={token} />
          </>
        ) : (
          <div className="space-y-4 text-center" role="alert">
            <h1 className="text-2xl">الرابط ما يشتغلش</h1>
            <p className="text-sm leading-7 text-muted">{r.error}</p>
            <Link href="/forgot-password" className="inline-flex h-11 items-center rounded-md bg-gold px-5 font-semibold text-navy hover:brightness-95">اطلب رابط جديد</Link>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
