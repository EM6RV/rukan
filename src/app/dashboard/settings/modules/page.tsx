import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { STORE_MODULE_INFO, STORE_MODULES } from "@/lib/constants";
import { availableFor, moduleState } from "@/server/modules";
import { requireStoreContext } from "@/server/store-context";
import { ModuleList } from "./module-list";

export const metadata: Metadata = { title: "الوحدات" };

export default async function ModulesPage() {
  const ctx = await requireStoreContext("settings");
  const modules = STORE_MODULES.map((key) => ({ key, ...STORE_MODULE_INFO[key], state: moduleState(ctx.store.enabledModules, ctx.limits, key, availableFor(ctx.store)) }));
  return (
    <div className="space-y-5">
      <Link href="/dashboard/settings" className="inline-flex items-center gap-1 text-sm text-link hover:underline"><ChevronRight className="size-4" aria-hidden />الإعدادات</Link>
      <div><h1 className="text-2xl">الوحدات</h1><p className="text-muted">شغّل اللي تحتاجه بس. الوحدة المطفية تختفي من القائمة، وبياناتها تبقى محفوظة لو رجعت فعّلتها.</p></div>
      <ModuleList modules={modules} writable={ctx.access.writable} />
    </div>
  );
}
