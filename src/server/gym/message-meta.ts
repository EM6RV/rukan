// ثوابت رسائل النادي (آمنة للعميل: بدون اعتماد على السيرفر)
export const GYM_MESSAGE_KINDS = ["expiring", "expired", "installment", "absent", "birthday", "welcome", "class_confirm"] as const;
export type GymMessageKind = (typeof GYM_MESSAGE_KINDS)[number];
export const GYM_VARS = ["name", "days", "date", "amount", "store", "class", "time", "plan"] as const;
export const GYM_MESSAGE_LABELS: Record<GymMessageKind, string> = {
  expiring: "اشتراكك يخلص قريب", expired: "انتهى اشتراكك", installment: "قسطك مستحق", absent: "ما شفناكش من فترة", birthday: "عيد ميلاد سعيد", welcome: "ترحيب بعضو جديد", class_confirm: "تأكيد حجز حصة",
};
export type TodayMessage = { memberId: string; name: string; phone: string; kind: GymMessageKind; refId: string; text: string; link: string | null };
