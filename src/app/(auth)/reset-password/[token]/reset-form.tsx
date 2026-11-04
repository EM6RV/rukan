"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/field";
import { resetPasswordAction } from "../../actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction.bind(null, token), undefined);
  return (
    <form action={action} className="space-y-4">
      <PasswordInput name="password" label="كلمة السر الجديدة" autoComplete="new-password" required minLength={8} autoFocus />
      <PasswordInput name="confirm" label="أعد كتابة كلمة السر" autoComplete="new-password" required minLength={8} />
      {state?.error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger-fg">{state.error}</p>}
      <Button type="submit" fullWidth size="lg" loading={pending}>احفظ كلمة السر</Button>
    </form>
  );
}
