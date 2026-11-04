import { formatDateTime } from "@/lib/datetime";

export const bookingMessage = (b: { name: string; station: string; startsAt: number; minutes: number; shop?: string }) =>
  `مرحبا ${b.name}، حجزك${b.shop ? ` في ${b.shop}` : ""} مأكد ✅\nالجهاز: ${b.station}\nالوقت: ${formatDateTime(b.startsAt)} (${b.minutes} دقيقة)\nلو تأخرت أكثر من ربع ساعة الحجز يتلغى. نستنوك!`;
