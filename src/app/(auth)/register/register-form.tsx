"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput, PhoneInput } from "@/components/ui/field";
import { registerAction } from "../actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <Input name="name" label="الاسم" autoComplete="name" required minLength={2} maxLength={80} autoFocus defaultValue={state?.values?.name} />
      <PhoneInput name="phone" hint="بيه تدخل لحسابك. مثال: 0912345678" required defaultValue={state?.values?.phone} />
      <PasswordInput name="password" label="كلمة السر" hint="8 حروف على الأقل" autoComplete="new-password" required minLength={8} />
      {state?.error && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">{state.error}</p>
      )}
      <Button type="submit" fullWidth size="lg" loading={pending}>إنشاء الحساب</Button>
      <p className="text-center text-sm text-muted">
        عندك حساب؟ <Link href="/login" className="font-medium text-link hover:underline">تسجيل الدخول</Link>
      </p>
    </form>
  );
}
