"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PasswordInput, PhoneInput } from "@/components/ui/field";
import { loginAction } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <PhoneInput name="phone" required autoFocus defaultValue={state?.values?.phone} />
      <PasswordInput name="password" label="كلمة السر" autoComplete="current-password" required />
      {state?.error && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">{state.error}</p>
      )}
      <Button type="submit" fullWidth size="lg" loading={pending}>دخول</Button>
      <p className="text-center text-sm text-muted">
        ما عندكش حساب؟ <Link href="/register" className="font-medium text-link hover:underline">افتح متجرك مجاناً</Link>
      </p>
    </form>
  );
}
