import type { PlanLimits } from "@/db/schema/platform";

// لو المتجر ما عنده باقة (حالة نادرة) نطبق حدود «اقتصادية».
export const FALLBACK_LIMITS: PlanLimits = {
  maxProducts: 50, maxStaff: 1, allTemplates: false, coupons: false, reports: false, customDomain: false, pixels: false, removeBranding: false,
};

/** القالب المتاح في كل الباقات */
export const BASE_TEMPLATE = "simple";
