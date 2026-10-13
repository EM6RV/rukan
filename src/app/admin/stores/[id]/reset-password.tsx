"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { errorClass, useAct } from "@/components/dashboard/use-act";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PasswordInput } from "@/components/ui/field";
import { adminResetPasswordAction } from "../../actions";

/** البياع نسي كلمة السر: الأدمن يحط كلمة جديدة ويسلمها له (تلغي كل جلساته القديمة) */
export function ResetOwnerPassword({ userId, storeId, ownerName }: { userId: string; storeId: string; ownerName: string }) {
  const [pw, setPw] = useState("");
  const { act, pending, error } = useAct();
  return (
    <Card>
      <CardHeader title="كلمة سر المالك" description={`لو ${ownerName} نسي كلمة السر. بعد التغيير يتسجل خروجه من كل الأجهزة.`} />
      <CardBody>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); act(() => adminResetPasswordAction(userId, storeId, pw), "تم تغيير كلمة السر", () => setPw("")); }}>
          <div className="min-w-56 flex-1"><PasswordInput label="كلمة سر جديدة" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint="8 حروف على الأقل. سلّمها له بطريقة آمنة." /></div>
          <Button type="submit" variant="outline" loading={pending} disabled={pw.length < 8}><KeyRound className="size-4" aria-hidden /> تغيير</Button>
          {error && <p role="alert" className={`${errorClass} w-full`}>{error}</p>}
        </form>
      </CardBody>
    </Card>
  );
}
