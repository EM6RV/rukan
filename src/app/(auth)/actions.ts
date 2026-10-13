"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { authenticate, registerUser } from "@/server/auth/service";
import { endSession, getClientIp, startSession } from "@/server/auth/current";

// نرجّع القيم المدخلة (بدون كلمة السر) لأن React 19 يمسح الفورم بعد كل action
export type FormState = { error?: string; values?: { name?: string; phone?: string } } | undefined;

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  const result = await authenticate(
    getDb(),
    { phone: formData.get("phone"), password: formData.get("password") },
    await getClientIp(),
  );
  if (!result.ok) return { error: result.error, values: { phone: str(formData.get("phone")) } };
  await startSession(result.data.userId);
  redirect("/dashboard");
}

export async function registerAction(_: FormState, formData: FormData): Promise<FormState> {
  const result = await registerUser(
    getDb(),
    { name: formData.get("name"), phone: formData.get("phone"), password: formData.get("password") },
    await getClientIp(),
  );
  if (!result.ok) {
    return { error: result.error, values: { name: str(formData.get("name")), phone: str(formData.get("phone")) } };
  }
  await startSession(result.data.userId);
  redirect("/dashboard");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
