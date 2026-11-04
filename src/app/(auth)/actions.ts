"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { toWhatsappNumber } from "@/lib/phone";
import { waLink } from "@/lib/whatsapp";
import { getMarketingData } from "@/server/admin/site-cache";
import { completePasswordReset, requestPasswordReset } from "@/server/auth/password-reset";
import { authenticate, registerUser } from "@/server/auth/service";
import { endSession, getClientIp, startSession } from "@/server/auth/current";

// نرجّع القيم المدخلة (بدون كلمة السر) لأن React 19 يمسح الفورم بعد كل action
export type FormState = { error?: string; values?: { name?: string; phone?: string } } | undefined;

export type ForgotState = { error?: string; sent?: { phone: string; supportUrl: string | null } } | undefined;
export type ResetState = { error?: string } | undefined;

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
  redirect("/onboarding");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

/** «نسيت كلمة السر»: يفتح طلب للأدمن (الرد دايماً نفسه علشان ما نكشفش الأرقام المسجلة) */
export async function forgotPasswordAction(_: ForgotState, formData: FormData): Promise<ForgotState> {
  const r = await requestPasswordReset(getDb(), { phone: formData.get("phone") }, await getClientIp());
  if (!r.ok) return { error: r.error };
  const { supportWhatsapp } = await getMarketingData();
  const support = supportWhatsapp ? toWhatsappNumber(supportWhatsapp) : null;
  const text = `السلام عليكم، نسيت كلمة السر لحسابي في رُكن (رقمي ${r.data.phone}). ممكن تساعدوني؟`;
  return { sent: { phone: r.data.phone, supportUrl: support ? waLink(support, text) : null } };
}

/** تعيين كلمة سر جديدة برابط الاسترجاع (التوكن يجي من الرابط، مش من الفورم) */
export async function resetPasswordAction(token: string, _: ResetState, formData: FormData): Promise<ResetState> {
  const password = str(formData.get("password"));
  if (password !== str(formData.get("confirm"))) return { error: "كلمتا السر مش متطابقتين." };
  const r = await completePasswordReset(getDb(), token, password, await getClientIp());
  if (!r.ok) return { error: r.error };
  redirect("/login?reset=1");
}
