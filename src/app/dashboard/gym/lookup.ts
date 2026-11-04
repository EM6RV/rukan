"use server";

import { fail, ok } from "@/server/catalog/result";
import { findMember } from "@/server/gym/service";
import { lineActionContext } from "@/server/store-context";

/** يلقى عضو برقم هاتفه (لنقل الاشتراك) */
export async function findMemberByPhoneAction(phone: string) {
  const auth = await lineActionContext("gym", "customers");
  if (!auth.ok) return auth;
  const m = await findMember(auth.ctx.scope, String(phone).slice(0, 20));
  return m && m.status === "active" ? ok({ id: m.id, name: m.name }) : fail("ما لقينا عضو بالرقم هذا.");
}
