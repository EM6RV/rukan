// صلاحيات باقة رُكن ماركت (الحدود من اشتراك المنظومة نفسها، مش باقة المتجر)
import { canUse, type Feature } from "@/lib/entitlements";
import type { BusinessLines } from "../lines";

export const marketCan = (lines: BusinessLines, feature: Feature) => canUse(lines.market.limits ?? {}, feature);
