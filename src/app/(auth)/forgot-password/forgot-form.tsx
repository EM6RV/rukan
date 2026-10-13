"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/field";
import { forgotPasswordAction } from "../actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, undefined);

  if (state?.sent) {
    return (
      <div className="space-y-4 text-center" role="status">
        <CheckCircle2 className="mx-auto size-10 text-success-fg" aria-hidden />
        <p className="font-semibold">وصلنا طلبك</p>
        <p className="text-sm leading-7 text-muted">لو الرقم <bdi dir="ltr">{state.sent.phone}</bdi> مسجّل عندنا، فريق رُكن يتواصل معاك على واتساب برابط الاسترجاع. الرابط صالح ساعة ولمرة وحدة.</p>
        {state.sent.supportUrl && (
          <a href={state.sent.supportUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-gold px-5 font-semibold text-navy hover:brightness-95">
            <MessageCircle className="size-5" aria-hidden /> كلّم الدعم على واتساب
          </a>
        )}
        <p className="text-sm"><Link href="/login" className="font-medium text-link hover:underline">رجوع لتسجيل الدخول</Link></p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <PhoneInput name="phone" required autoFocus />
      {state?.error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">{state.error}</p>}
      <Button type="submit" fullWidth size="lg" loading={pending}>أرسل الطلب</Button>
      <p className="text-center text-sm"><Link href="/login" className="font-medium text-link hover:underline">رجوع لتسجيل الدخول</Link></p>
    </form>
  );
}
