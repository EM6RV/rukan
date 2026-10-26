import Link from "next/link";
import { Lock, PowerOff } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { STORE_MODULE_INFO, type StoreModule } from "@/lib/constants";
import { moduleState } from "@/server/modules";
import type { StoreContext } from "@/server/store-context";

/**
 * بوابة وحدة اختيارية: لو الوحدة مش شغّالة (مطفية أو خارج الباقة) ترجع صفحة شرح بدل المحتوى.
 * الاستعمال: const gate = moduleGate(ctx, "warehouses"); if (gate) return gate;
 */
export function moduleGate(ctx: Pick<StoreContext, "store" | "limits">, key: StoreModule) {
  const state = moduleState(ctx.store.enabledModules, ctx.limits, key);
  if (state === "on") return null;
  const info = STORE_MODULE_INFO[key];
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-line bg-surface px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-surface-2">{state === "locked" ? <Lock className="size-6" aria-hidden /> : <PowerOff className="size-6" aria-hidden />}</div>
      <h1 className="text-xl">{info.title}</h1>
      <p className="max-w-sm leading-7 text-muted">{info.description}</p>
      {state === "locked" ? (
        <><p className="text-sm">الوحدة هذي مش في باقتك الحالية.</p><ButtonLink href="/dashboard/billing">رقّي باقتك</ButtonLink></>
      ) : (
        <><p className="text-sm">الوحدة مطفية. فعّلها من الإعدادات وبياناتك تبقى محفوظة.</p><ButtonLink href="/dashboard/settings/modules">تفعيل الوحدة</ButtonLink></>
      )}
      <Link href="/dashboard" className="text-sm text-link hover:underline">رجوع للرئيسية</Link>
    </div>
  );
}
