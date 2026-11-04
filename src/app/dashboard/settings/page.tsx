import { canUse } from "@/lib/entitlements";
import type { Metadata } from "next";
import Link from "next/link";
import { Blocks } from "lucide-react";
import { getEnv } from "@/lib/env";
import { storeUrl } from "@/lib/store-url";
import { currentRequest } from "@/server/request-origin";
import { requireStoreContext } from "@/server/store-context";
import { getDb } from "@/db";
import { getStoreDomain } from "@/server/domains";
import { hasPermission } from "@/server/permissions";
import { getDeliveryConfig } from "@/server/delivery-service";
import { getWhatsappTemplates } from "@/server/orders/whatsapp-templates";
import { t } from "@/server/tenant";
import { SettingsTabs } from "./settings-tabs";

export const metadata: Metadata = { title: "الإعدادات" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const ctx = await requireStoreContext("settings");
  const { store, scope } = ctx;
  const [[s], methods, delivery, templates, domain] = await Promise.all([scope.from(t.storeSettings).limit(1), scope.from(t.storePaymentMethods), getDeliveryConfig(getDb(), scope), getWhatsappTemplates(scope), getStoreDomain(getDb(), store.id)]);
  const bank = methods.find((m) => m.method === "bank_transfer");
  const cfg = (bank?.config ?? {}) as Record<string, string | undefined>;
  const media = (id: string | null | undefined) => (id ? { id, url: `/api/media/${id}?w=320` } : null);

  const req = await currentRequest();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl">الإعدادات</h1><p className="text-muted">معلومات متجرك وهويته وطرق الدفع.</p></div>
        <Link href="/dashboard/settings/modules" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-semibold hover:border-fg/25"><Blocks className="size-4" aria-hidden />الوحدات</Link>
      </div>
      <SettingsTabs
        writable={ctx.access.writable}
        defaultTab={["general", "contact", "payment", "delivery", "whatsapp", "pixels", "domain", "seo"].includes(tab ?? "") ? tab! : "general"}
        allTemplates={canUse(ctx.limits, "allTemplates")}
        storeLink={storeUrl(store.slug, getEnv(), req)}
        general={{ name: store.name, businessType: store.businessType, template: store.template, primary: s?.primaryColor ?? "#0D263E", accent: s?.accentColor ?? "#C19E58", logo: media(store.logoMediaId) }}
        contact={{ contactPhone: s?.contactPhone ?? "", whatsapp: s?.whatsapp ?? "", email: s?.email ?? "", address: s?.address ?? "", instagram: s?.instagram ?? "", tiktok: s?.tiktok ?? "", facebook: s?.facebook ?? "", snapchat: s?.snapchat ?? "" }}
        payment={{ bankTransfer: bank?.isEnabled ?? false, bankName: cfg.bankName ?? "", accountHolder: cfg.accountHolder ?? "", accountNumber: cfg.accountNumber ?? "", note: cfg.note ?? "" }}
        delivery={{ ...delivery, useCouriers: store.useCouriers }}
        domain={{ allowed: canUse(ctx.limits, "customDomain"), canManage: hasPermission(ctx, "billing"), target: (getEnv().CUSTOM_DOMAIN_TARGET || `cname.${getEnv().ROOT_DOMAIN}`).toLowerCase(), current: domain }}
        whatsapp={{ templates }}
        pixels={{ metaPixelId: s?.metaPixelId ?? "", tiktokPixelId: s?.tiktokPixelId ?? "", allowed: canUse(ctx.limits, "pixels") }}
        seo={{ seoTitle: s?.seoTitle ?? "", seoDescription: s?.seoDescription ?? "", og: media(s?.ogMediaId) }}
      />
    </div>
  );
}

