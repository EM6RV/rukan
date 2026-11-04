import type { Metadata } from "next";
import { dashboardNav } from "@/server/dashboard-nav";
import { requireStoreContext } from "@/server/store-context";
import { MenuGrid } from "./menu-grid";

export const metadata: Metadata = { title: "القائمة" };

export default async function MenuPage() {
  // كل الأدوار عندها «الطلبيات» (حتى المندوب)، والعناصر نفسها تتفلتر حسب صلاحيات كل موظف
  const ctx = await requireStoreContext("orders");
  return (
    <div className="space-y-5">
      <h1 className="text-2xl">القائمة</h1>
      <MenuGrid items={dashboardNav(ctx)} />
    </div>
  );
}
