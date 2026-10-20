import { navFor, type NavItem } from "@/lib/dashboard-nav";
import { isModuleOn } from "./modules";
import { can } from "./permissions";
import type { StoreContext } from "./store-context";

/** صفحات اللوحة المسموحة للموظف الحالي (صلاحياته + المندوبين + الوحدات المفعّلة) */
export const dashboardNav = (ctx: Pick<StoreContext, "role" | "store" | "limits">): NavItem[] =>
  navFor({
    can: (p) => can(ctx.role, p),
    useCouriers: ctx.store.useCouriers,
    isCourier: ctx.role === "courier",
    moduleOn: (m) => isModuleOn(ctx.store, ctx.limits, m),
  });
