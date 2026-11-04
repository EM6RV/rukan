import { isModuleOn } from "../modules";
import type { StoreContext } from "../store-context";
import { defaultAccountId } from "./ledger";

/** حساب الدفتر اللي تدخله حركة أوتوماتيكية (الخزنة/البنك). null لو وحدة الحسابات مطفية أو مش في الباقة. */
export async function ledgerAccountFor(ctx: Pick<StoreContext, "store" | "limits" | "scope">, kind: "cash" | "bank"): Promise<string | null> {
  if (!isModuleOn(ctx.store, ctx.limits, "accounting")) return null;
  return defaultAccountId(ctx.scope, kind);
}
