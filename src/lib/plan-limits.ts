import type { PlanLimits } from "@/db/schema/platform";

// لو المتجر ما عنده باقة (حالة نادرة) نطبق حدود الباقة الشهرية (نص المزايا).
export const FALLBACK_LIMITS: PlanLimits = {
  maxProducts: 200, maxStaff: 2, allTemplates: true, coupons: true, reports: true, customDomain: false, pixels: false, removeBranding: false,
};

/** القالب المتاح في كل الباقات */
export const BASE_TEMPLATE = "simple";
