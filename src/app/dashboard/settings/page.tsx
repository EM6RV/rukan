import type { Metadata } from "next";
import { getEnv } from "@/lib/env";
import { storeUrl } from "@/lib/store-url";
import { requireStoreContext } from "@/server/store-context";
import { getDb } from "@/db";
import { getDeliveryConfig } from "@/server/delivery-service";
import { getWhatsappTemplates } from "@/server/orders/whatsapp-templates";
import { t } from "@/server/tenant";
import { SettingsTabs } from "./settings-tabs";

export const metadata: Metadata = { title: "الإعدادات" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const ctx = await requireStoreContext("settings");
  const { store, scope } = ctx;
  const [[s], methods, delivery, templates] = await Promise.all([scope.from(t.storeSettings).limit(1), scope.from(t.storePaymentMethods), getDeliveryConfig(getDb(), scope), getWhatsappTemplates(scope)]);
  const bank = methods.find((m) => m.method === "bank_transfer");
  const cfg = (bank?.config ?? {}) as Record<string, string | undefined>;
  const media = (id: string | null | undefined) => (id ? { id, url: `/api/media/${id}` } : null);

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl">الإعدادات</h1><p className="text-muted">معلومات متجرك وهويته وطرق الدفع.</p></div>
      <SettingsTabs
        writable={ctx.access.writable}
        defaultTab={["general", "contact", "payment", "delivery", "whatsapp", "seo"].includes(tab ?? "") ? tab! : "general"}
        allTemplates={ctx.limits.allTemplates}
        storeLink={storeUrl(store.slug, getEnv())}
        general={{ name: store.name, businessType: store.businessType, template: store.template, primary: s?.primaryColor ?? "#0D263E", accent: s?.accentColor ?? "#C19E58", logo: media(store.logoMediaId) }}
        contact={{ contactPhone: s?.contactPhone ?? "", whatsapp: s?.whatsapp ?? "", email: s?.email ?? "", address: s?.address ?? "", instagram: s?.instagram ?? "", tiktok: s?.tiktok ?? "", facebook: s?.facebook ?? "", snapchat: s?.snapchat ?? "" }}
        payment={{ bankTransfer: bank?.isEnabled ?? false, bankName: cfg.bankName ?? "", accountHolder: cfg.accountHolder ?? "", accountNumber: cfg.accountNumber ?? "", note: cfg.note ?? "" }}
        delivery={delivery}
        whatsapp={{ templates }}
        seo={{ seoTitle: s?.seoTitle ?? "", seoDescription: s?.seoDescription ?? "", og: media(s?.ogMediaId) }}
      />
    </div>
  );
}

