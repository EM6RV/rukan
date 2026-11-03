// إعدادات الكاشير لكل نشاط (تتخزن في store_settings.pos_config)
import { DEFAULT_SCALE, type ScaleConfig } from "./barcode";

export type PosConfig = {
  /** عرض ورق الطابعة الحرارية */
  paperWidth?: 58 | 80;
  /** خصم فوق النسبة هذي يحتاج موافقة المشرف (PIN) */
  maxDiscountPercent?: number;
  /** نسبة نقاط الولاء من المشتريات (نقطة لكل دينار × النسبة)، 0 = مطفي */
  loyaltyPercent?: number;
  /** قيمة النقطة بالدرهم عند الصرف */
  pointValue?: number;
  /** حد الدين الافتراضي لكل زبون بالدرهم (null = بدون حد) */
  defaultCreditLimit?: number | null;
  /** تنبيه الدين اللي طال بدون سداد (أيام) */
  debtAlertDays?: number;
  /** يطبع لوجو المحل في الفاتورة */
  showLogo?: boolean;
  /** باركود الميزان (البادئات، أرقام الصنف، وزن أو سعر) */
  scale?: ScaleConfig;
  /** اقتراح الشراء: يغطي كم يوم من البيع */
  reorderCoverDays?: number;
};

export const POS_DEFAULTS = {
  paperWidth: 58, maxDiscountPercent: 10, loyaltyPercent: 0, pointValue: 100, defaultCreditLimit: null, debtAlertDays: 30, showLogo: true,
  scale: DEFAULT_SCALE, reorderCoverDays: 14,
} as const satisfies Required<PosConfig>;
