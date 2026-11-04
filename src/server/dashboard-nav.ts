import { navFor, type NavItem } from "@/lib/dashboard-nav";
import { isModuleOn } from "./modules";
import { hasPermission } from "./permissions";
import type { StoreContext } from "./store-context";

/** صفحات اللوحة المسموحة للموظف الحالي (صلاحياته + المندوبين + الوحدات المفعّلة) */
export const dashboardNav = (ctx: Pick<StoreContext, "role" | "store" | "limits"> & { lines?: StoreContext["lines"] }): NavItem[] =>
  navFor({
    can: (p) => hasPermission(ctx, p),
    useCouriers: ctx.store.useCouriers,
    isCourier: ctx.role === "courier",
    moduleOn: (m) => isModuleOn(ctx.store, ctx.limits, m),
    // نشاط بدون سطور منظومات (قديم) = متجر أونلاين
    hasLine: (l) => (ctx.lines ? ctx.lines[l].subscribed : l === "store"),
  });
