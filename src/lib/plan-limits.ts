import type { PlanLimits } from "@/db/schema/platform";
import { STARTER_LIMITS } from "./plan-catalog";

// لو المتجر ما عنده باقة (حالة نادرة) نطبق حدود باقة «بداية».
export const FALLBACK_LIMITS: PlanLimits = STARTER_LIMITS;

/** القالب المتاح في كل الباقات */
export const BASE_TEMPLATE = "simple";
