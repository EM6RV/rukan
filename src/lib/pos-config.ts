// إعدادات الكاشير لكل نشاط (تتخزن في store_settings.pos_config)
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
};

export const POS_DEFAULTS = { paperWidth: 58, maxDiscountPercent: 10, loyaltyPercent: 0, pointValue: 100, defaultCreditLimit: null, debtAlertDays: 30, showLogo: true } as const satisfies Required<PosConfig>;
