"use client";

// التغليف بالعرض السريع لازم يصير في وحدة عميل (withQuickView دالة عميل، ما تنفع تتنادى من السيرفر)
import { withQuickView } from "../quick-view";
import { ProductCard as Hikaya } from "./hikaya";
import { ProductCard as Lamsa } from "./lamsa";
import { ProductCard as Makhmal } from "./makhmal";
import { ProductCard as Nabd } from "./nabd";
import { ProductCard as Naqa } from "./naqa";
import { ProductCard as Souq } from "./souq";

export const NaqaQuickCard = withQuickView(Naqa);
export const MakhmalQuickCard = withQuickView(Makhmal);
export const NabdQuickCard = withQuickView(Nabd);
export const SouqQuickCard = withQuickView(Souq);
export const HikayaQuickCard = withQuickView(Hikaya);
export const LamsaQuickCard = withQuickView(Lamsa);
